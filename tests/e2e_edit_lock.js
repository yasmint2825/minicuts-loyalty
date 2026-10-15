// Run: node tests/e2e_edit_lock.js — History "Edit" must not change revenue, tip or payment
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', r => { const u = r.request().url(); if (/cdnjs.*jspdf/.test(u)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.JSPDF) }); return u.startsWith('file:') ? r.continue() : r.fulfill({ status: 200, contentType: 'text/plain', body: '' }); });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  await pg.goto('file://' + ROOT + '/minicuts-staff.html?demo=1'); await pg.waitForTimeout(1200);
  // make a legacy-style done record WITHOUT an invoice, with revenue, so the old code would have allowed editing
  await pg.evaluate(async () => { await MC.sb('queue', 'PATCH', { status: 'done', service_value: 60, tip: 5, payment_type: 'Cash', invoice_id: null }, 'id=eq.q2'); });
  await pg.evaluate(() => { _histData = [Object.assign({}, _qdata.find(x => x.id === 'q2'), { status: 'done', service_value: 60, tip: 5, payment_type: 'Cash', invoice_id: null })]; editHistRow('q2'); });
  await pg.waitForSelector('#eh-val');
  ok(await pg.$eval('#eh-val', e => e.disabled) && await pg.$eval('#eh-tip', e => e.disabled) && await pg.$eval('#eh-pmt', e => e.disabled), 'value, tip and payment are locked even without an invoice');
  await pg.fill('#eh-rem', 'note only'); await pg.evaluate(() => saveHistEdit('q2', document.querySelector('button[onclick^="saveHistEdit"]'))); await pg.waitForTimeout(600);
  const row = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).queue.find(x => x.id === 'q2'));
  ok(row.remark === 'note only' && row.service_value === 60 && row.tip === 5 && row.payment_type === 'Cash', 'remark saved; revenue 60, tip 5, Cash unchanged');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs)); await b.close();
})();
