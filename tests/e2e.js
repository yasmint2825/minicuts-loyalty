// Run: node tests/e2e.js   (needs playwright-core + jspdf resolvable via NODE_PATH)
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const DB = {
  queue: [{ id: 'q1', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 1, checkin_date: today, checkin_time: new Date().toISOString(), status: 'done', service_value: 0, stylist: 'Lester' }],
  customers: [{ id: 'c1', name: 'Aisha', mobile: '971501234567', gender: 'Girl' }],
  invoices: [], appointments: [], staff_config: [{ key: 'co_settings', value: JSON.stringify({ bname: 'MiNiCUTS FZCO', trn: '100123456700003', taxrate: 5, tax_incl: 'inclusive', prefix: 'MC' }) }],
  salon_services: [{ id: 's1', name: 'Haircut', gender: 'Boy', price: 50, duration: 30, status: 'active' }, { id: 's1b', name: 'Haircut ', gender: 'Boy', price: 50, duration: 30, status: 'active' }, { id: 'd1', name: 'Boys - Haircut + Colour + Hair Tattoo', gender: 'boys', price: 80, status: 'active' }, { id: 'd2', name: 'Boys - Haircut + Colour + Hair Tattoo', gender: 'boys', price: 80, status: 'active' }, { id: 'd3', name: 'Boys - Haircut + Colour + Hair Wash', gender: 'boys', price: 80, status: 'active' }, { id: 'd4', name: 'Girls - Haircut + Colour', gender: 'girls', price: 90, status: 'active' }, { id: 's2', name: 'Styling', gender: 'Girl', price: 80, duration: 45, status: 'active' }],
  staff: [{ id: 'st1', name: 'Lester', role: 'Stylist', off_days: [1] }, { id: 'st2', name: 'George', role: 'Stylist', off_days: [] }], staff_leaves: [], staff_roster: []
};
const like = (val, pat) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i').test(String(val == null ? '' : val));
const filt = (rows, qs) => { qs.forEach((v, k) => { if (['select', 'order', 'limit', 'offset'].includes(k)) return; let m;
  if (k === 'or' && (m = /^\((.*)\)$/.exec(v))) { const conds = m[1].split(',').map(c => /^(\w+)\.ilike\.(.*)$/.exec(c)); if (conds.every(Boolean)) rows = rows.filter(r => conds.some(c => like(r[c[1]], decodeURIComponent(c[2])))); return; }
  if ((m = /^ilike\.(.*)$/.exec(v))) { rows = rows.filter(r => like(r[k], m[1])); return; }
  if ((m = /^eq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) === m[1]); else if ((m = /^in\.\((.*)\)$/.exec(v))) rows = rows.filter(r => m[1].split(',').includes(String(r[k])));
  else if ((m = /^gte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) >= m[1]); else if ((m = /^lte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) <= m[1]); }); return rows; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  let waCall = null, pdfBytes = 0, zenOn = false, zenCall = null;
  await pg.route('**/*', async route => {
    const u = new URL(route.request().url()), m = route.request().method();
    if (u.hostname.endsWith('supabase.co')) {
      const j = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (u.pathname.startsWith('/storage/')) { pdfBytes = route.request().postDataBuffer().length; return j({ Key: 'x' }); }
      if (u.pathname.includes('/functions/v1/mc-send-invoice')) { if (!zenOn) return j({ message: 'Requested function was not found' }, 404); zenCall = JSON.parse(route.request().postData()); if (zenCall.list_templates) return j({ ok: true, templates: [{ name: 'new_customer_offer', language: 'en', status: 'APPROVED', category: 'MARKETING', body: 'Hi {{1}}', vars: 1, has_header: true }, { name: 'booking_completed_invoice', language: 'en_US', status: 'APPROVED', category: 'UTILITY', body: 'Hi {{1}} {{2}} {{3}} {{4}} {{5}}', vars: 5, has_header: false }] }); return j({ ok: true }); }
      if (u.pathname.startsWith('/functions/')) { waCall = JSON.parse(route.request().postData()); return j({ ok: true }); }
      const t = u.pathname.split('/rest/v1/')[1]; if (process.env.NODB && /^invoices/.test(t)) return j({ message: 'relation "public.invoices" does not exist' }, 404);
      const rows = DB[t] || (DB[t] = []);
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
  if (process.env.NODB) {
    DB.queue.push({ id: 'q2', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 9, checkin_date: today, checkin_time: new Date().toISOString(), status: 'called', stylist: 'George' });
    await pg.evaluate(() => { showTab('t-queue'); loadQ(); }); await pg.waitForTimeout(800);
    ok(await pg.getAttribute('#aed-q2', 'type') === 'number', 'before migration: amount box is typeable (classic mode)');
    ok(/^✅ Stamp$/.test((await pg.innerText('#qr-q2 .btn-g')).trim()), 'before migration: plain Stamp button');
    ok(errs.length === 0, 'before migration: no errors ' + JSON.stringify(errs.slice(0, 2))); await b.close(); return;
  }
  const pick = n => pg.evaluate(n => { const i = MC.billing.services.findIndex(x => x.name.trim() === n); document.querySelector('#mcc-list [data-i="' + i + '"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); }, n);
  const typeSvc = async n => { await pg.fill('#mcc-svcname', ''); await pg.fill('#mcc-svcname', n); await pg.waitForSelector('#mcc-list [data-i]'); };
  // History → checkout
  await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(600);
  ok(await pg.locator('text=💳 Checkout').count() > 0, 'Checkout button shown in History');
  await pg.locator('text=💳 Checkout').first().click(); await pg.waitForSelector('#mcc-issue');
  await pg.fill('#mcc-svcname', 'tattoo'); ok(await pg.locator('#mcc-list [data-i]').count() === 1, 'duplicates collapsed to one row'); if (process.env.SHOT2) { await pg.fill('#mcc-svcname', ''); await pg.fill('#mcc-svcname', 'colour'); await pg.waitForTimeout(200); await pg.screenshot({ path: process.env.SHOT2 }); await pg.fill('#mcc-svcname', 'tattoo'); } await pg.locator('#mcc-list [data-i]').first().dispatchEvent('mousedown'); ok(await pg.inputValue('#mcc-price') === '80', 'picking fills price'); ok(await pg.getAttribute('#mcc-price', 'readonly') !== null, 'price box is read-only'); ok(await pg.getAttribute('#mcc-disc', 'type') === 'hidden', 'discount only via chips (no typed box)'); await pg.fill('#mcc-svcname', 'zzz'); ok(await pg.inputValue('#mcc-price') === '', 'typing alone sets no price'); await pg.click('#mcc-issue'); ok(/Pick the service/.test(await pg.innerText('#mcc-msg')), 'cannot issue without a listed service'); await typeSvc('Haircut'); await pick('Haircut'); ok(await pg.inputValue('#mcc-price') === '50', 'Haircut price 50 from list'); await pg.click('.mc-chip[data-p="10"]'); await pg.click('.mc-pay[data-v="Cash"]'); await pg.fill('#mcc-tip', '5');
  const sum = await pg.innerText('#mcc-sum'); ok(/45\.00/.test(sum) && /50\.00/.test(sum), 'discount 10% on 50 → 45 shown'); ok(/Total to collect[\s\S]*50\.00/.test(sum), 'total incl tip 50.00');
  await pg.click('#mcc-issue'); await pg.waitForSelector('#mci-send', { timeout: 8000 });
  const inv = DB.invoices[0]; ok(inv && inv.invoice_number === 'MC/' + new Date().getFullYear() + '/00001', 'invoice number ' + (inv && inv.invoice_number));
  ok(inv.payable_amount === 45 && inv.discount_amount === 5 && inv.tax_amount === 2.14 && inv.total_amount === 50, 'invoice maths ' + JSON.stringify([inv.payable_amount, inv.discount_amount, inv.tax_amount, inv.total_amount]));
  ok(DB.queue[0].service_value === 45 && DB.queue[0].invoice_id === inv.id && DB.queue[0].discount_pct === 10, 'queue row updated');
  ok(pdfBytes > 1000 && /invoices\/.*\.pdf$/.test(inv.pdf_url || ''), 'PDF built & uploaded (' + pdfBytes + ' bytes)');
  await pg.evaluate(() => localStorage.setItem('mw_tenant_key', 'k')); await pg.click('#mci-send'); await pg.waitForTimeout(500);
  ok(waCall && waCall.template_name === 'booking_completed_invoice' && waCall.params.length === 5 && waCall.params[1] === 'MiNiCUTS' && waCall.params[4] === 'MiNiCUTS' && /^https/.test(waCall.params[3]) && DB.invoices[0].whatsapp_sent === true, 'WhatsApp utility call ' + JSON.stringify(waCall && waCall.params));
  await pg.click('#mci-close'); ok(await pg.locator('text=🧾 Invoice').count() > 0, 'row now shows Invoice button');
  // void → re-checkout allowed
  await pg.locator('text=✕ Void').first().click(); await pg.waitForSelector('#mcv-yes'); await pg.click('#mcv-yes'); await pg.waitForTimeout(500);
  ok(DB.invoices[0].status === 'void' && !DB.queue[0].invoice_id, 'void releases the visit');
  await pg.locator('text=💳 Checkout').first().click(); await pg.waitForSelector('#mcc-issue'); await typeSvc('Haircut'); await pick('Haircut'); await pg.click('.mc-pay[data-v="Credit"]'); await pg.click('#mcc-issue'); await pg.waitForSelector('#mci-close');
  ok(DB.invoices[1].invoice_number.endsWith('/00002'), 'numbers never reused after void'); await pg.click('#mci-close');
  // Appointments
  await pg.evaluate(() => { showTab('t-appt'); MC.appt.state.date = (() => { let d = MC.parseYmd(MC.today()); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return MC.ymd(d); })(); MC.appt.init(); }); await pg.waitForTimeout(800);
  ok(await pg.locator('#mc-appt-root table').count() === 1, 'calendar renders');
  await pg.evaluate(() => MC.appt.openNew()); await pg.waitForSelector('#ma-slots button');
  // customer search: by mobile fragment, pick the child
  await pg.fill('#ma-q', '050123'); await pg.waitForSelector('[data-cid="c1"]'); ok(await pg.locator('[data-cid]').count() === 1, 'search by mobile finds the child');
  await pg.click('[data-cid="c1"]'); ok(/Aisha/.test(await pg.innerText('#ma-sel')) && /Missing/.test(await pg.innerText('#ma-sel')), 'selected child shows missing profile details');
  await pg.click('#ma-change'); await pg.fill('#ma-q', 'ais'); await pg.waitForSelector('[data-cid="c1"]'); ok(true, 'search by name works');
  // new customer quick add + duplicate protection
  await pg.fill('#ma-q', '0559998888'); await pg.waitForSelector('#ma-addnew:has-text("No match")'); await pg.click('#ma-addnew');
  ok(await pg.inputValue('#mn-mob') === '0559998888', 'new-customer form prefilled with typed mobile');
  await pg.fill('#mn-name', 'Zayd'); await pg.click('#mn-save'); ok(/boy or girl/.test(await pg.innerText('#mn-msg')), 'gender required for a new customer');
  await pg.click('[data-mg="boy"]'); await pg.click('#mn-save'); ok(/birthday/i.test(await pg.innerText('#mn-msg')), 'registration asks for the birthday');
  await pg.fill('#mn-dob', '2021-05-06'); await pg.click('#mn-save'); ok(/area/i.test(await pg.innerText('#mn-msg')), 'registration asks for the area');
  await pg.selectOption('#mn-loc', 'Al Barsha'); await pg.click('#mn-save'); ok(/heard/i.test(await pg.innerText('#mn-msg')), 'registration asks how they heard of us');
  await pg.click('[data-mh="Instagram"]'); await pg.click('#mn-save'); ok(/T&C/.test(await pg.innerText('#mn-msg')), 'registration asks for T&C consent'); await pg.check('#mn-tc'); await pg.click('#mn-save'); await pg.waitForSelector('#ma-change');
  const zayd = DB.customers.find(c => c.name === 'Zayd'); ok(zayd && zayd.mobile === '971559998888' && zayd.gender === 'boy' && zayd.dob === '2021-05-06' && zayd.location === 'Al Barsha' && zayd.heard_via === 'Instagram' && zayd.tc_accepted === true && !!zayd.tc_accepted_at, 'new customer saved in kiosk format with birthday, area and source');
  await pg.click('#ma-change'); await pg.fill('#ma-q', '0559998888'); await pg.waitForSelector('[data-addto]'); await pg.click('[data-addto]'); ok(await pg.inputValue('#mn-loc') === 'Al Barsha', 'sibling area is prefilled'); await pg.fill('#mn-name', 'zayd'); await pg.click('[data-mg="boy"]'); await pg.fill('#mn-dob', '2021-05-06'); await pg.click('#mn-save'); await pg.waitForSelector('#ma-change');
  ok(DB.customers.filter(c => /zayd/i.test(c.name)).length === 1, 'same child + number is not duplicated');
  await pg.click('#ma-change'); await pg.fill('#ma-q', '050123'); await pg.waitForSelector('[data-cid="c1"]'); await pg.click('[data-cid="c1"]');
  ok((await pg.$$eval('#ma-svc option', o => o.map(x => x.textContent))).every(t => !/\((Boy|boys)\)/.test(t)), 'services follow the child\'s gender (girl sees no boy-only services)');
  await pg.selectOption('#ma-sty', 'George'); await pg.waitForTimeout(300);
  await pg.locator('#ma-slots button').first().click(); await pg.click('#ma-save'); await pg.waitForTimeout(800);
  const ap = DB.appointments[0]; ok(ap && ap.stylist === 'George' && ap.duration_min === 45 && ap.end_time === '10:45', 'appointment saved ' + JSON.stringify(ap && [ap.start_time, ap.end_time]));
  await pg.evaluate(() => MC.appt.openNew()); await pg.waitForSelector('#ma-slots button'); await pg.selectOption('#ma-sty', 'George');
  await pg.waitForTimeout(300); const first = await pg.locator('#ma-slots button').first().innerText(); ok(first === '10:45', 'next free slot after booking is 10:45 (got ' + first + ')'); await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelector('.mc-ov').remove());
  ok(DB.appointments[0].customer_id === 'c1', 'appointment linked to the customer record');
  await pg.evaluate(id => MC.appt.openAppt(id), ap.id); await pg.click('#mp-in'); await pg.waitForSelector('#pd-save');
  await pg.click('#pd-save'); ok(/birthday/i.test(await pg.innerText('#pd-msg')), 'arrival asks for missing birthday before the token');
  await pg.fill('[data-dob]', '2020-03-04'); await pg.click('#pd-save'); ok(/area/i.test(await pg.innerText('#pd-msg')), 'arrival asks for area');
  await pg.selectOption('#pd-loc', 'Mirdif'); await pg.click('#pd-save'); ok(/heard/i.test(await pg.innerText('#pd-msg')), 'arrival asks how they heard');
  await pg.click('[data-h="Google"]'); await pg.click('#pd-save'); ok(/T&C/.test(await pg.innerText('#pd-msg')), 'arrival asks for T&C consent'); await pg.check('#pd-tc'); await pg.click('#pd-save'); await pg.waitForTimeout(700);
  const c1 = DB.customers.find(c => c.id === 'c1'); ok(c1.dob === '2020-03-04' && c1.location === 'Mirdif' && c1.heard_via === 'Google' && c1.tc_accepted === true, 'profile completed and saved');
  ok(DB.appointments[0].status === 'arrived' && DB.queue.some(q => q.remark && q.remark.startsWith('Appointment')), 'check-in creates queue row after profile is complete');
  // Reports
  await pg.evaluate(() => { showTab('t-reports'); MC.reports.init(); }); await pg.fill('#mr-pin', '8065'); await pg.click('#mr-go'); await pg.waitForTimeout(800);
  ok(/Total/.test(await pg.innerText('#mr-out')), 'sales report renders'); console.log('SALES>>', (await pg.innerText('#mr-out')).replace(/\s+/g,' ').slice(0,700));
  await pg.click('[data-t="tax"]'); await pg.waitForTimeout(600); ok(/MC\//.test(await pg.innerText('#mr-out')), 'tax register lists invoices'); console.log('TAX>>', (await pg.innerText('#mr-out')).replace(/\s+/g,' ').slice(0,900)); ok(/Taxable value/.test(await pg.innerText('#mr-out')) && /TRN|GSTIN/.test(await pg.innerText('#mr-out')), 'tax report has summary + tax id');
  // Settings tabs + WhatsApp test message
  await pg.evaluate(() => { showTab('t-config'); loadCfgScreen(); }); await pg.waitForSelector('#mcs-save');
  ok(await pg.isVisible('#mcs-save') && !(await pg.isVisible('#mcw-test')), 'settings: only Invoice section shown first');
  await pg.click('#cfg-nav [data-s="wa"]'); await pg.waitForSelector('#mcw-test'); ok(await pg.isVisible('#mcw-test') && !(await pg.isVisible('#mcs-save')), 'settings: WhatsApp tab shows test box');
  let waBody = null; await pg.route('**/functions/v1/send-whatsapp', r => { const b = JSON.parse(r.request().postData()); if (!b.mobile) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"ok":false,"error":"mobile and either type or template_name are required"}' }); waBody = b; r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); });
  // Zen-hosted sending (function deployed): no key needed in the browser
  zenOn = true; await pg.evaluate(() => localStorage.removeItem('mw_tenant_key'));
  await pg.click('#mcw-check'); await pg.waitForTimeout(400); ok(/through Zen/.test(await pg.innerText('#mcw-msg')), 'check connection: connected through Zen without a key');
  await pg.click('#mcw-reload'); await pg.waitForTimeout(500);
  ok(await pg.locator('#mcw-tplsel optgroup[label^="Fits"] option').count() === 1, 'picker lists the 5-variable template under "Fits invoices"');
  await pg.selectOption('#mcw-tplsel', 'booking_completed_invoice|en_US'); ok(/matches the 5 values/.test(await pg.innerText('#mcw-tplinfo')), 'picker shows variable match');
  await pg.fill('#mcw-to', '0501234567'); await pg.click('#mcw-test'); await pg.waitForTimeout(400);
  ok(zenCall && zenCall.test_mobile === '0501234567' && zenCall.template === 'booking_completed_invoice' && zenCall.template_lang === 'en_US', 'test message goes through Zen with the picked template + language');
  zenCall = null; zenOn = false;
  await pg.click('#cfg-nav [data-s="invoice"]');
  // Settings
  await pg.evaluate(() => { showTab('t-config'); loadCfgScreen(); }); await pg.waitForSelector('#mcs-save');
  await pg.waitForTimeout(600); await pg.fill('#mcs-taxId', '123'); await pg.click('#mcs-save'); await pg.waitForTimeout(300); ok(/not valid/.test(await pg.innerText('#mcs-msg')), 'invalid TRN rejected');
  await pg.selectOption('#mcs-country', 'IN'); await pg.fill('#mcs-taxId', '27ABCDE1234F1Z5'); await pg.click('#mcs-save'); await pg.waitForTimeout(500);
  ok(JSON.parse(DB.staff_config.find(c => c.key === 'co_settings').value).country === 'IN', 'India GSTIN saved');
  // Stamp & Checkout (grid frozen once DB is ready)
  DB.queue.push({ id: 'q2', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 9, checkin_date: today, checkin_time: new Date().toISOString(), status: 'called', stylist: 'George' });
  DB.customers[0].stamps = 2;
  await pg.evaluate(() => { showTab('t-queue'); loadQ(); }); await pg.waitForTimeout(800);
  ok(await pg.getAttribute('#aed-q2', 'type') === 'hidden', 'grid amount is not typeable before checkout');
  ok(/Stamp &/.test(await pg.innerText('#qr-q2 .btn-g')), 'Stamp button becomes Stamp & Checkout');
  await pg.click('#qr-q2 .btn-g'); await pg.waitForSelector('#mcc-issue');
  await typeSvc('Haircut'); await pick('Haircut'); await pg.click('.mc-chip[data-p="10"]'); await pg.click('.mc-pay[data-v="Cash"]'); await pg.click('#mcc-issue');
  await pg.waitForSelector('#mci-close'); ok(/stamp visit/.test(await pg.innerText('#mci-close')), 'invoice screen offers Done — stamp visit');
  ok(DB.queue.find(q => q.id === 'q2').status === 'called', 'not stamped until invoice screen is confirmed');
  await pg.click('#mci-close'); await pg.waitForTimeout(900);
  const q2 = DB.queue.find(q => q.id === 'q2'); ok(q2.status === 'done' && q2.service_value === 45 && q2.payment_type === 'Cash' && q2.discount_pct === 10, 'visit stamped with checkout values ' + JSON.stringify([q2.status, q2.service_value, q2.payment_type]));
  ok((DB.visits || []).some(v => v.service_value === 45), 'visits row carries the amount');
  await pg.screenshot({ path: process.env.SHOT || '/tmp/shot.png' });
  ok(errs.length === 0, 'no console/page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
