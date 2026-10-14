/* ============================================================================
 * mc-customers.js — Customers screen for the staff app: instant search, filters,
 * and a full profile (loyalty passport, visits, invoices, cycles, prizes, appointments).
 *
 * Read-mostly: the only writes are "Edit details" (PATCH customers, same fields the
 * Loyalty app edits) and the missing-details dialog that already exists (MC.profileDialog).
 * Stamps are never changed here — they keep moving only through the queue, as today.
 * Pure helpers (status, age, filter, stats) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const C = MC.customers = MC.customers || {};
  const num = v => Number(v) || 0;
  const DAY = 864e5;

  /* ── pure helpers ─────────────────────────────────────────────────────── */
  C.cfg = function () {
    const L = (typeof LCFG !== 'undefined' && LCFG) ? LCFG : {};
    return { paid: Math.max(1, (Number(L.stampsNeeded) || 6) - 1),
      lapsedBoy: Number(L.boyLapsedWeeks) || 12, lapsedGirl: Number(L.girlLapsedWeeks) || 26,
      warnBoy: Number(L.boyExpiryWarnDays) || 30, warnGirl: Number(L.girlExpiryWarnDays) || 45 };
  };
  /* one status per child — same rules as the Loyalty app (expired › free wash ready › expiring › lapsed › active) */
  C.status = function (c, cfg, now) {
    cfg = cfg || C.cfg(); now = now || new Date();
    const girl = c.gender === 'girl', st = num(c.stamps);
    const exp = c.expiry_date && c.first_stamp_date && now > new Date(c.expiry_date);
    if (exp) return { key: 'expired', label: 'Expired', cls: 'err' };
    if (st >= cfg.paid) return { key: 'ready', label: 'Free wash ready 🚿', cls: 'warn' };
    if (c.expiry_date) { const left = Math.ceil((new Date(c.expiry_date) - now) / DAY); if (left <= (girl ? cfg.warnGirl : cfg.warnBoy)) return { key: 'expiring', label: 'Expiring in ' + Math.max(left, 0) + 'd ⏰', cls: 'warn' }; }
    const last = c.last_visit_date || c.first_stamp_date;
    if (!last) return { key: 'new', label: 'New', cls: 'info' };
    const weeks = (now - new Date(last)) / (7 * DAY);
    if (weeks > (girl ? cfg.lapsedGirl : cfg.lapsedBoy)) return { key: 'lapsed', label: 'Lapsed 😴', cls: 'err' };
    return { key: 'active', label: 'Active', cls: 'ok' };
  };
  C.age = function (dob, now) {
    if (!dob) return '';
    now = now || new Date(); const d = new Date(String(dob).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return '';
    let m = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth(); if (now.getDate() < d.getDate()) m--;
    if (m < 0) return '';
    return m < 24 ? m + ' mo' : Math.floor(m / 12) + ' yr' + (m % 12 ? ' ' + (m % 12) + ' mo' : '');
  };
  C.phone = m => { const n = MC.last9(m); return n.length === 9 ? '0' + n.slice(0, 2) + ' ' + n.slice(2, 5) + ' ' + n.slice(5) : String(m || ''); };
  /* search: digits → match the mobile; otherwise name / parent contains; every word must match */
  C.matches = function (c, term) {
    term = String(term || '').trim().toLowerCase(); if (!term) return true;
    const digits = term.replace(/\D/g, '');
    if (digits.length >= 3 && digits.length >= term.replace(/\s/g, '').length - 1) return MC.last9(c.mobile).includes(MC.last9(digits)) || String(c.mobile || '').includes(digits);
    const hay = (String(c.name || '') + ' ' + String(c.parent || '')).toLowerCase();
    return term.split(/\s+/).every(w => hay.includes(w));
  };
  C.filter = function (all, term, f, cfg, now) {
    return all.filter(c => {
      if (!C.matches(c, term)) return false;
      if (!f || f === 'all') return true;
      if (f === 'missing') return MC.profileGaps(c).length > 0;
      return C.status(c, cfg, now).key === f;
    });
  };
  C.family = (all, c) => all.filter(x => x.id !== c.id && MC.last9(x.mobile) && MC.last9(x.mobile) === MC.last9(c.mobile));
  /* per-child numbers from their finished queue rows */
  C.stats = function (rows) {
    rows = (rows || []).filter(r => r.status === 'done' || r.status == null);
    const dates = Array.from(new Set(rows.map(r => String(r.checkin_date || '').slice(0, 10)).filter(Boolean))).sort();
    let gap = null;
    if (dates.length > 1) gap = Math.round((new Date(dates[dates.length - 1] + 'T12:00:00') - new Date(dates[0] + 'T12:00:00')) / DAY / (dates.length - 1));
    const top = key => { const m = {}; rows.forEach(r => { const k = r[key]; if (k) m[k] = (m[k] || 0) + 1; }); const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? e[0] : ''; };
    const spent = rows.reduce((a, r) => a + num(r.service_value), 0);
    return { visits: rows.length, spent, avg: rows.length ? spent / rows.length : 0, tips: rows.reduce((a, r) => a + num(r.tip), 0),
      last: dates.length ? dates[dates.length - 1] : '', first: dates[0] || '', gapDays: gap, favService: top('service'), favStylist: top('stylist') };
  };

  /* ── UI ───────────────────────────────────────────────────────────────── */
  C.st = { all: [], loadedAt: 0, term: '', f: 'all', limit: 40, cur: null, tab: 'visits', ver: 0 };
  const style = `
  .cu{display:grid;grid-template-columns:minmax(300px,390px) 1fr;gap:16px;align-items:start;}
  .cu-list,.cu-detail{background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,.04);}
  .cu-list{padding:14px;position:sticky;top:0;max-height:calc(100vh - 150px);display:flex;flex-direction:column;}
  .cu-search{position:relative;margin-bottom:10px;}
  .cu-search input{padding:11px 12px 11px 38px;border-radius:12px;font-size:14px;}
  .cu-search span{position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:15px;opacity:.55;}
  .cu-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
  .cu-chip{border:1px solid var(--border);background:#fff;border-radius:99px;padding:5px 11px;font:700 12px var(--fb);color:var(--muted);cursor:pointer;}
  .cu-chip.on{background:var(--b);border-color:var(--b);color:#fff;}
  .cu-rows{overflow:auto;flex:1;margin:0 -6px;padding:0 6px;}
  .cu-row{display:flex;gap:10px;align-items:center;padding:10px;border-radius:12px;cursor:pointer;border:1px solid transparent;}
  .cu-row:hover{background:#F5F8FF;}.cu-row.on{background:#EAF1FF;border-color:#C7D9FF;}
  .cu-av{width:38px;height:38px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;background:#E8F0FE;}
  .cu-av.girl{background:#FCE7F3;}
  .cu-nm{font-weight:800;font-size:14px;line-height:1.2;}.cu-sub{font-size:12px;color:var(--muted);line-height:1.3;}
  .cu-dots{display:flex;gap:2px;margin-top:3px;}.cu-dots i{width:8px;height:8px;border-radius:50%;background:#E2E8F0;display:block;}.cu-dots i.on{background:var(--b);}
  .cu-badge{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:99px;white-space:nowrap;}
  .cu-badge.ok{background:#DCFCE7;color:#166534;}.cu-badge.warn{background:#FEF3C7;color:#92400E;}.cu-badge.err{background:#FEE2E2;color:#991B1B;}.cu-badge.info{background:#DBEAFE;color:#1E40AF;}
  .cu-detail{padding:18px;min-height:300px;}
  .cu-head{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;}
  .cu-head .cu-av{width:58px;height:58px;font-size:30px;border-radius:18px;}
  .cu-h1{font:900 22px var(--fh);line-height:1.1;}
  .cu-meta{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:5px;}
  .cu-act{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto;}
  .cu-pass{margin:16px 0;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,#0D47A1,#1976D2);color:#fff;}
  .cu-pass .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;opacity:.75;margin-bottom:8px;}
  .cu-stamps{display:flex;gap:7px;flex-wrap:wrap;}.cu-stamps b{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.18);font-size:16px;}
  .cu-stamps b.on{background:#FFD600;}
  .cu-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px;}
  .cu-kpi{border:1px solid var(--border);border-radius:12px;padding:10px 12px;background:#FAFBFF;}.cu-kpi .n{font:900 20px var(--fh);color:var(--bd);line-height:1.1;}.cu-kpi .l{font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}
  .cu-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:10px;overflow-x:auto;}
  .cu-tab{border:none;background:none;padding:9px 12px;font:800 13px var(--fb);color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px;white-space:nowrap;}
  .cu-tab.on{color:var(--b);border-bottom-color:var(--b);}
  .cu-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}.cu-tbl th{text-align:left;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--border);}
  .cu-tbl td{padding:8px;border-bottom:1px solid #F1F5F9;}
  .cu-warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:12px;padding:9px 12px;font-size:12.5px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
  .cu-back{display:none;}
  @media (max-width:900px){.cu{grid-template-columns:minmax(0,1fr);}.cu-detail{min-width:0;}.cu-list{position:static;max-height:none;}.cu.detail .cu-list{display:none;}.cu:not(.detail) .cu-detail{display:none;}.cu-back{display:inline-flex;margin-bottom:10px;}.cu-act{margin-left:0;}}`;

  const ico = c => '<div class="cu-av ' + (c.gender === 'girl' ? 'girl' : '') + '">' + (c.gender === 'girl' ? '👧' : c.gender === 'boy' ? '👦' : '🧒') + '</div>';
  const dots = (st, paid) => '<div class="cu-dots">' + Array.from({ length: paid }, (_, i) => '<i class="' + (i < st ? 'on' : '') + '"></i>').join('') + '</div>';
  const badge = s => '<span class="cu-badge ' + s.cls + '">' + MC.esc(s.label) + '</span>';

  C.load = async function (force) {
    if (!force && C.st.all.length && Date.now() - C.st.loadedAt < 60000) return;
    C.st.all = await MC.sbAll('customers', 'select=id,name,mobile,gender,parent,notes,stamps,redemptions,first_stamp_date,expiry_date,created_at,dob,last_visit_date,dnd,game_points,location,heard_via,tc_accepted&order=name.asc');
    C.st.loadedAt = Date.now();
  };

  C.init = async function () {
    const el = document.getElementById('mc-customers-root'); if (!el) return;
    if (!document.getElementById('cu-style')) { const s = document.createElement('style'); s.id = 'cu-style'; s.textContent = style; document.head.appendChild(s); }
    if (!el.dataset.ready) {
      el.dataset.ready = '1';
      el.innerHTML = '<div class="cu" id="cu"><div class="cu-list"><div class="cu-search"><span>🔍</span><input class="fi" id="cu-q" type="search" autocomplete="off" placeholder="Search name, parent or mobile"/></div>' +
        '<div class="cu-chips" id="cu-chips"></div><div id="cu-count" class="cu-sub" style="margin:0 2px 6px;"></div><div class="cu-rows" id="cu-rows"></div></div>' +
        '<div class="cu-detail" id="cu-detail"><div style="color:var(--muted);text-align:center;padding:60px 10px;"><div style="font-size:42px;">🐼</div><div style="font:800 17px var(--fh);color:var(--text);margin:6px 0;">Find a customer</div>Search by name, parent or mobile number to see their passport, visits and invoices.</div></div></div>';
      let t = null; el.querySelector('#cu-q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { C.st.term = e.target.value; C.st.limit = 40; C.renderList(); }, 120); });
    }
    el.querySelector('#cu-rows').innerHTML = '<div class="cu-sub" style="padding:20px;">Loading customers…</div>';
    try { await C.load(); } catch (e) { el.querySelector('#cu-rows').innerHTML = '<div style="color:var(--err);padding:14px;">' + MC.esc(e.message) + '</div>'; return; }
    C.renderList();
  };

  C.renderList = function () {
    const el = document.getElementById('cu-rows'); if (!el) return;
    const cfg = C.cfg(), now = new Date(), S = C.st;
    const counts = { all: S.all.length, ready: 0, expiring: 0, lapsed: 0, missing: 0 };
    S.all.forEach(c => { const k = C.status(c, cfg, now).key; if (counts[k] != null) counts[k]++; if (MC.profileGaps(c).length) counts.missing++; });
    const chips = [['all', 'All'], ['ready', '🚿 Free wash ready'], ['expiring', '⏰ Expiring'], ['lapsed', '😴 Lapsed'], ['missing', '⚠ Missing details']];
    document.getElementById('cu-chips').innerHTML = chips.map(x => '<button class="cu-chip ' + (S.f === x[0] ? 'on' : '') + '" data-f="' + x[0] + '">' + x[1] + ' <span style="opacity:.7">' + counts[x[0]] + '</span></button>').join('');
    document.querySelectorAll('#cu-chips [data-f]').forEach(b => b.onclick = () => { S.f = b.dataset.f; S.limit = 40; C.renderList(); });
    let list = C.filter(S.all, S.term, S.f, cfg, now);
    if (!S.term && S.f === 'all') list = list.slice().sort((a, b) => String(b.last_visit_date || b.created_at || '').localeCompare(String(a.last_visit_date || a.created_at || '')));
    document.getElementById('cu-count').textContent = list.length + ' child' + (list.length === 1 ? '' : 'ren') + (S.term || S.f !== 'all' ? '' : ' · most recent first');
    el.innerHTML = list.slice(0, S.limit).map(c => { const s = C.status(c, cfg, now);
      return '<div class="cu-row ' + (S.cur && S.cur.id === c.id ? 'on' : '') + '" data-id="' + MC.esc(c.id) + '">' + ico(c) + '<div style="flex:1;min-width:0;"><div class="cu-nm">' + MC.esc(c.name) + '</div><div class="cu-sub">' + MC.esc(c.parent || '') + (c.parent ? ' · ' : '') + MC.esc(C.phone(c.mobile)) + '</div>' + dots(num(c.stamps), cfg.paid) + '</div>' + badge(s) + '</div>'; }).join('') +
      (list.length > S.limit ? '<button class="btn btn-ghost btn-sm btn-full" id="cu-more" style="margin:8px 0;">Show more (' + (list.length - S.limit) + ')</button>' : '') +
      (!list.length ? '<div class="cu-sub" style="padding:24px 8px;text-align:center;">No match. Try fewer letters or the last digits of the mobile number.</div>' : '');
    el.querySelectorAll('.cu-row').forEach(r => r.onclick = () => C.open(r.dataset.id));
    const more = document.getElementById('cu-more'); if (more) more.onclick = () => { S.limit += 60; C.renderList(); };
  };

  C.open = async function (id) {
    const S = C.st, c = S.all.find(x => x.id === id); if (!c) return;
    S.cur = c; S.tab = 'visits'; const my = ++S.ver;
    document.getElementById('cu').classList.add('detail');
    document.querySelectorAll('#cu-rows .cu-row').forEach(r => r.classList.toggle('on', r.dataset.id === id));
    const box = document.getElementById('cu-detail'); box.innerHTML = '<div class="cu-sub" style="padding:30px;">Loading…</div>';
    const safe = p => p.catch(() => []);
    const q = 'customer_id=eq.' + encodeURIComponent(id);
    const [queue, visits, cycles, prizes, invoices, appts] = await Promise.all([
      safe(MC.sb('queue', 'GET', null, q + '&status=eq.done&order=checkin_date.desc,created_at.desc&limit=300&select=id,checkin_date,service,stylist,service_value,tip,payment_type,invoice_number,discount_pct,status')),
      safe(MC.sb('visits', 'GET', null, q + '&order=created_at.desc&limit=300')),
      safe(MC.sb('cycles', 'GET', null, q + '&order=ended_at.desc')),
      safe(MC.sb('prizes_given', 'GET', null, q + '&order=given_at.desc')),
      safe(MC.sb('invoices', 'GET', null, q + '&order=checkin_date.desc,created_at.desc&limit=200&select=id,invoice_number,checkin_date,payable_amount,currency,status,pdf_url,payment_type')),
      safe(MC.sb('appointments', 'GET', null, q + '&order=appt_date.desc&limit=100'))]);
    if (my !== S.ver) return;                       // another child was opened meanwhile
    S.data = { queue, visits, cycles, prizes, invoices, appts };
    C.renderDetail();
  };

  C.renderDetail = function () {
    const S = C.st, c = S.cur, D = S.data, box = document.getElementById('cu-detail'); if (!box || !c || !D) return;
    const cfg = C.cfg(), st = num(c.stamps), s = C.status(c, cfg), stats = C.stats(D.queue), gaps = MC.profileGaps(c), fam = C.family(S.all, c);
    const wa = '971' + MC.last9(c.mobile), age = C.age(c.dob);
    const stamps = Array.from({ length: cfg.paid }, (_, i) => '<b class="' + (i < st ? 'on' : '') + '">' + (i < st ? '🐼' : '✦') + '</b>').join('') + '<b title="Special gift on the next visit" style="background:rgba(255,255,255,.1);">🎁</b>';
    box.innerHTML =
      '<button class="btn btn-ghost btn-sm cu-back" id="cu-back">← All customers</button>' +
      '<div class="cu-head">' + ico(c) + '<div style="min-width:0;"><div class="cu-h1">' + MC.esc(c.name) + ' ' + badge(s) + (c.dnd ? ' <span class="cu-badge err">🔕 DND</span>' : '') + '</div>' +
        '<div class="cu-meta"><span>👪 ' + MC.esc(c.parent || 'Parent not recorded') + '</span><span>📱 <a href="tel:+' + wa + '" style="color:inherit;">' + MC.esc(C.phone(c.mobile)) + '</a></span>' + (age ? '<span>🎂 ' + age + '</span>' : '') +
        (c.location ? '<span>📍 ' + MC.esc(c.location) + '</span>' : '') + (c.heard_via ? '<span>📣 ' + MC.esc(c.heard_via) + '</span>' : '') + (c.created_at ? '<span>Joined ' + MC.fmtDate(c.created_at) + '</span>' : '') + '</div></div>' +
        '<div class="cu-act"><button class="btn btn-y btn-sm" id="cu-book">📅 Book</button><a class="btn btn-ghost btn-sm" href="https://wa.me/' + wa + '" target="_blank" rel="noopener">💬 WhatsApp</a><button class="btn btn-ghost btn-sm" id="cu-edit">✏️ Edit</button></div></div>' +
      (gaps.length ? '<div class="cu-warn" style="margin-top:12px;">⚠ Missing: ' + gaps.map(x => MC.GAP_LABEL[x]).join(', ') + '<button class="btn btn-sm btn-ghost" id="cu-fill" style="margin-left:auto;">Complete now</button></div>' : '') +
      (c.notes ? '<div class="cu-sub" style="margin-top:10px;background:#F8FAFC;border-radius:10px;padding:8px 10px;">📝 ' + MC.esc(c.notes) + '</div>' : '') +
      '<div class="cu-pass"><div class="lbl">Loyalty passport · ' + st + ' of ' + cfg.paid + ' paid visits' + (c.expiry_date ? ' · valid until ' + MC.fmtDate(c.expiry_date) : '') + ' · ' + num(c.redemptions) + ' free wash' + (num(c.redemptions) === 1 ? '' : 'es') + ' redeemed</div><div class="cu-stamps">' + stamps + '</div></div>' +
      '<div class="cu-kpis"><div class="cu-kpi"><div class="n">' + stats.visits + '</div><div class="l">Visits</div></div><div class="cu-kpi"><div class="n">' + MC.r2(stats.spent).toFixed(0) + '</div><div class="l">Spent (AED)</div></div><div class="cu-kpi"><div class="n">' + MC.r2(stats.avg).toFixed(0) + '</div><div class="l">Avg ticket</div></div>' +
        '<div class="cu-kpi"><div class="n">' + (stats.gapDays != null ? stats.gapDays + 'd' : '—') + '</div><div class="l">Usually returns</div></div><div class="cu-kpi"><div class="n" style="font-size:14px;">' + (stats.last ? MC.fmtDate(stats.last) : '—') + '</div><div class="l">Last visit</div></div>' +
        '<div class="cu-kpi"><div class="n" style="font-size:14px;">' + MC.esc(stats.favService || '—') + '</div><div class="l">Favourite' + (stats.favStylist ? ' · ' + MC.esc(stats.favStylist) : '') + '</div></div></div>' +
      (fam.length ? '<div class="cu-sub" style="margin-bottom:10px;">Siblings: ' + fam.map(f => '<button class="cu-chip" data-sib="' + MC.esc(f.id) + '">' + (f.gender === 'girl' ? '👧' : '👦') + ' ' + MC.esc(f.name) + '</button>').join(' ') + '</div>' : '') +
      '<div class="cu-tabs" id="cu-tabs">' + [['visits', 'Visits (' + D.queue.length + ')'], ['invoices', 'Invoices (' + D.invoices.length + ')'], ['appts', 'Appointments (' + D.appts.length + ')'], ['cycles', 'Passport history'], ['prizes', 'Prizes & games']].map(t => '<button class="cu-tab ' + (S.tab === t[0] ? 'on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="cu-tabbody"></div>';
    box.querySelector('#cu-back').onclick = () => { document.getElementById('cu').classList.remove('detail'); };
    box.querySelector('#cu-book').onclick = () => { showTab('t-appt'); MC.appt.init().then(() => MC.appt.openNew(null, null, c)); };
    box.querySelector('#cu-edit').onclick = () => C.edit(c);
    const fill = box.querySelector('#cu-fill'); if (fill) fill.onclick = async () => { await MC.profileDialog([c], { allowSkip: true, sub: 'Complete ' + c.name + '’s profile' }); await C.refresh(); };
    box.querySelectorAll('[data-sib]').forEach(b => b.onclick = () => C.open(b.dataset.sib));
    box.querySelectorAll('#cu-tabs [data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; box.querySelectorAll('#cu-tabs .cu-tab').forEach(x => x.classList.toggle('on', x === b)); C.renderTab(); });
    C.renderTab();
  };

  C.renderTab = function () {
    const S = C.st, D = S.data, el = document.getElementById('cu-tabbody'); if (!el) return;
    const empty = t => '<div class="cu-sub" style="padding:18px 4px;">' + t + '</div>';
    const tbl = (heads, rows) => '<div style="overflow:auto;"><table class="cu-tbl"><thead><tr>' + heads.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(x => '<td>' + x + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    const e = MC.esc, m = v => MC.r2(v).toFixed(2);
    if (S.tab === 'visits') el.innerHTML = D.queue.length ? tbl(['Date', 'Service', 'Stylist', 'Paid', 'Tip', 'Payment', 'Invoice'], D.queue.map(r => [MC.fmtDate(r.checkin_date), e(r.service), e(r.stylist), m(r.service_value) + (num(r.discount_pct) ? ' <span class="cu-sub">(−' + num(r.discount_pct) + '%)</span>' : ''), r.tip ? m(r.tip) : '', e(r.payment_type || ''), e(r.invoice_number || '')])) : empty('No finished visits recorded yet.');
    else if (S.tab === 'invoices') el.innerHTML = D.invoices.length ? tbl(['Invoice', 'Date', 'Total', 'Payment', 'Status', ''], D.invoices.map(i => [e(i.invoice_number), MC.fmtDate(i.checkin_date), e(i.currency || 'AED') + ' ' + m(i.payable_amount), e(i.payment_type || ''), i.status === 'void' ? '<span class="cu-badge err">VOID</span>' : '<span class="cu-badge ok">Issued</span>', i.pdf_url ? '<a href="' + e(i.pdf_url) + '" target="_blank" rel="noopener">PDF ↗</a>' : ''])) : empty('No invoices yet.');
    else if (S.tab === 'appts') el.innerHTML = D.appts.length ? tbl(['Date', 'Time', 'Service', 'Stylist', 'Status'], D.appts.map(a => [MC.fmtDate(a.appt_date), e(String(a.start_time || '').slice(0, 5)), e(a.service), e(a.stylist), e(String(a.status || '').replace('_', ' '))])) : empty('No appointments booked.');
    else if (S.tab === 'cycles') {
      const ev = D.visits.filter(v => v.type !== 'paid');
      el.innerHTML = (D.cycles.length ? tbl(['Passport ended', 'Stamps earned', 'Started', 'Ended by'], D.cycles.map(cy => [MC.fmtDate(cy.ended_at), num(cy.stamps_earned) + '/' + C.cfg().paid, MC.fmtDate(cy.first_stamp_date), e(cy.ended_by || '')])) : empty('No completed passports yet.')) +
        (ev.length ? '<div class="cu-sub" style="margin:12px 0 4px;font-weight:800;">Free washes & expiries</div>' + tbl(['Date', 'Event'], ev.map(v => [MC.fmtDate(v.created_at), v.type === 'free' ? '🚿 Free hair wash redeemed' : '⏰ Passport expired'])) : '');
    } else el.innerHTML = '<div class="cu-sub" style="margin-bottom:8px;">🎮 Game points: <b>' + num(S.cur.game_points) + '</b></div>' + (D.prizes.length ? tbl(['Date', 'Prize', 'Given by'], D.prizes.map(p => [MC.fmtDate(p.given_at), e(p.stage_label || p.stage_pts + ' pts'), e(p.given_by || '')])) : empty('No game prizes handed out yet.'));
  };

  C.refresh = async function () { const id = C.st.cur && C.st.cur.id; await C.load(true); C.renderList(); if (id) { const c = C.st.all.find(x => x.id === id); if (c) { C.st.cur = c; await C.open(id); } } };

  C.edit = function (c) {
    const o = (arr, v) => arr.map(a => '<option' + (a === v ? ' selected' : '') + '>' + MC.esc(a) + '</option>').join('');
    const ov = MC.modal('<div style="font-family:var(--fh);font-size:19px;font-weight:800;color:var(--bd);margin-bottom:12px;">✏️ Edit ' + MC.esc(c.name) + '</div><div style="display:grid;gap:10px;">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div>' + MC.lbl('Child name') + '<input class="fi" id="ce-name" value="' + MC.esc(c.name) + '"/></div><div>' + MC.lbl('Parent') + '<input class="fi" id="ce-par" value="' + MC.esc(c.parent || '') + '"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div>' + MC.lbl('Boy / Girl') + '<select class="fi" id="ce-g"><option value="boy"' + (c.gender === 'boy' ? ' selected' : '') + '>Boy</option><option value="girl"' + (c.gender === 'girl' ? ' selected' : '') + '>Girl</option></select></div><div>' + MC.lbl('Birthday') + '<input class="fi" type="date" id="ce-dob" value="' + MC.esc(String(c.dob || '').slice(0, 10)) + '"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div>' + MC.lbl('Area') + '<select class="fi" id="ce-loc"><option value="">—</option>' + o(MC.AREAS, c.location) + (c.location && MC.AREAS.indexOf(c.location) < 0 ? '<option selected>' + MC.esc(c.location) + '</option>' : '') + '</select></div><div>' + MC.lbl('Heard about us') + '<select class="fi" id="ce-hear"><option value="">—</option>' + o(MC.HEARD, c.heard_via) + (c.heard_via && MC.HEARD.indexOf(c.heard_via) < 0 ? '<option selected>' + MC.esc(c.heard_via) + '</option>' : '') + '</select></div></div>' +
      '<div>' + MC.lbl('Notes') + '<textarea class="fi" id="ce-notes" rows="2">' + MC.esc(c.notes || '') + '</textarea></div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;"><input type="checkbox" id="ce-dnd"' + (c.dnd ? ' checked' : '') + '/> Do not send marketing messages (DND)</label></div>' +
      '<div class="sm" id="ce-msg" style="margin-top:8px;"></div><div style="display:flex;gap:9px;margin-top:12px;"><button class="btn btn-ghost" id="ce-no" style="padding:10px 16px;">Cancel</button><button class="btn btn-y" id="ce-ok" style="flex:1;padding:11px;">Save</button></div>', { width: 460 });
    const $ = id => ov.querySelector('#' + id);
    $('ce-no').onclick = () => ov.close();
    $('ce-ok').onclick = async () => {
      const name = $('ce-name').value.trim(); if (!name) { $('ce-msg').className = 'sm err'; $('ce-msg').textContent = 'Name is required.'; return; }
      const patch = { name, parent: $('ce-par').value.trim() || null, gender: $('ce-g').value, dob: $('ce-dob').value || null, location: $('ce-loc').value || null, heard_via: $('ce-hear').value || null, notes: $('ce-notes').value.trim() || null, dnd: $('ce-dnd').checked };
      $('ce-ok').disabled = true;
      try { await MC.sb('customers', 'PATCH', patch, 'id=eq.' + encodeURIComponent(c.id), 'return=minimal'); ov.close(); await C.refresh(); }
      catch (e) { $('ce-ok').disabled = false; $('ce-msg').className = 'sm err'; $('ce-msg').textContent = 'Save failed: ' + e.message; }
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
