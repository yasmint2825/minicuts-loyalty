// Run: node tests/e2e.js   (needs playwright-core + jspdf resolvable via NODE_PATH)
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const DB = {
  queue: [{ id: 'q1', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 1, checkin_date: today, checkin_time: new Date().toISOString(), status: 'done', service_value: 0, stylist: 'Lester' }],
  customers: [{ id: 'c1', name: 'Aisha', mobile: '971501234567', gender: 'Girl' }],
  invoices: [], appointments: [], staff_config: [{ key: 'co_settings', value: JSON.stringify({ bname: 'MiNiCUTS FZCO', trn: '100123456700003', taxrate: 5, tax_incl: 'inclusive', prefix: 'MC' }) }],
  salon_services: [{ id: 's1', name: 'Haircut', gender: 'Boy', price: 50, duration: 30, status: 'active' }, { id: 's1b', name: 'Haircut ', gender: 'Boy', price: 50, duration: 30, status: 'active' }, { id: 's2', name: 'Styling', gender: 'Girl', price: 80, duration: 45, status: 'active' }],
  staff: [{ id: 'st1', name: 'Lester', role: 'Stylist', off_days: [1] }, { id: 'st2', name: 'George', role: 'Stylist', off_days: [] }], staff_leaves: [], staff_roster: []
};
const filt = (rows, qs) => { qs.forEach((v, k) => { if (['select', 'order', 'limit', 'offset'].includes(k)) return; let m;
  if ((m = /^eq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) === m[1]); else if ((m = /^in\.\((.*)\)$/.exec(v))) rows = rows.filter(r => m[1].split(',').includes(String(r[k])));
  else if ((m = /^gte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) >= m[1]); else if ((m = /^lte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) <= m[1]); }); return rows; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  let waCall = null, pdfBytes = 0;
  await pg.route('**/*', async route => {
    const u = new URL(route.request().url()), m = route.request().method();
    if (u.hostname.endsWith('supabase.co')) {
      const j = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (u.pathname.startsWith('/storage/')) { pdfBytes = route.request().postDataBuffer().length; return j({ Key: 'x' }); }
      if (u.pathname.startsWith('/functions/')) { waCall = JSON.parse(route.request().postData()); return j({ ok: true }); }
      const t = u.pathname.split('/rest/v1/')[1]; const rows = DB[t] || (DB[t] = []);
      if (m === 'GET') { let r = filt(rows, u.searchParams); const o = u.searchParams.get('order'); if (o) { const [f, d] = o.split(',')[0].split('.'); r = [...r].sort((a, c) => (a[f] > c[f] ? 1 : -1) * (d === 'desc' ? -1 : 1)); } const l = +u.searchParams.get('limit'); return j(l ? r.slice(0, l) : r); }
      const body = JSON.parse(route.request().postData() || '{}');
      if (m === 'POST') { const arr = [].concat(body).map(x => Object.assign({ id: 'id' + Math.random().toString(16).slice(2, 8) }, x));
        if (t === 'invoices' && arr.some(x => DB.invoices.some(i => i.fy === x.fy && i.seq === x.seq))) return j({ code: '23505', message: 'duplicate key' }, 409);
        rows.push(...arr); return j(arr, 201); }
      if (m === 'PATCH') { const r = filt(rows, u.searchParams); r.forEach(x => Object.assign(x, body)); return j(r); }
      return j([]);
    }
    if (/cdnjs.*jspdf/.test(u.href)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.JSPDF) });
    if (u.protocol === 'file:' || u.hostname === 'local.test') return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  await pg.goto('file://' + ROOT + '/minicuts-staff.html'); await pg.waitForTimeout(800);
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  // History → checkout
  await pg.evaluate(() => { showTab('t-history', document.querySelectorAll('.tab')[1]); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(600);
  ok(await pg.locator('text=💳 Checkout').count() > 0, 'Checkout button shown in History');
  await pg.locator('text=💳 Checkout').first().click(); await pg.waitForSelector('#mcc-issue');
  await pg.fill('#mcc-svcname', 'hair'); ok(await pg.locator('#mcc-list [data-i]').count() === 1, 'duplicates collapsed to one row'); await pg.locator('#mcc-list [data-i]').first().dispatchEvent('mousedown'); ok(await pg.inputValue('#mcc-price') === '50', 'picking fills price'); await pg.click('.mc-chip[data-p="10"]'); await pg.click('.mc-pay[data-v="Cash"]'); await pg.fill('#mcc-tip', '5');
  const sum = await pg.innerText('#mcc-sum'); ok(/45\.00/.test(sum) && /50\.00/.test(sum), 'discount 10% on 50 → 45 shown'); ok(/Total to collect[\s\S]*50\.00/.test(sum), 'total incl tip 50.00');
  await pg.click('#mcc-issue'); await pg.waitForSelector('#mci-send', { timeout: 8000 });
  const inv = DB.invoices[0]; ok(inv && inv.invoice_number === 'MC/' + new Date().getFullYear() + '/00001', 'invoice number ' + (inv && inv.invoice_number));
  ok(inv.payable_amount === 45 && inv.discount_amount === 5 && inv.tax_amount === 2.14 && inv.total_amount === 50, 'invoice maths ' + JSON.stringify([inv.payable_amount, inv.discount_amount, inv.tax_amount, inv.total_amount]));
  ok(DB.queue[0].service_value === 45 && DB.queue[0].invoice_id === inv.id && DB.queue[0].discount_pct === 10, 'queue row updated');
  ok(pdfBytes > 1000 && /invoices\/.*\.pdf$/.test(inv.pdf_url || ''), 'PDF built & uploaded (' + pdfBytes + ' bytes)');
  await pg.evaluate(() => localStorage.setItem('mw_tenant_key', 'k')); await pg.click('#mci-send'); await pg.waitForTimeout(500);
  ok(waCall && waCall.template_name === 'mc_invoice_utility' && waCall.params.length === 5 && /^https/.test(waCall.params[4]) && DB.invoices[0].whatsapp_sent === true, 'WhatsApp utility call ' + JSON.stringify(waCall && waCall.params));
  await pg.click('#mci-close'); ok(await pg.locator('text=🧾 Invoice').count() > 0, 'row now shows Invoice button');
  // void → re-checkout allowed
  await pg.locator('text=🧾 Invoice').first().click(); await pg.waitForSelector('#mci-void'); await pg.click('#mci-void'); await pg.click('#mcv-yes'); await pg.waitForTimeout(500);
  ok(DB.invoices[0].status === 'void' && !DB.queue[0].invoice_id, 'void releases the visit');
  await pg.locator('text=💳 Checkout').first().click(); await pg.waitForSelector('#mcc-issue'); await pg.fill('#mcc-svcname', 'Haircut'); await pg.fill('#mcc-price', '50'); await pg.click('.mc-pay[data-v="Credit"]'); await pg.click('#mcc-issue'); await pg.waitForSelector('#mci-close');
  ok(DB.invoices[1].invoice_number.endsWith('/00002'), 'numbers never reused after void'); await pg.click('#mci-close');
  // Appointments
  await pg.evaluate(() => { showTab('t-appt', document.querySelectorAll('.tab')[2]); MC.appt.state.date = (() => { let d = MC.parseYmd(MC.today()); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return MC.ymd(d); })(); MC.appt.init(); }); await pg.waitForTimeout(800);
  ok(await pg.locator('#mc-appt-root table').count() === 1, 'calendar renders');
  await pg.evaluate(() => MC.appt.openNew()); await pg.waitForSelector('#ma-slots button');
  await pg.fill('#ma-mob', '0501234567'); await pg.fill('#ma-name', 'Aisha'); await pg.selectOption('#ma-sty', 'George'); await pg.waitForTimeout(300);
  await pg.locator('#ma-slots button').first().click(); await pg.click('#ma-save'); await pg.waitForTimeout(800);
  const ap = DB.appointments[0]; ok(ap && ap.stylist === 'George' && ap.duration_min === 30 && ap.end_time === '10:30', 'appointment saved ' + JSON.stringify(ap && [ap.start_time, ap.end_time]));
  await pg.evaluate(() => MC.appt.openNew()); await pg.waitForSelector('#ma-slots button'); await pg.selectOption('#ma-sty', 'George');
  await pg.waitForTimeout(300); const first = await pg.locator('#ma-slots button').first().innerText(); ok(first === '10:30', 'next free slot after booking is 10:30 (got ' + first + ')'); await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelector('.mc-ov').remove());
  await pg.evaluate(id => MC.appt.openAppt(id), ap.id); await pg.click('#mp-in'); await pg.waitForTimeout(600);
  ok(DB.appointments[0].status === 'arrived' && DB.queue.some(q => q.remark && q.remark.startsWith('Appointment')), 'check-in creates queue row');
  // Reports
  await pg.evaluate(() => { showTab('t-reports', document.querySelectorAll('.tab')[3]); MC.reports.init(); }); await pg.fill('#mr-pin', '8065'); await pg.click('#mr-go'); await pg.waitForTimeout(800);
  ok(/Total/.test(await pg.innerText('#mr-out')), 'sales report renders');
  await pg.click('[data-t="tax"]'); await pg.waitForTimeout(600); ok(/MC\//.test(await pg.innerText('#mr-out')), 'tax register lists invoices');
  // Settings
  await pg.evaluate(() => { showTab('t-config', document.querySelectorAll('.tab')[8]); loadCfgScreen(); }); await pg.waitForSelector('#mcs-save');
  await pg.fill('#mcs-taxId', '123'); await pg.click('#mcs-save'); await pg.waitForTimeout(300); ok(/not valid/.test(await pg.innerText('#mcs-msg')), 'invalid TRN rejected');
  await pg.selectOption('#mcs-country', 'IN'); await pg.fill('#mcs-taxId', '27ABCDE1234F1Z5'); await pg.click('#mcs-save'); await pg.waitForTimeout(500);
  ok(JSON.parse(DB.staff_config.find(c => c.key === 'co_settings').value).country === 'IN', 'India GSTIN saved');
  await pg.screenshot({ path: process.env.SHOT || '/tmp/shot.png' });
  ok(errs.length === 0, 'no console/page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
