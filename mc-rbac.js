/* ============================================================================
 * mc-rbac.js — SalonChain: sign-in, roles & permissions, outlet (branch) context, Users & access screen.
 *
 * OFF BY DEFAULT. The staff app behaves exactly as before unless chain mode is switched on for this
 * device with  ?chain=1  (turn off with ?chain=0). In chain mode people sign in with Supabase Auth, the
 * app sends their JWT instead of the shared key, and every screen is limited to what their role allows.
 *
 * The permission rules here mirror sql/002_salonchain_core.sql (which is what really enforces them on
 * the server through row-level security and triggers). The UI only hides what a person may not use.
 * Pure helpers (has / approve / presets) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const R = MC.rbac = MC.rbac || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ── permission catalogue ─────────────────────────────────────────────── */
  R.PERMS = [
    { k: 'queue.operate', g: 'Front desk', l: 'Run the queue (check-in, call, stamp)' },
    { k: 'appointments.manage', g: 'Front desk', l: 'Appointments' },
    { k: 'customers.view', g: 'Front desk', l: 'See customers' },
    { k: 'customers.edit', g: 'Front desk', l: 'Edit customers' },
    { k: 'checkout.create', g: 'Billing', l: 'Checkout & invoices' },
    { k: 'discount.apply', g: 'Billing', l: 'Give discounts' },
    { k: 'invoice.void', g: 'Billing', l: 'Void invoices' },
    { k: 'history.view', g: 'Reports', l: 'History' },
    { k: 'insights.view', g: 'Reports', l: 'Insights' },
    { k: 'reports.view', g: 'Reports', l: 'Reports & tax (own outlets)' },
    { k: 'reports.view_all', g: 'Reports', l: 'Reports across all outlets' },
    { k: 'inventory.view', g: 'Stock', l: 'See stock' },
    { k: 'inventory.receive', g: 'Stock', l: 'Receive stock' },
    { k: 'inventory.issue', g: 'Stock', l: 'Record stock used' },
    { k: 'inventory.adjust', g: 'Stock', l: 'Adjust / count stock' },
    { k: 'inventory.transfer', g: 'Stock', l: 'Transfer between outlets' },
    { k: 'inventory.items', g: 'Stock', l: 'Manage items & reorder levels' },
    { k: 'suppliers.manage', g: 'Purchasing', l: 'Manage suppliers' },
    { k: 'po.view', g: 'Purchasing', l: 'See purchase orders' },
    { k: 'po.create', g: 'Purchasing', l: 'Create & submit purchase orders' },
    { k: 'po.approve', g: 'Purchasing', l: 'Approve purchase orders (up to a limit)' },
    { k: 'po.approve_own', g: 'Purchasing', l: 'Approve own purchase orders' },
    { k: 'po.receive', g: 'Purchasing', l: 'Receive goods' },
    { k: 'po.cancel', g: 'Purchasing', l: 'Cancel purchase orders' },
    { k: 'chain.overview', g: 'Admin', l: 'Group overview (all outlets)' },
    { k: 'audit.view', g: 'Admin', l: 'Audit trail' },
    { k: 'settings.branch', g: 'Admin', l: 'Outlet settings' },
    { k: 'settings.chain', g: 'Admin', l: 'Chain settings' },
    { k: 'branches.manage', g: 'Admin', l: 'Manage outlets' },
    { k: 'users.manage', g: 'Admin', l: 'Manage users & access' },
    { k: 'roles.manage', g: 'Admin', l: 'Manage roles' },
    { k: 'clients.manage', g: 'Platform', l: 'Onboard & manage client businesses (application admin only)' }
  ];
  /* same presets as the SQL seed (a test keeps the two in step) */
  const MGR = ['queue.operate', 'appointments.manage', 'customers.view', 'customers.edit', 'checkout.create', 'invoice.void', 'discount.apply', 'history.view', 'reports.view', 'insights.view', 'inventory.view', 'inventory.receive', 'inventory.issue', 'inventory.adjust', 'inventory.transfer', 'inventory.items', 'po.view', 'po.create', 'po.approve', 'po.receive', 'po.cancel', 'settings.branch'];
  R.PRESETS = {
    platform_admin: { label: 'Application admin', desc: 'Runs the platform: onboards client businesses and manages users and outlets. Every permission.', perms: ['*'], limit: null, all: true },
    owner: { label: 'Owner', desc: 'Everything for the business, every outlet (but not onboarding other client businesses).', perms: R.PERMS.map(p => p.k).filter(k => k !== 'clients.manage'), limit: null, all: true },
    controller: { label: 'Controller', desc: 'Sees every outlet, approves purchase orders, oversees stock and the audit trail. Cannot manage users.', perms: ['history.view', 'customers.view', 'reports.view', 'reports.view_all', 'insights.view', 'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.items', 'suppliers.manage', 'po.view', 'po.create', 'po.approve', 'po.receive', 'po.cancel', 'chain.overview', 'audit.view'], limit: null, all: true },
    area_manager: { label: 'Area manager', desc: 'Runs the outlets assigned to them; approves purchase orders up to a limit.', perms: MGR.concat(['chain.overview']), limit: 2000, all: false },
    branch_manager: { label: 'Branch manager', desc: 'Runs one outlet: queue, billing, stock, purchase orders (approves small ones).', perms: MGR, limit: 500, all: false },
    store_keeper: { label: 'Store keeper', desc: 'Receives and issues stock, drafts purchase orders for a manager to approve.', perms: ['inventory.view', 'inventory.receive', 'inventory.issue', 'po.view', 'po.create', 'po.receive'], limit: 0, all: false },
    receptionist: { label: 'Receptionist', desc: 'Front desk: queue, appointments, customers, checkout. Can record stock used.', perms: ['queue.operate', 'appointments.manage', 'customers.view', 'customers.edit', 'checkout.create', 'history.view', 'inventory.view', 'inventory.issue'], limit: 0, all: false },
    stylist: { label: 'Stylist', desc: 'Works the queue and records stock used.', perms: ['queue.operate', 'appointments.manage', 'customers.view', 'inventory.view', 'inventory.issue'], limit: 0, all: false },
    auditor: { label: 'Auditor (read-only)', desc: 'Can see everything, change nothing.', perms: ['history.view', 'customers.view', 'reports.view', 'reports.view_all', 'insights.view', 'inventory.view', 'po.view', 'chain.overview', 'audit.view'], limit: 0, all: true }
  };

  /* ── pure rules (no DOM, no network) ──────────────────────────────────── */
  /* ctx = { active, perms:[…], all:boolean, branches:[ids], limit:number|null } */
  R.has = function (ctx, perm, branchId) {
    if (!ctx || !ctx.active) return false;
    const p = ctx.perms || [];
    if (!(p.includes('*') || p.includes(perm))) return false;
    if (branchId == null) return true;
    return !!ctx.all || (ctx.branches || []).includes(branchId);
  };
  /* may this user approve this purchase order? (same rules the database enforces) */
  R.canApprove = function (ctx, po, email) {
    if (!po || po.status !== 'submitted') return { ok: false, reason: 'Not waiting for approval' };
    if (!R.has(ctx, 'po.approve', po.branch_id)) return { ok: false, reason: 'You cannot approve purchase orders for this outlet' };
    if (po.created_by && email && po.created_by === email && !R.has(ctx, 'po.approve_own', po.branch_id)) return { ok: false, reason: 'You created this order — someone else must approve it' };
    if (ctx.limit != null && Number(po.total) > Number(ctx.limit)) return { ok: false, reason: 'Above your approval limit (AED ' + Number(ctx.limit).toFixed(2) + ')' };
    return { ok: true };
  };

  /* ── runtime state ────────────────────────────────────────────────────── */
  const SKEY = 'mc_chain_session', BKEY = 'mc_branch';
  R.st = { session: null, member: null, role: null, branches: [], branchId: null, ready: false };
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  R.enabled = function () {
    const m = /[?&]chain=(\d)/.exec(root.location ? root.location.search : '');
    if (m) { lsSet('mc_chain', m[1] === '1' ? '1' : null); return m[1] === '1'; }
    return lsGet('mc_chain') === '1';
  };
  R.email = () => (R.st.session && R.st.session.email) || '';
  R.ctx = function () {
    const s = R.st; if (!s.member || !s.role) return { active: false };
    return { active: !!s.member.active, perms: s.role.permissions || [], all: !!s.member.all_branches, branches: s.member.branch_ids || [],
      limit: s.member.po_approval_limit != null ? Number(s.member.po_approval_limit) : (s.role.po_approval_limit != null ? Number(s.role.po_approval_limit) : null) };
  };
  /* legacy (chain mode off): everything is allowed, exactly as the app always behaved */
  MC.can = (perm, branchId) => !R.enabled() || R.has(R.ctx(), perm, branchId);
  R.can = MC.can;
  R.branch = () => R.st.branches.find(b => b.id === R.st.branchId) || null;
  R.branchName = id => { const b = R.st.branches.find(x => x.id === id); return b ? b.code : '—'; };
  R.myBranchIds = () => R.st.branches.map(b => b.id);
  R.canAt = perm => R.st.branches.filter(b => MC.can(perm, b.id)).map(b => b.id);   // outlets where this permission holds

  /* ── Supabase Auth (password grant) ───────────────────────────────────── */
  const decode = t => { try { return JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; } };
  const authCall = async (grant, body) => {
    const c = MC.conf();
    const r = await fetch(c.url + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || j.message || 'Sign-in failed');
    return j;
  };
  const setSession = j => {
    const claims = decode(j.access_token);
    R.st.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: claims.exp ? claims.exp * 1000 : Date.now() + (j.expires_in || 3600) * 1000, email: String((j.user && j.user.email) || claims.email || '').toLowerCase() };
    MC.token = j.access_token; lsSet(SKEY, JSON.stringify(R.st.session));
    clearTimeout(R._rt); R._rt = setTimeout(R.refresh, Math.max(30000, R.st.session.expires_at - Date.now() - 60000));
  };
  R.signIn = async function (email, password) { setSession(await authCall('password', { email: String(email || '').trim().toLowerCase(), password })); };
  R.refresh = async function () {
    try { setSession(await authCall('refresh_token', { refresh_token: R.st.session.refresh_token })); } catch (e) { R.signOut('Your session ended — please sign in again.'); }
  };
  R.restore = async function () {
    let s = null; try { s = JSON.parse(lsGet(SKEY) || 'null'); } catch (e) { /* ignore */ }
    if (!s || !s.access_token) return false;
    R.st.session = s; MC.token = s.access_token;
    if (s.expires_at - Date.now() < 60000) { await R.refresh(); return !!R.st.session; }
    clearTimeout(R._rt); R._rt = setTimeout(R.refresh, Math.max(30000, s.expires_at - Date.now() - 60000));
    return true;
  };
  R.signOut = function (msg) {
    clearInterval(R._idle); clearTimeout(R._rt); R.st.session = null; R.st.member = null; R.st.role = null; MC.token = null; lsSet(SKEY, null);
    R.showLogin(msg);
  };

  
  /* ── login controls ───────────────────────────────────────────────────── */
  R.SEC = { idleMinutes: 120, maxFails: 5, lockSeconds: 60 };      // idle sign-out (0 = never) is editable in Users & access → Security
  R.fails = [];
  R.lockedFor = function (now) { now = now || Date.now(); R.fails = R.fails.filter(t => now - t < 10 * 60000); return R.fails.length >= R.SEC.maxFails ? Math.max(0, Math.ceil((R.fails[R.fails.length - 1] + R.SEC.lockSeconds * 1000 - now) / 1000)) : 0; };
  R.idleExpired = (last, now, minutes) => minutes > 0 && now - last > minutes * 60000;
  R.startIdle = function () {
    clearInterval(R._idle); R._act = Date.now(); if (!(R.SEC.idleMinutes > 0) || !root.document) return;
    ['mousemove', 'keydown', 'click', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { R._act = Date.now(); }, { passive: true }));
    R._idle = setInterval(() => { if (R.st.session && R.idleExpired(R._act, Date.now(), R.SEC.idleMinutes)) R.signOut('Signed out after ' + R.SEC.idleMinutes + ' minutes of inactivity.'); }, 30000);
  };
  R.appUrl = () => root.location.origin + root.location.pathname + '?chain=1';      // where e-mail links bring people back to (must be in Supabase → Authentication → URL Configuration → Redirect URLs)
  R.recover = async function (email) { const c = MC.conf(); await fetch(c.url + '/auth/v1/recover?redirect_to=' + encodeURIComponent(R.appUrl()), { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key }, body: JSON.stringify({ email: String(email || '').trim().toLowerCase() }) }); };
  /* the link in a reset / invite e-mail lands here with the session in the address (#access_token=…&type=recovery) */
  R.readLinkHash = function () {
    const h = String((root.location && root.location.hash) || '').replace(/^#/, ''); if (!/(access_token|error)=/.test(h)) return null;
    const q = {}; h.split('&').forEach(x => { const i = x.indexOf('='); if (i > 0) q[decodeURIComponent(x.slice(0, i))] = decodeURIComponent(x.slice(i + 1).replace(/\+/g, ' ')); });
    try { root.history.replaceState(null, '', root.location.pathname + root.location.search); } catch (e) { /* ignore */ }          // never leave the token in the address bar
    if (q.error) return { error: q.error_code === 'otp_expired' ? 'That link has expired or was already used. Tap “Forgot password?” to get a new one.' : (q.error_description || 'The link could not be used.') };
    return q.access_token ? { token: q, type: q.type || 'recovery' } : null;
  };
  R.setPasswordFlow = function (type) {
    const invite = type === 'invite', ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:6px">' + (invite ? 'Welcome — choose your password' : 'Set a new password') + '</div><div class="ch-sub">Use at least 10 characters.</div>' + MC.lbl('New password') + '<input id="sp1" class="fi" type="password" autocomplete="new-password" style="margin-bottom:8px"/>' + MC.lbl('Repeat it') + '<input id="sp2" class="fi" type="password" autocomplete="new-password"/><div id="sp-m" class="ch-err" style="display:none"></div><button class="btn btn-y btn-full" id="sp-ok" style="margin-top:14px">Save and continue</button>', { width: 380, sticky: true });
    ov.style.zIndex = 10001; const $ = i => ov.querySelector('#' + i), m = t => { $('sp-m').textContent = t; $('sp-m').style.display = 'block'; };
    return new Promise(res => { $('sp-ok').onclick = async () => { if ($('sp1').value.length < 10) return m('Use at least 10 characters.'); if ($('sp1').value !== $('sp2').value) return m('The two passwords do not match.'); $('sp-ok').disabled = true; try { await R.changePassword($('sp1').value); ov.close(); res(true); } catch (e) { $('sp-ok').disabled = false; m(e.message); } }; });
  };
  R.changePassword = async function (pw) {
    if (String(pw).length < 8) throw new Error('Use at least 8 characters.');
    const c = MC.conf(), r = await fetch(c.url + '/auth/v1/user', { method: 'PUT', headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + MC.token }, body: JSON.stringify({ password: pw }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.message || 'Could not change the password'); }
  };
  /* owner-only logins service (Supabase edge function mc-admin-users). Returns {ok} or {ok:false, missing:true} when it is not deployed yet. */
  R.adminCall = async function (body) {
    const c = MC.conf(); let r; try { r = await fetch(c.url + '/functions/v1/mc-admin-users', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + MC.token }, body: JSON.stringify(body) }); } catch (e) { return { ok: false, missing: true, error: 'Could not reach the logins service' }; }
    const j = await r.json().catch(() => ({})); if (r.status === 404) return { ok: false, missing: true, error: 'Logins service is not set up yet' };
    return r.ok ? { ok: true } : { ok: false, error: j.error || j.message || 'Could not complete' };
  };
  R.tempPassword = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789', g = new Uint32Array(12); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(g) : g.forEach((_, i) => { g[i] = Math.random() * 4e9; }); return Array.from(g, x => a[x % a.length]).join('') + '#7'; };
  R.passwordDialog = function () {
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">Change my password</div>' + MC.lbl('New password') + '<input id="pw1" class="fi" type="password" autocomplete="new-password" style="margin-bottom:8px"/>' + MC.lbl('Repeat it') + '<input id="pw2" class="fi" type="password" autocomplete="new-password"/><div id="pw-m" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="pw-x">Cancel</button><button class="btn btn-y" id="pw-ok" style="flex:1">Save password</button></div>', { width: 360, sticky: true });
    const $ = i => ov.querySelector('#' + i), m = t => { $('pw-m').textContent = t; $('pw-m').style.display = 'block'; }; $('pw-x').onclick = () => ov.close();
    $('pw-ok').onclick = async () => { if ($('pw1').value !== $('pw2').value) return m('The two passwords do not match.'); $('pw-ok').disabled = true; try { await R.changePassword($('pw1').value); ov.close(); if (typeof toast === 'function') toast('Password changed'); } catch (e) { $('pw-ok').disabled = false; m(e.message); } };
  };

  /* load who I am: membership → role → outlets I may use */
  R.load = async function () {
    const me = (await MC.sb('memberships', 'GET', null, 'email=eq.' + encodeURIComponent(R.email()) + '&limit=1'))[0];
    if (!me || !me.active) throw new Error('This login has no access yet. Ask the owner to add ' + R.email() + ' under Users & access.');
    let role = (await MC.sb('rbac_roles', 'GET', null, 'key=eq.' + encodeURIComponent(me.role_key) + '&limit=1'))[0];
    if (!role && R.PRESETS[me.role_key]) { const p = R.PRESETS[me.role_key]; role = { key: me.role_key, permissions: p.perms, po_approval_limit: p.limit }; }
    if (!role) throw new Error('Role "' + me.role_key + '" is not set up.');
    R.st.member = me; R.st.role = role;
    R.st.branches = (await MC.sb('branches', 'GET', null, 'active=eq.true&order=code')).filter(b => me.all_branches || (me.branch_ids || []).includes(b.id));
    const saved = lsGet(BKEY); R.st.branchId = (R.st.branches.find(b => b.id === saved) || R.st.branches[0] || {}).id || null;
    R.st.ready = true;
  };

  /* ── styles ───────────────────────────────────────────────────────────── */
  const css = '.ch-wrap{max-width:1100px}.ch-h{font:800 20px var(--fh);color:var(--bd);margin:2px 0 4px}.ch-sub{color:var(--muted);font-size:13px;margin-bottom:14px}' +
    '.ch-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px}.ch-tab{border:1.5px solid var(--border);background:#fff;border-radius:99px;padding:6px 14px;font:800 12.5px var(--fb);color:#475569;cursor:pointer}.ch-tab.on{background:var(--b);border-color:var(--b);color:#fff}' +
    '.ch-card{background:#fff;border:1px solid var(--border);border-radius:14px;padding:14px 16px;margin-bottom:12px}.ch-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:12px}' +
    '.ch-tbl{width:100%;border-collapse:collapse;font-size:13px}.ch-tbl th{font:800 10.5px var(--fb);text-transform:uppercase;letter-spacing:.05em;color:#94A3B8;text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border);white-space:nowrap}' +
    '.ch-tbl td{padding:9px 10px;border-bottom:1px solid #EEF2F7;vertical-align:middle}.ch-tbl tr:hover td{background:#FAFCFF}.ch-r{text-align:right!important}.ch-muted{color:var(--muted)}' +
    '.ch-chip{display:inline-block;border-radius:99px;padding:2px 9px;font:800 11px var(--fb);background:#EEF2F7;color:#475569;margin:1px 3px 1px 0;white-space:nowrap}.ch-chip.ok{background:#DCFCE7;color:#166534}.ch-chip.warn{background:#FEF3C7;color:#92400E}.ch-chip.err{background:#FEE2E2;color:#B91C1C}.ch-chip.info{background:#E0EEFF;color:#1D4ED8}' +
    '.ch-kpi{font:800 26px var(--fh);color:var(--bd);line-height:1.1}.ch-kl{font:800 10.5px var(--fb);text-transform:uppercase;letter-spacing:.05em;color:#94A3B8;margin-top:3px}' +
    '.ch-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.ch-bar .fi{width:auto;min-width:150px}.ch-note{background:#F0F9FF;border:1.5px solid #BAE6FD;border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.6;color:#0C4A6E;margin:10px 0}' +
    '.ch-warn{background:#FFFBEB;border:1.5px solid #FDE68A;color:#92400E}.ch-ok{color:#15803D;font-weight:700;font-size:12.5px;margin-top:8px}.ch-err{color:var(--err);font-weight:700;font-size:12.5px;margin-top:8px}' +
    '#mc-top-chain{display:flex;align-items:center;gap:8px}#mc-top-chain select{border:1.5px solid var(--border);border-radius:99px;padding:5px 10px;font:800 12px var(--fb);color:var(--bd);background:#fff}' +
    '.ch-user{font:700 12px var(--fb);color:#475569;white-space:nowrap}.ch-user small{color:var(--muted);font-weight:600}' +
    '#mc-login{position:fixed;inset:0;z-index:9500;background:linear-gradient(160deg,#EEF5FF,#FFF8DB);display:flex;align-items:center;justify-content:center;padding:18px}' +
    '#mc-login .box{background:#fff;border-radius:20px;padding:26px 24px;width:100%;max-width:380px;box-shadow:0 18px 50px rgba(15,23,42,.18)}' +
    '.body-chain .side .tab{padding-top:clamp(3px,.8vh,8px);padding-bottom:clamp(3px,.8vh,8px)}.body-chain .nav-g{padding-top:clamp(3px,1vh,9px)}' +
    '.ch-sw{display:inline-flex;align-items:center;gap:4px;font-size:12px}.ch-x{border:0;background:none;color:var(--b);font-weight:800;cursor:pointer;font-size:12px;text-decoration:underline}' +
    '.ch-mat td,.ch-mat th{text-align:center}.ch-mat td:first-child,.ch-mat th:first-child{text-align:left}.ch-mat .grp td{background:#F8FAFC;font:800 11px var(--fb);color:#64748B;text-transform:uppercase;text-align:left}';
  R.injectCss = () => { if (document.getElementById('mc-chain-css')) return; const s = document.createElement('style'); s.id = 'mc-chain-css'; s.textContent = css; document.head.appendChild(s); };

  /* ── sign-in screen ───────────────────────────────────────────────────── */
  R.showLogin = function (msg) {
    R.injectCss(); const old = document.getElementById('mc-login'); if (old) old.remove();
    const demo = /[?&]demo=1/.test(location.search);
    const d = document.createElement('div'); d.id = 'mc-login';
    d.innerHTML = '<div class="box"><div style="font:800 22px var(--fh);color:var(--bd);">🐼 MiniCuts</div><div style="color:var(--muted);font-size:13px;margin:2px 0 16px;">Sign in to continue</div>' +
      '<label class="ch-kl" for="lg-e">E-mail</label><input id="lg-e" class="fi" type="email" autocomplete="username" style="margin:4px 0 10px"/>' +
      '<label class="ch-kl" for="lg-p">Password</label><input id="lg-p" class="fi" type="password" autocomplete="current-password" style="margin:4px 0 12px"/>' +
      '<button class="btn btn-y btn-full" id="lg-go" style="padding:12px">Sign in</button><div class="ch-err" id="lg-err" style="' + (msg ? '' : 'display:none') + '">' + esc(msg || '') + '</div><div style="text-align:center;margin-top:10px"><button type="button" class="ch-x" id="lg-forgot">Forgot password?</button></div><div class="ch-ok" id="lg-info" style="display:none"></div>' +
      (demo ? '<div class="ch-note" style="margin-top:14px"><b>Practice logins</b> (password <code>demo</code>) — tap one:<div id="lg-demo" style="margin-top:6px"></div></div>' : '') + '</div>';
    document.body.appendChild(d);
    const $ = id => d.querySelector('#' + id), go = async () => {
      const wait = R.lockedFor(); if (wait) { $('lg-err').textContent = 'Too many wrong attempts. Try again in ' + wait + ' seconds.'; $('lg-err').style.display = 'block'; return; }
      $('lg-err').style.display = 'none'; $('lg-go').disabled = true; $('lg-go').textContent = 'Signing in…';
      try { await R.signIn($('lg-e').value, $('lg-p').value); R.fails = []; await R.afterLogin(); }
      catch (e) { if (!R.st.session) R.fails.push(Date.now()); $('lg-err').textContent = e.message; $('lg-err').style.display = 'block'; R.st.session = null; MC.token = null; lsSet(SKEY, null); }
      finally { if ($('lg-go')) { $('lg-go').disabled = false; $('lg-go').textContent = 'Sign in'; } }
    };
    $('lg-forgot').onclick = async () => { const e = $('lg-e').value.trim(); if (!e) { $('lg-err').textContent = 'Type your e-mail first, then tap “Forgot password?”.'; $('lg-err').style.display = 'block'; return; } try { await R.recover(e); } catch (x) { /* never reveal whether the e-mail exists */ } $('lg-err').style.display = 'none'; $('lg-info').textContent = 'If that e-mail has an account, a reset link is on its way. Check your inbox.'; $('lg-info').style.display = 'block'; };
    $('lg-go').onclick = go; d.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    if (demo) MC.sb('memberships', 'GET', null, 'order=email').then(ms => { const h = $('lg-demo'); if (!h) return; h.innerHTML = ms.map(m => '<button type="button" class="btn btn-sm btn-ghost" style="margin:2px" data-e="' + esc(m.email) + '">' + esc(m.display_name || m.email) + ' · ' + esc((R.PRESETS[m.role_key] || {}).label || m.role_key) + '</button>').join('');
      h.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { $('lg-e').value = b.dataset.e; $('lg-p').value = 'demo'; go(); }); }).catch(() => {});
    setTimeout(() => { const e = $('lg-e'); if (e) e.focus(); }, 30);
  };
  R.afterLogin = async function () {
    await R.load();
    try { const sc = await MC.getConfig('chain_security'); if (sc && Number.isFinite(Number(sc.idle_minutes))) R.SEC.idleMinutes = Number(sc.idle_minutes); } catch (e) { /* keep default */ }
    const l = document.getElementById('mc-login'); if (l) l.remove();
    R.apply(); R.startIdle();
    // the staff page waits for the sign-in before loading (the database answers only signed-in staff): load now
    if (typeof root.mcStartData === 'function') root.mcStartData();
    if (MC.billing && typeof MC.billing.probe === 'function') MC.billing.probe();
  };

  /* ── wire the staff page: pages, nav, gating, top bar ─────────────────── */
  const NAV_PERM = { 't-queue': 'queue.operate', 't-appt': 'appointments.manage', 't-history': 'history.view', 't-customers': 'customers.view', 't-prizes': 'queue.operate', 't-freewash': 'queue.operate', 't-vouchers': 'queue.operate', 't-kod': 'queue.operate',
    't-insights': 'insights.view', 't-reports': 'reports.view', 't-config': 'settings.branch', 't-inventory': 'inventory.view', 't-po': 'po.view', 't-chain': 'chain.overview', 't-users': 'users.manage' };
  R.NAV_PERM = NAV_PERM;
  R.addPage = id => { if (document.getElementById(id)) return; const anchor = document.getElementById('t-appt'); const p = document.createElement('div'); p.className = 'page'; p.id = id; p.innerHTML = '<div id="' + id + '-root"></div>'; anchor.parentNode.appendChild(p); };
  const mkTab = (p, icon, label, onclick, badge) => { const b = document.createElement('button'); b.className = 'tab'; b.dataset.p = p; b.setAttribute('onclick', onclick); b.innerHTML = '<i>' + icon + '</i>' + label + (badge ? '<span class="nb ' + badge[1] + '" id="' + badge[0] + '"></span>' : ''); return b; };
  R.buildNav = function () {
    if (document.getElementById('nb-po')) return;
    const side = document.getElementById('side'), groups = [...side.querySelectorAll('.nav-g')], find = t => groups.find(g => g.textContent.trim() === t);
    ['t-inventory', 't-po', 't-chain', 't-users'].forEach(R.addPage);
    const g = document.createElement('div'); g.className = 'nav-g'; g.textContent = 'Stock & purchasing';
    const ins = find('Insights'); ins.parentNode.insertBefore(g, ins);
    const inv = mkTab('t-inventory', '📦', 'Stock', "showTab('t-inventory');MC.inventory.init();", ['nb-low', 'amber']), po = mkTab('t-po', '🧾', 'Purchase orders', "showTab('t-po');MC.purchasing.init();", ['nb-po', 'amber']);
    ins.parentNode.insertBefore(inv, ins); ins.parentNode.insertBefore(po, ins);
    const rep = side.querySelector('[data-p="t-reports"]'); rep.after(mkTab('t-chain', '🏢', 'Group overview', "showTab('t-chain');MC.chain.init();"));
    const cfg = side.querySelector('[data-p="t-config"]'); cfg.after(mkTab('t-users', '🔐', 'Users &amp; access', "showTab('t-users');MC.rbac.initUsers();"));
  };
  R.gate = function () {
    const side = document.getElementById('side');
    side.querySelectorAll('.tab[data-p]').forEach(b => { const perm = NAV_PERM[b.dataset.p]; if (perm) b.style.display = MC.can(perm) ? '' : 'none'; });
    const mg = side.querySelector('[onclick*="staff-mgmt"]'); if (mg) mg.style.display = MC.can('settings.branch') ? '' : 'none';
    side.querySelectorAll('.nav-g').forEach(g => { let n = g.nextElementSibling, any = false; while (n && !n.classList.contains('nav-g')) { if (n.style.display !== 'none') any = true; n = n.nextElementSibling; } g.style.display = any ? '' : 'none'; });
    const act = side.querySelector('.tab.active');
    if (!act || act.style.display === 'none') { const first = [...side.querySelectorAll('.tab[data-p]')].find(b => b.style.display !== 'none'); if (first) first.click(); }
  };
  R.topbar = function () {
    const slot = document.getElementById('mc-top-chain'); if (!slot) return;
    const m = R.st.member, role = (R.PRESETS[m.role_key] || {}).label || R.st.role.label || m.role_key;
    slot.innerHTML = (R.st.branches.length > 1 ? '<span class="ch-sw">📍 <select id="mc-branch">' + R.st.branches.map(b => '<option value="' + esc(b.id) + '"' + (b.id === R.st.branchId ? ' selected' : '') + '>' + esc(b.code) + ' · ' + esc(b.name.replace(/^MiNiCUTS\s*[—-]\s*/i, '')) + '</option>').join('') + '</select></span>'
      : '<span class="ch-chip info">📍 ' + esc((R.branch() || {}).code || 'no outlet') + '</span>') +
      '<span class="ch-user">👤 ' + esc(m.display_name || m.email) + ' <small>· ' + esc(role) + '</small></span><button class="ch-x" id="mc-pw">Password</button><button class="ch-x" id="mc-signout">Sign out</button>';
    const sel = slot.querySelector('#mc-branch'); if (sel) sel.onchange = () => R.setBranch(sel.value);
    slot.querySelector('#mc-pw').onclick = () => R.passwordDialog();
    slot.querySelector('#mc-signout').onclick = () => R.signOut();
  };
  R.setBranch = function (id) { R.st.branchId = id; lsSet(BKEY, id); document.dispatchEvent(new CustomEvent('mc-branch-change', { detail: id })); R.badges(true); };
  R.apply = function () {
    R.injectCss(); document.body.classList.add('body-chain');
    R.buildNav(); R.gate(); R.topbar(); R.badges(true);
  };
  /* small red/amber counters in the menu: low-stock items, purchase orders waiting for me */
  R.badges = async function (force) {
    const now = Date.now(); if (!force && R._bt && now - R._bt < 60000) return; R._bt = now;
    const set = (id, n) => { const e = document.getElementById(id); if (!e) return; e.textContent = n > 99 ? '99+' : n; e.classList.toggle('on', n > 0); };
    try { if (MC.inventory && MC.can('inventory.view')) set('nb-low', await MC.inventory.lowCount()); } catch (e) { /* tables not created yet */ }
    try { if (MC.purchasing && MC.can('po.view')) set('nb-po', await MC.purchasing.waitingForMe()); } catch (e) { /* tables not created yet */ }
  };

  /* ── Users & access screen ────────────────────────────────────────────── */
  const U = R.users = { tab: 'users' };
  R.initUsers = async function () {
    R.injectCss(); const el = document.getElementById('t-users-root'); if (!el) return;
    if (!MC.can('users.manage')) { el.innerHTML = '<div class="ch-card">You do not have access to this screen.</div>'; return; }
    el.innerHTML = '<div class="ch-wrap"><div class="ch-h">Users &amp; access</div><div class="ch-sub">Who can sign in, what they may do, and which outlets they can see.</div>' +
      '<div class="ch-tabs">' + [['users', '👥 Users'], ['roles', '🔑 Roles'], ['outlets', '🏬 Outlets'], ['security', '🛡 Sign-in security']].map(t => '<button class="ch-tab' + (U.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="us-body">Loading…</div></div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { U.tab = b.dataset.t; R.initUsers(); });
    try {
      const [ms, roles, brs] = await Promise.all([MC.sb('memberships', 'GET', null, 'order=email'), MC.sb('rbac_roles', 'GET', null, 'order=key'), MC.sb('branches', 'GET', null, 'order=code')]);
      U.ms = ms; U.roles = roles; U.brs = brs;
      ({ users: U.renderUsers, roles: U.renderRoles, outlets: U.renderOutlets, security: U.renderSecurity })[U.tab]();
    } catch (e) { document.getElementById('us-body').innerHTML = '<div class="ch-note ch-warn">Could not load: ' + esc(e.message) + '<br>If this says a table does not exist, the SalonChain database script (sql/002) has not been applied yet.</div>'; }
  };
  const roleLabel = k => ((U.roles || []).find(r => r.key === k) || R.PRESETS[k] || {}).label || k;
  U.renderUsers = function () {
    const body = document.getElementById('us-body'), me = R.email();
    body.innerHTML = '<div class="ch-bar"><button class="btn btn-y btn-sm" id="us-add">＋ Add user</button></div><div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Person</th><th>Role</th><th>Outlets</th><th class="ch-r">PO approval limit</th><th>Status</th><th></th></tr></thead><tbody>' +
      U.ms.map(m => '<tr><td><b>' + esc(m.display_name || m.email) + '</b><div class="ch-muted" style="font-size:11.5px">' + esc(m.email) + (m.email === me ? ' · you' : '') + '</div></td><td>' + esc(roleLabel(m.role_key)) + '</td><td>' +
        (m.all_branches ? '<span class="ch-chip info">All outlets</span>' : (m.branch_ids || []).map(id => '<span class="ch-chip">' + esc(((U.brs.find(b => b.id === id)) || {}).code || '?') + '</span>').join('') || '<span class="ch-muted">none</span>') + '</td><td class="ch-r">' + (m.po_approval_limit != null ? 'AED ' + Number(m.po_approval_limit).toLocaleString() : '<span class="ch-muted">role default</span>') + '</td><td>' +
        (m.active ? '<span class="ch-chip ok">Active</span>' : '<span class="ch-chip err">Off</span>') + '</td><td class="ch-r"><button class="btn btn-ghost btn-sm" data-e="' + esc(m.id) + '">Edit</button></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="ch-note"><b>How to add someone:</b> tap <b>Add user</b>, fill in the e-mail, role and outlets, and choose how they get their login (an invite e-mail, a temporary password, or one you create yourself in Supabase). They sign in with that e-mail. Staff without a personal e-mail can use a made-up address such as <code>lester@minicuts.ae</code> with the temporary-password option.</div>';
    body.querySelector('#us-add').onclick = () => U.edit(null); body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => U.edit(U.ms.find(m => m.id === b.dataset.e)));
  };
  const ADM = k => k === 'owner' || k === 'platform_admin';
  U.edit = function (m) {
    const isNew = !m; m = m || { email: '', display_name: '', role_key: 'stylist', all_branches: false, branch_ids: [], po_approval_limit: null, active: true };
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + (isNew ? 'Add user' : 'Edit user') + '</div>' +
      '<div style="display:grid;gap:10px"><div>' + MC.lbl('E-mail (their login)') + '<input id="ue-email" class="fi" type="email" value="' + esc(m.email) + '"' + (isNew ? '' : ' disabled') + '/></div>' +
      '<div>' + MC.lbl('Name') + '<input id="ue-name" class="fi" value="' + esc(m.display_name || '') + '"/></div>' +
      '<div>' + MC.lbl('Role') + '<select id="ue-role" class="fi">' + U.roles.map(r => '<option value="' + esc(r.key) + '"' + (r.key === m.role_key ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') + '</select><div id="ue-desc" class="ch-muted" style="font-size:12px;margin-top:4px"></div></div>' +
      '<div>' + MC.lbl('Outlets they can use') + '<label style="display:flex;gap:6px;font-size:13px;margin-bottom:4px"><input type="checkbox" id="ue-all"' + (m.all_branches ? ' checked' : '') + '/> All outlets (including new ones)</label><div id="ue-brs" style="display:flex;gap:10px;flex-wrap:wrap">' +
        U.brs.map(b => '<label style="font-size:13px"><input type="checkbox" data-b="' + esc(b.id) + '"' + ((m.branch_ids || []).includes(b.id) ? ' checked' : '') + '/> ' + esc(b.code) + '</label>').join('') + '</div></div>' +
      '<div>' + MC.lbl('Purchase-order approval limit (AED) — blank = use the role’s limit') + '<input id="ue-lim" class="fi" type="number" min="0" step="50" value="' + (m.po_approval_limit != null ? esc(m.po_approval_limit) : '') + '"/></div>' +
      '<label style="display:flex;gap:6px;font-size:13px"><input type="checkbox" id="ue-act"' + (m.active ? ' checked' : '') + '/> Active (untick to switch off their access)</label>' +
      (isNew ? '<div class="ch-card" style="margin:0"><b style="font-size:13px">Their login</b>' +
        '<label style="display:flex;gap:6px;font-size:13px;margin-top:6px"><input type="radio" name="ue-lg" value="invite" checked/> E-mail them an invite — they choose their own password</label>' +
        '<label style="display:flex;gap:6px;font-size:13px;margin-top:4px"><input type="radio" name="ue-lg" value="temp"/> Create it now with a temporary password (for staff without e-mail access)</label>' +
        '<label style="display:flex;gap:6px;font-size:13px;margin-top:4px"><input type="radio" name="ue-lg" value="none"/> I will create the login in Supabase myself</label></div>'
      : '<div><button type="button" class="btn btn-ghost btn-sm" id="ue-reset">✉️ Send password-reset e-mail</button> <span id="ue-resetm" class="ch-ok"></span></div>') + '</div>' +
      '<div id="ue-msg" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="ue-x">Cancel</button><button class="btn btn-y" id="ue-save" style="flex:1">Save</button></div>', { width: 460, sticky: true });
    const $ = id => ov.querySelector('#' + id), paint = () => { const r = U.roles.find(x => x.key === $('ue-role').value) || {}; $('ue-desc').textContent = r.description || ''; $('ue-brs').style.opacity = $('ue-all').checked ? .4 : 1; };
    if ($('ue-reset')) $('ue-reset').onclick = async () => { try { await R.recover(m.email); $('ue-resetm').textContent = 'Sent (if the login exists)'; } catch (e) { $('ue-resetm').textContent = ''; } };
    $('ue-role').onchange = () => { const p = R.PRESETS[$('ue-role').value]; if (p && isNew) $('ue-all').checked = !!p.all; paint(); }; $('ue-all').onchange = paint; paint(); $('ue-x').onclick = () => ov.close();
    $('ue-save').onclick = async () => {
      const msg = $('ue-msg'), fail = t => { msg.textContent = t; msg.style.display = 'block'; };
      const email = $('ue-email').value.trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid e-mail.');
      if (isNew && U.ms.some(x => x.email === email)) return fail('That e-mail is already added.');
      const all = $('ue-all').checked, brs = [...ov.querySelectorAll('[data-b]:checked')].map(x => x.dataset.b);
      if (!all && !brs.length) return fail('Pick at least one outlet, or tick “All outlets”.');
      const lim = $('ue-lim').value === '' ? null : Number($('ue-lim').value); if (lim != null && (isNaN(lim) || lim < 0)) return fail('Limit must be a positive number.');
      const row = { display_name: $('ue-name').value.trim() || null, role_key: $('ue-role').value, all_branches: all, branch_ids: all ? [] : brs, po_approval_limit: lim, active: $('ue-act').checked };
      if (m.email === R.email() && (!row.active || (ADM(m.role_key) && !ADM(row.role_key)))) return fail('You cannot switch off or demote your own login.');
      if (ADM(row.role_key) || ADM(m.role_key)) { const owners = U.ms.filter(x => ADM(x.role_key) && x.active && x.email !== m.email).length + (ADM(row.role_key) && row.active ? 1 : 0); if (!owners) return fail('There must always be at least one active owner or application admin.'); }
      $('ue-save').disabled = true;
      const mode = isNew ? (ov.querySelector('[name="ue-lg"]:checked') || {}).value : null;
      try {
        if (isNew) await MC.sb('memberships', 'POST', Object.assign({ email }, row), null, 'return=minimal'); else await MC.sb('memberships', 'PATCH', row, 'id=eq.' + m.id, 'return=minimal');
        let info = '', pw = null, bad = '';
        if (mode === 'invite') { const r = await R.adminCall({ action: 'invite', email, redirect_to: R.appUrl() }); info = r.ok ? 'Invite e-mail sent to ' + email + '.' : (bad = r.missing ? 'Saved, but the logins service is not set up yet — create the login in Supabase → Authentication → Users (same e-mail).' : 'Saved, but the invite failed: ' + r.error); }
        else if (mode === 'temp') { pw = R.tempPassword(); const r = await R.adminCall({ action: 'create', email, password: pw }); if (r.ok) info = 'Login created.'; else { pw = null; bad = r.missing ? 'Saved, but the logins service is not set up yet — create the login in Supabase → Authentication → Users (same e-mail).' : 'Saved, but creating the login failed: ' + r.error; } }
        else if (!isNew && m.active !== row.active) { const r = await R.adminCall({ action: 'set_banned', email: m.email, banned: !row.active }); if (!r.ok && !r.missing) bad = 'Saved, but blocking the login failed: ' + r.error; }
        ov.close(); await R.initUsers();
        if (pw) MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:8px">Login created</div><div style="font-size:13px;margin-bottom:8px">Give <b>' + esc(email) + '</b> this temporary password. It is shown <b>only once</b>; they should change it after signing in (top bar → Password).</div><div id="tp" style="font:800 20px monospace;background:#F1F5F9;border-radius:10px;padding:12px;text-align:center;user-select:all">' + esc(pw) + '</div><button class="btn btn-y btn-full" id="tp-x" style="margin-top:12px">Done</button>', { width: 380, sticky: true }).querySelector('#tp-x').onclick = e => e.target.closest('.mc-ov').remove();
        else if (bad) MC.modal('<div class="ch-note ch-warn">' + esc(bad) + '</div><button class="btn btn-y btn-full" id="tp-x" style="margin-top:12px">OK</button>', { width: 400, sticky: true }).querySelector('#tp-x').onclick = e => e.target.closest('.mc-ov').remove();
        else if (info && typeof toast === 'function') toast(info);
      }
      catch (e) { $('ue-save').disabled = false; fail(e.message); }
    };
  };
  U.renderRoles = function () {
    const roles = U.roles.slice().sort((a, b) => Object.keys(R.PRESETS).indexOf(a.key) - Object.keys(R.PRESETS).indexOf(b.key)), groups = [...new Set(R.PERMS.map(p => p.g))];
    document.getElementById('us-body').innerHTML = '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl ch-mat"><thead><tr><th>Permission</th>' + roles.map(r => '<th>' + esc(r.label) + '</th>').join('') + '</tr></thead><tbody>' +
      groups.map(g => '<tr class="grp"><td colspan="' + (roles.length + 1) + '">' + esc(g) + '</td></tr>' + R.PERMS.filter(p => p.g === g).map(p => '<tr><td>' + esc(p.l) + '</td>' + roles.map(r => '<td>' + ((r.permissions || []).includes('*') || (r.permissions || []).includes(p.k) ? '<span style="color:#16A34A;font-weight:800">✓</span>' : '<span style="color:#CBD5E1">·</span>') + '</td>').join('') + '</tr>').join('')).join('') +
      '<tr class="grp"><td colspan="' + (roles.length + 1) + '">Purchase-order approval limit</td></tr><tr><td>AED up to</td>' + roles.map(r => '<td>' + ((r.permissions || []).includes('*') || (r.permissions || []).includes('po.approve') ? (r.po_approval_limit == null ? 'No limit' : Number(r.po_approval_limit).toLocaleString()) : '—') + '</td>').join('') + '</tr></tbody></table></div>' +
      '<div class="ch-note">Roles are fixed presets in this version. A person’s <b>outlets</b> and an individual <b>approval limit</b> are set per user. Custom roles can be added later.</div>';
  };
  U.renderSecurity = function () {
    const b = document.getElementById('us-body'), on = (U.ms || []).filter(m => m.active).length;
    b.innerHTML = '<div class="ch-card"><b>How people sign in</b><div class="ch-sub" style="margin:6px 0 0">Each person has their own e-mail and password (Supabase Auth). The app then looks up their role and outlets. A person who is switched off under <b>Users</b> is refused at once, even with a correct password. Right now <b>' + on + '</b> of ' + (U.ms || []).length + ' users are active.</div></div>' +
      '<div class="ch-card"><b>Automatic sign-out when idle</b><div class="ch-sub" style="margin:6px 0 8px">Protects an unattended screen. Use 0 to never sign out (front-desk tablet).</div><div style="display:flex;gap:8px;align-items:center"><input id="sc-idle" class="fi" type="number" min="0" step="5" style="width:110px" value="' + esc(R.SEC.idleMinutes) + '"/> minutes <button class="btn btn-y btn-sm" id="sc-save">Save</button><span id="sc-m" class="ch-ok"></span></div></div>' +
      '<div class="ch-card"><b>Built in</b><ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.7"><li>5 wrong passwords in 10 minutes pauses sign-in on that screen for a minute (Supabase also rate-limits on its side).</li><li>“Forgot password?” sends a reset e-mail; every user can change their own password from the top bar.</li><li>Every change to users, roles, stock and purchase orders is written to the audit trail.</li></ul></div>' +
      '<div class="ch-card ch-warn"><b>Switch these on in the Supabase dashboard (Authentication)</b><ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.7"><li><b>Turn OFF “Allow new users to sign up”</b> — so only people you create can ever have a login.</li><li>Minimum password length 10 and “Require leaked-password protection” if your plan offers it.</li><li>Turn on e-mail confirmation, and add multi-factor (authenticator app) for owners when you are ready.</li><li>Create each login there with the <b>same e-mail</b> you add under Users.</li></ul></div>';
    b.querySelector('#sc-save').onclick = async () => { const v = Math.max(0, parseInt(b.querySelector('#sc-idle').value, 10) || 0); try { await MC.setConfig('chain_security', { idle_minutes: v }); R.SEC.idleMinutes = v; R.startIdle(); b.querySelector('#sc-m').textContent = 'Saved'; } catch (e) { b.querySelector('#sc-m').textContent = ''; if (typeof toast === 'function') toast('Could not save: ' + e.message, 'err'); } };
  };
  U.renderOutlets = function () {
    const body = document.getElementById('us-body'), can = MC.can('branches.manage');
    body.innerHTML = (can ? '<div class="ch-bar"><button class="btn btn-y btn-sm" id="ou-add">＋ Add outlet</button></div>' : '') + '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Code</th><th>Name</th><th>Address</th><th>Time zone</th><th>Currency</th><th>Status</th><th></th></tr></thead><tbody>' +
      U.brs.map(b => '<tr><td><b>' + esc(b.code) + '</b></td><td>' + esc(b.name) + '</td><td>' + esc(b.address || '') + '</td><td>' + esc(b.timezone) + '</td><td>' + esc(b.currency) + '</td><td>' + (b.active ? '<span class="ch-chip ok">Open</span>' : '<span class="ch-chip err">Closed</span>') + '</td><td class="ch-r">' + (can ? '<button class="btn btn-ghost btn-sm" data-b="' + esc(b.id) + '">Edit</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="ch-note">Stock and purchase orders are already kept per outlet. The queue, appointments and billing screens move to per-outlet data in the next phase (see doc/SALONCHAIN_DESIGN.md).</div>';
    if (can) { body.querySelector('#ou-add').onclick = () => U.editBranch(null); body.querySelectorAll('[data-b]').forEach(b => b.onclick = () => U.editBranch(U.brs.find(x => x.id === b.dataset.b))); }
  };
  U.editBranch = function (b) {
    const isNew = !b; b = b || { code: '', name: '', address: '', timezone: 'Asia/Dubai', currency: 'AED', active: true };
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + (isNew ? 'Add outlet' : 'Edit outlet') + '</div><div style="display:grid;gap:10px">' +
      '<div style="display:grid;grid-template-columns:1fr 2fr;gap:8px"><div>' + MC.lbl('Code') + '<input id="bo-code" class="fi" maxlength="6" value="' + esc(b.code) + '"' + (isNew ? '' : ' disabled') + ' placeholder="MIR"/></div><div>' + MC.lbl('Name') + '<input id="bo-name" class="fi" value="' + esc(b.name) + '" placeholder="MiNiCUTS — Mirdif"/></div></div>' +
      '<div>' + MC.lbl('Address') + '<input id="bo-addr" class="fi" value="' + esc(b.address || '') + '"/></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div>' + MC.lbl('Time zone') + '<input id="bo-tz" class="fi" value="' + esc(b.timezone) + '"/></div><div>' + MC.lbl('Currency') + '<input id="bo-cur" class="fi" maxlength="3" value="' + esc(b.currency) + '"/></div></div>' +
      '<label style="display:flex;gap:6px;font-size:13px"><input type="checkbox" id="bo-act"' + (b.active ? ' checked' : '') + '/> Open (untick to close the outlet)</label></div><div id="bo-msg" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="bo-x">Cancel</button><button class="btn btn-y" id="bo-save" style="flex:1">Save</button></div>', { width: 440, sticky: true });
    const $ = id => ov.querySelector('#' + id); $('bo-x').onclick = () => ov.close();
    $('bo-save').onclick = async () => {
      const fail = t => { $('bo-msg').textContent = t; $('bo-msg').style.display = 'block'; }, code = $('bo-code').value.trim().toUpperCase();
      if (!/^[A-Z0-9]{2,6}$/.test(code)) return fail('Code: 2–6 letters or digits, e.g. MIR.'); if (!$('bo-name').value.trim()) return fail('Enter the outlet name.');
      if (isNew && U.brs.some(x => x.code === code)) return fail('That code is already used.');
      const row = { name: $('bo-name').value.trim(), address: $('bo-addr').value.trim() || null, timezone: $('bo-tz').value.trim() || 'Asia/Dubai', currency: ($('bo-cur').value.trim() || 'AED').toUpperCase(), active: $('bo-act').checked };
      try { if (isNew) await MC.sb('branches', 'POST', Object.assign({ code }, row), null, 'return=minimal'); else await MC.sb('branches', 'PATCH', row, 'id=eq.' + b.id, 'return=minimal'); ov.close(); R.initUsers(); }
      catch (e) { fail(e.message); }
    };
  };

  /* ── start-up ─────────────────────────────────────────────────────────── */
  R.boot = async function () {
    if (!R.enabled() || !root.document) return;
    R.injectCss(); document.body.classList.add('body-chain'); R.showLogin();
    const link = R.readLinkHash();
    if (link && link.error) { R.showLogin(link.error); return; }
    if (link && link.token) { try { setSession(link.token); await R.load(); await R.setPasswordFlow(link.type); await R.afterLogin(); } catch (e) { R.signOut(e.message); } return; }
    try { if (await R.restore()) await R.afterLogin(); } catch (e) { R.signOut(e.message); }
  };
  if (root.document) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(R.boot, 0)); else setTimeout(R.boot, 0); }
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
