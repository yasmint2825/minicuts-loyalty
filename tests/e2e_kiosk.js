// Run: node tests/e2e_kiosk.js  — customer check-in kiosk: profile completion gate + appointment link
const { chromium } = require('playwright-core'); const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const today = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const DB = { customers: [{ id: 'c1', name: 'Aisha', mobile: '971501234567', gender: null, dob: null, location: null, heard_via: null, stamps: 0, tc_accepted: false }, { id: 'c2', name: 'Omar', mobile: '971507654321', gender: 'boy', dob: '2019-01-01', location: 'Mirdif', heard_via: 'Google', stamps: 3, tc_accepted: true }],
  queue: [], appointments: [{ id: 'a1', customer_id: 'c1', appt_date: today, status: 'booked', stylist: 'George', start_time: '11:00:00' }] };
const like = () => true;
const filt = (rows, qs) => { qs.forEach((v, k) => { if (['select', 'order', 'limit'].includes(k)) return; let m;
  if ((m = /^eq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) === m[1]); else if ((m = /^in\.\((.*)\)$/.exec(v))) rows = rows.filter(r => m[1].split(',').includes(String(r[k]))); else if (/^is\.null$/.test(v)) rows = rows.filter(r => r[k] == null); }); return rows; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 900, height: 1000 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', async route => {
    const u = new URL(route.request().url()), m = route.request().method();
    if (u.hostname.endsWith('supabase.co')) {
      const j = (o, s) => route.fulfill({ status: s || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(o) });
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      const t = u.pathname.split('/rest/v1/')[1], rows = DB[t] || (DB[t] = []), body = JSON.parse(route.request().postData() || '{}');
      if (m === 'GET') return j(filt(rows, u.searchParams));
      if (m === 'POST') { const arr = [].concat(body).map((x, i) => Object.assign({ id: 'n' + Math.random().toString(16).slice(2, 7) }, x)); rows.push(...arr); return j(arr, 201); }
      if (m === 'PATCH') { const r = filt(rows, u.searchParams); r.forEach(x => Object.assign(x, body)); return j(r); }
      return j([]);
    }
    if (u.protocol === 'file:') return route.continue(); return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  await pg.goto('file://' + ROOT + '/minicuts-checkin.html'); await pg.waitForTimeout(500);
  // complete family: no extra step
  await pg.selectOption('#lu-pfx', '050'); await pg.fill('#lu-num', '7654321'); await pg.waitForSelector('#lu-btn', { state: 'visible' }); await pg.waitForTimeout(400);
  await pg.click('#lu-btn'); await pg.waitForTimeout(900);
  ok(await pg.locator('#md-go').count() === 0 && DB.queue.length === 1 && DB.queue[0].customer_name === 'Omar', 'complete profile: token issued with no extra questions');
  // incomplete child: asked before the token
  await pg.reload(); await pg.waitForTimeout(500);
  await pg.selectOption('#lu-pfx', '050'); await pg.fill('#lu-num', '1234567'); await pg.waitForSelector('#lu-btn', { state: 'visible' });
  await pg.waitForTimeout(500); const hear = pg.locator('.hear-btn').first(); if (await hear.isVisible()) await hear.click();
  const tc = pg.locator('#lu-tc-check'); if (await tc.count()) await tc.check();
  await pg.click('#lu-btn'); await pg.waitForSelector('#md-go');
  ok(DB.queue.length === 1, 'no token before the missing details are given');
  await pg.click('#md-go'); ok(/boy or girl/.test(await pg.innerText('#md-err')), 'asks boy/girl');
  await pg.click('[data-g="c1:girl"]'); await pg.click('#md-go'); ok(/birthday/.test(await pg.innerText('#md-err')), 'asks birthday');
  await pg.fill('[data-dob]', '2021-05-06'); await pg.click('#md-go'); ok(/area/.test(await pg.innerText('#md-err')), 'asks area');
  await pg.selectOption('#md-loc', 'Mirdif'); await pg.click('#md-go'); await pg.waitForTimeout(1000);
  const c1 = DB.customers[0]; ok(c1.gender === 'girl' && c1.dob === '2021-05-06' && c1.location === 'Mirdif', 'details saved on the customer');
  ok(DB.queue.length === 2 && DB.queue[1].customer_name === 'Aisha', 'token issued after details');
  ok(DB.appointments[0].status === 'arrived' && DB.appointments[0].queue_id === DB.queue[1].id && DB.queue[1].stylist === 'George' && /Appointment 11:00/.test(DB.queue[1].remark), 'today\'s appointment linked to the token with its stylist');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 2))); await b.close();
})();
