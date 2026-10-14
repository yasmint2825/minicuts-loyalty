// Run: node tests/e2e_demo.js — practice mode (?demo=1): whole flow works and NOTHING reaches Supabase
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; let leaked = 0; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', route => { const u = route.request().url();
    if (/supabase\.co/.test(u)) { leaked++; return route.abort(); }
    if (/cdnjs.*jspdf/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.JSPDF) });
    if (u.startsWith('file:')) return route.continue(); return route.fulfill({ status: 200, contentType: 'text/plain', body: '' }); });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('file://' + ROOT + '/minicuts-staff.html?demo=1'); await pg.waitForTimeout(1200);
  ok(/PRACTICE MODE/.test(await pg.innerText('body')), 'banner shows practice mode');
  ok(/Aisha/.test(await pg.innerText('body')) && /Mia/.test(await pg.innerText('body')), 'queue shows practice customers');
  // checkout Mia (called) with Girls Haircut 60, 10% off
  await pg.evaluate(() => MC.billing.openCheckout('q2')); await pg.waitForSelector('#mcc-svcname');
  await pg.fill('#mcc-svcname', 'Girls Hair'); await pg.waitForSelector('#mcc-list [data-i]');
  await pg.evaluate(() => { const i = MC.billing.services.findIndex(x => x.name === 'Girls Haircut'); document.querySelector('#mcc-list [data-i="' + i + '"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await pg.click('.mc-chip[data-p="10"]'); await pg.click('.mc-pay[data-v="Cash"]'); await pg.click('#mcc-issue'); await pg.waitForTimeout(1500);
  const inv = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).invoices[0]);
  ok(inv && inv.invoice_number === 'MC/2026/00001' && inv.payable_amount === 54, 'practice invoice issued ' + (inv && inv.invoice_number + ' ' + inv.payable_amount));
  // reload: data persists
  await pg.reload(); await pg.waitForTimeout(1000);
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).invoices.length)) === 1, 'practice data survives reload');
  const demoLeaks = leaked;
  // without ?demo=1 the file is inert
  const p2 = await b.newPage(); await p2.route('**/*', r => { if (/supabase\.co/.test(r.request().url())) { leaked += 1000; return r.abort(); } return r.request().url().startsWith('file:') ? r.continue() : r.fulfill({ status: 200, body: '' }); });
  await p2.goto('file://' + ROOT + '/minicuts-staff.html'); await p2.waitForTimeout(800);
  ok(!/PRACTICE MODE/.test(await p2.innerText('body')) && leaked >= 1000, 'without ?demo=1 the real system is used (no practice mode)');
  ok(demoLeaks === 0, 'practice mode made zero real Supabase calls (' + demoLeaks + ')');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 2))); await b.close();
})();
