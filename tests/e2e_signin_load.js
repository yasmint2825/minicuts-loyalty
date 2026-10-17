// Run: node tests/e2e_signin_load.js — the staff app in signed-in mode (?chain=1) when the database answers ONLY
// signed-in staff (the planned "signed-in only" lockdown): queue, stylists and billing must load right after sign-in,
// and again when the page is reopened with a saved sign-in. Without sign-in the page keeps working as before.
const { chromium } = require('playwright-core'); const path = require('path'); const ROOT = path.resolve(__dirname, '..');
const SALON = new Set(['appointments', 'customers', 'cycles', 'game_sessions', 'gift_vouchers', 'historical_transactions', 'invoices', 'kod_members', 'prizes_given', 'queue', 'referrals', 'salon_coupons', 'salon_services', 'salon_vat', 'staff', 'staff_attendance', 'staff_config', 'staff_documents', 'staff_leave_types', 'staff_leaves', 'staff_overtime', 'staff_roster', 'visits', 'whatsapp_messages']);
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = b64({ alg: 'HS256' }) + '.' + b64({ sub: 'u1', email: 'desk@minicuts.test', exp: Math.floor(Date.now() / 1000) + 3600 }) + '.sig';
const today = new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const DATA = {
  queue: [{ id: 'q1', token_number: 1, checkin_date: today, customer_name: 'Zara Test', status: 'waiting', stylist: 'Amira', service: 'Haircut', customer_id: 'c1' }],
  customers: [{ id: 'c1', name: 'Zara Test', stamps: 2, gender: 'girl', expiry_date: '2027-01-01' }],
  staff_config: [{ key: 'staff_config_data', value: JSON.stringify({ stylists: ['Amira', 'Joy'] }) }, { key: 'loyalty_config', value: JSON.stringify({ stampsNeeded: 7 }) }],
  memberships: [{ id: 'm1', email: 'desk@minicuts.test', role_key: 'receptionist', all_branches: true, branch_ids: [], active: true }],
  rbac_roles: [{ key: 'receptionist', permissions: ['queue.operate', 'appointments.manage', 'customers.view', 'customers.edit', 'checkout.create', 'history.view', 'inventory.view', 'inventory.issue'], po_approval_limit: 0 }],
  branches: [{ id: 'b1', code: 'DSO', name: 'MiNiCUTS DSO', timezone: 'Asia/Dubai', currency: 'AED', active: true }],
};
async function run(signedInOnly, chain) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: 'Asia/Dubai' }); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('**/*', route => {
    const u = new URL(route.request().url()), user = route.request().headers()['authorization'] === 'Bearer ' + TOKEN;
    if (u.protocol === 'file:') return route.continue();
    if (!/supabase\.co$/.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
    const json = (s, o) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.startsWith('/auth/v1/token')) return json(200, { access_token: TOKEN, refresh_token: 'r1', expires_in: 3600, user: { email: 'desk@minicuts.test' } });
    if (!u.pathname.startsWith('/rest/v1/')) return json(200, {});
    const t = u.pathname.slice(9).split('/')[0];
    if (!user && ((signedInOnly && SALON.has(t)) || ['memberships', 'rbac_roles', 'branches'].includes(t))) return json(401, { code: '42501', message: 'permission denied for table ' + t });
    if (route.request().method() !== 'GET') return json(201, []);
    let rows = DATA[t] || []; const k = u.searchParams.get('key');
    if (t === 'staff_config' && k) { const ks = k.replace(/^(eq|in)\.\(?|\)$/g, '').split(','); rows = rows.filter(r => ks.includes(r.key)); }
    return json(200, rows);
  });
  const url = 'file://' + path.join(ROOT, 'minicuts-staff.html') + (chain ? '?chain=1' : '');
  await pg.goto(url); await pg.waitForTimeout(1500);
  if (chain) { await pg.fill('#lg-e', 'desk@minicuts.test'); await pg.fill('#lg-p', 'pw'); await pg.click('#lg-go'); await pg.waitForTimeout(2500); }
  const state = () => pg.evaluate(() => ({ queue: (document.getElementById('qt-body') || {}).innerText || '', stylists: (typeof STYLISTS !== 'undefined' ? STYLISTS : []).join(','), billing: !!(window.MC && MC.billing && MC.billing.ready) }));
  const first = await state(); let reopened = null;
  if (chain) { await pg.goto(url.replace('?chain=1', '')); await pg.waitForTimeout(3000); reopened = await state(); }
  await b.close(); return { first, reopened, errs };
}
(async () => {
  const label = (s, o) => s.queue.includes('Zara Test') && s.stylists === 'Amira,Joy' && s.billing === o;
  let r = await run(false, false);
  ok(label(r.first, true) && !r.errs.length, 'today\'s rules, without sign-in: queue, stylists and billing load (no change)');
  r = await run(false, true);
  ok(label(r.first, true) && !r.errs.length, 'today\'s rules, signed in: queue, stylists and billing load');
  r = await run(true, true);
  ok(label(r.first, true), 'signed-in-only rules: everything loads right after sign-in');
  ok(label(r.reopened, true), 'signed-in-only rules: reopening the page with the saved sign-in loads everything');
  ok(!r.errs.length, 'no page errors (' + r.errs.join('; ') + ')');
  r = await run(true, false);
  ok(!r.first.queue.includes('Zara Test'), 'signed-in-only rules, without sign-in: no salon data (expected)');
})();
