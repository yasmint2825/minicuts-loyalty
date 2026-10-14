// Run: node tests/e2e.js   (needs playwright-core + jspdf resolvable via NODE_PATH)
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '..'); const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const DB = {
  queue: [{ id: 'q1', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 1, checkin_date: today, checkin_time: new Date().toISOString(), status: 'done', service_value: 0, stylist: 'Lester' }],
  customers: [{ id: 'cFull', name: 'Omar', mobile: '971500000001', gender: 'Boy', dob: '2019-01-02', location: 'Mirdif', heard_via: 'Google', tc_accepted: true, stamps: 2 }, { id: 'cInaya', name: 'Inaya', mobile: '971529206260', gender: 'Girl', dob: null, location: null, heard_via: null, stamps: 0 }],
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

  await pg.goto('file://' + ROOT + '/minicuts-staff.html'); await pg.waitForTimeout(800);
  DB.queue.length = 0;
  await pg.evaluate(() => { showTab('t-appt'); MC.appt.state.date = (() => { let d = MC.parseYmd(MC.today()); d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1); return MC.ymd(d); })(); MC.appt.init(); }); await pg.waitForTimeout(800);
  const openNew = async () => { await pg.evaluate(() => MC.appt.openNew()); await pg.waitForSelector('#ma-slots button'); };
  const bookIt = async () => { await pg.locator('#ma-slots button').first().click(); await pg.click('#ma-save'); await pg.waitForTimeout(800); };
  const arrive = async id => { await pg.evaluate(id => MC.appt.openAppt(id), id); await pg.waitForSelector('#mp-in'); };

  /* ── A. brand-new customer, details taken at registration ── */
  await openNew(); await pg.fill('#ma-q', '0558887777'); await pg.waitForSelector('#ma-addnew'); await pg.click('#ma-addnew');
  await pg.fill('#mn-name', 'Layla'); await pg.click('[data-mg="girl"]');
  await pg.click('#mn-save'); ok(/birthday/i.test(await pg.innerText('#mn-msg')), 'A: new customer — asks birthday');
  await pg.fill('#mn-dob', '2022-02-03'); await pg.click('#mn-save'); ok(/area/i.test(await pg.innerText('#mn-msg')), 'A: new customer — asks area');
  await pg.selectOption('#mn-loc', 'Al Barsha'); await pg.click('#mn-save'); ok(/heard/i.test(await pg.innerText('#mn-msg')), 'A: new customer — asks how they heard');
  await pg.fill('#mn-dob', '2999-01-01'); await pg.click('[data-mh="Instagram"]'); await pg.click('#mn-save'); ok(/future/i.test(await pg.innerText('#mn-msg')), 'A: future birthday rejected');
  await pg.fill('#mn-dob', '2022-02-03'); await pg.click('#mn-save'); ok(/T&C/.test(await pg.innerText('#mn-msg')), 'A: new customer — asks T&C consent');
  await pg.check('#mn-tc'); await pg.click('#mn-save'); await pg.waitForSelector('#ma-change');
  const layla = DB.customers.find(c => c.name === 'Layla');
  ok(layla && layla.mobile === '971558887777' && layla.gender === 'girl' && layla.dob === '2022-02-03' && layla.location === 'Al Barsha' && layla.heard_via === 'Instagram' && layla.tc_accepted === true && !!layla.tc_accepted_at, 'A: saved with birthday, area, source and T&C consent');
  ok(!/Missing/.test(await pg.innerText('#ma-sel')) && await pg.locator('#ma-sel >> text=Fill now').count() === 0, 'A: no missing-details warning, no Fill now');
  await bookIt(); const apA = DB.appointments.find(a => a.customer_name === 'Layla'); ok(apA && apA.status === 'booked', 'A: appointment booked');
  await arrive(apA.id); await pg.click('#mp-in'); await pg.waitForTimeout(900);
  ok(await pg.locator('#pd-save').count() === 0, 'A: arrival does NOT ask again');
  ok(DB.queue.some(q => q.customer_id === layla.id) && DB.appointments.find(a => a.id === apA.id).status === 'arrived', 'A: arrival puts her in the queue');

  /* ── B. existing customer with everything on file ── */
  await openNew(); await pg.fill('#ma-q', '0500000001'); await pg.waitForSelector('[data-cid="cFull"]'); await pg.click('[data-cid="cFull"]');
  ok(!/Missing/.test(await pg.innerText('#ma-sel')) && await pg.locator('#ma-sel >> text=Fill now').count() === 0, 'B: complete customer — no warning, no Fill now');
  await bookIt(); const apB = DB.appointments.find(a => a.customer_name === 'Omar'); ok(apB && apB.status === 'booked', 'B: appointment booked without any extra questions');
  await arrive(apB.id); ok(await pg.locator('text=Profile missing').count() === 0, 'B: appointment card shows no missing warning');
  await pg.click('#mp-in'); await pg.waitForTimeout(900);
  ok(await pg.locator('#pd-save').count() === 0 && DB.queue.some(q => q.customer_id === 'cFull'), 'B: arrival goes straight to the queue');
  const om = DB.customers.find(c => c.id === 'cFull'); ok(om.dob === '2019-01-02' && om.location === 'Mirdif' && om.heard_via === 'Google', 'B: existing details untouched');

  /* ── C. already-registered customer with missing details (Inaya) ── */
  await openNew(); await pg.fill('#ma-q', '0529206260'); await pg.waitForSelector('[data-cid="cInaya"]'); await pg.click('[data-cid="cInaya"]');
  const sel = await pg.innerText('#ma-sel'); ok(/Missing/.test(sel) && /birthday/.test(sel) && /area/.test(sel) && /heard/.test(sel) && /T&C/.test(sel), 'C: booking shows what is missing, including T&C');
  await pg.click('#ma-sel >> text=Fill now'); await pg.waitForSelector('#pd-save');
  await pg.click('#pd-save'); ok(/birthday/i.test(await pg.innerText('#pd-msg')), 'C: Fill now asks birthday');
  await pg.fill('[data-dob]', '2021-07-08'); await pg.selectOption('#pd-loc', 'Dubai Silicon Oasis (DSO)'); await pg.click('[data-h="Ad Board"]'); await pg.click('#pd-save'); ok(/T&C/.test(await pg.innerText('#pd-msg')), 'C: Fill now asks T&C consent'); 
  await pg.click('#pd-tcview'); await pg.waitForSelector('#tc-x'); ok(/MiNiCUTS/.test(await pg.innerText('.mc-box >> nth=-1')), 'C: T&C text can be read'); await pg.click('#tc-x');
  await pg.check('#pd-tc'); await pg.click('#pd-save'); await pg.waitForTimeout(600);
  const ina = DB.customers.find(c => c.id === 'cInaya'); ok(ina.dob === '2021-07-08' && ina.location === 'Dubai Silicon Oasis (DSO)' && ina.heard_via === 'Ad Board' && ina.tc_accepted === true, 'C: Fill now saved the details and T&C');
  ok(!/Missing/.test(await pg.innerText('#ma-sel')), 'C: warning disappears after Fill now');
  await pg.keyboard.press('Escape'); await pg.evaluate(() => document.querySelectorAll('.mc-ov').forEach(o => o.remove()));

  /* ── C2. booked earlier with gaps, skipped at booking, asked on arrival ── */
  DB.customers.push({ id: 'cNoor', name: 'Noor', mobile: '971541112223', gender: 'Girl', dob: null, location: null, heard_via: null, stamps: 0 });
  await openNew(); await pg.fill('#ma-q', '0541112223'); await pg.waitForSelector('[data-cid="cNoor"]'); await pg.click('[data-cid="cNoor"]'); await bookIt();
  const apC = DB.appointments.find(a => a.customer_name === 'Noor'); ok(apC && apC.status === 'booked', 'C2: booked while details were missing (still allowed)');
  await arrive(apC.id); await pg.waitForSelector('text=Profile missing', { timeout: 3000 }); ok(/T&C/.test(await pg.innerText('.mc-box >> nth=-1')), 'C2: appointment card warns that details (incl. T&C) are missing');
  await pg.click('#mp-fill'); await pg.waitForSelector('#pd-tc'); ok(true, 'C2: card button opens the profile window with the T&C checkbox'); await pg.click('#pd-skip'); await pg.waitForTimeout(300);
  await pg.click('#mp-in'); await pg.waitForSelector('#pd-save');
  await pg.click('#pd-save'); ok(/birthday/i.test(await pg.innerText('#pd-msg')), 'C2: arrival asks birthday before the token');
  await pg.fill('[data-dob]', '2020-09-10'); await pg.click('#pd-save'); ok(/area/i.test(await pg.innerText('#pd-msg')), 'C2: arrival asks area');
  await pg.selectOption('#pd-loc', 'Mirdif'); await pg.click('#pd-save'); ok(/heard/i.test(await pg.innerText('#pd-msg')), 'C2: arrival asks source');
  await pg.click('[data-h="Friends / Family"]'); await pg.click('#pd-save'); ok(/T&C/.test(await pg.innerText('#pd-msg')), 'C2: arrival asks T&C consent'); await pg.check('#pd-tc'); await pg.click('#pd-save'); await pg.waitForTimeout(900);
  const noor = DB.customers.find(c => c.id === 'cNoor'); ok(noor.dob === '2020-09-10' && noor.location === 'Mirdif' && noor.heard_via === 'Friends / Family' && noor.tc_accepted === true, 'C2: details and T&C saved');
  ok(DB.queue.some(q => q.customer_id === 'cNoor') && DB.appointments.find(a => a.id === apC.id).status === 'arrived', 'C2: token issued only after the profile');

  /* ── D. new customer, caller does not know → "ask on arrival", skip at arrival still lets them in ── */
  await openNew(); await pg.fill('#ma-q', '0567776666'); await pg.waitForSelector('#ma-addnew'); await pg.click('#ma-addnew');
  await pg.fill('#mn-name', 'Rayan'); await pg.click('[data-mg="boy"]'); await pg.check('#mn-skip'); await pg.click('#mn-save'); await pg.waitForSelector('#ma-change');
  const ray = DB.customers.find(c => c.name === 'Rayan'); ok(ray && ray.dob === null && ray.location === null && ray.heard_via === null && ray.tc_accepted === false, 'D: "ask on arrival" saves without details');
  await bookIt(); const apD = DB.appointments.find(a => a.customer_name === 'Rayan'); await arrive(apD.id); await pg.click('#mp-in'); await pg.waitForSelector('#pd-skip'); await pg.click('#pd-skip'); await pg.waitForTimeout(900);
  ok(DB.queue.some(q => q.customer_id === ray.id), 'D: Skip at arrival still checks the child in');

  /* ── E. second child on a known number reuses sibling area/source ── */
  await openNew(); await pg.fill('#ma-q', '0529206260'); await pg.waitForSelector('[data-addto]'); await pg.click('[data-addto]');
  ok(await pg.inputValue('#mn-loc') === 'Dubai Silicon Oasis (DSO)' && await pg.locator('[data-mh="Ad Board"].btn-y').count() === 1, 'E: sibling area and source prefilled');
  ok(await pg.isChecked('#mn-tc'), 'E: sibling T&C consent carried over'); await pg.fill('#mn-name', 'Zara'); await pg.click('[data-mg="girl"]'); await pg.fill('#mn-dob', '2023-01-02'); await pg.click('#mn-save'); await pg.waitForSelector('#ma-change');
  const zara = DB.customers.find(c => c.name === 'Zara'); ok(zara && zara.location === 'Dubai Silicon Oasis (DSO)' && zara.heard_via === 'Ad Board' && zara.dob === '2023-01-02' && zara.tc_accepted === true, 'E: sibling saved with inherited area/source');

  ok(errs.length === 0, 'no console/page errors ' + JSON.stringify(errs.slice(0, 3)));
  await b.close();
})();
