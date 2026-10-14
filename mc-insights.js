/* ============================================================================
 * mc-insights.js — Insights for the staff app (read-only). Brings the Loyalty app's analytics
 * onto the same page as the queue so nobody has to switch apps:
 *   Overview · Customers · Retention · Operations · Acquisition · Games
 * Money figures stay behind the Reports PIN (same unlock). Revenue-by-day/stylist/service
 * and the tax report live in Reports and are not repeated here.
 * Pure aggregators (I.*) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const I = MC.insights = MC.insights || {};
  const num = v => Number(v) || 0;
  const DAY = 864e5;

  /* ── pure aggregation ─────────────────────────────────────────────────── */
  I.AGE = [['0–2', 0, 2], ['3–5', 3, 5], ['6–8', 6, 8], ['9–11', 9, 11], ['12–15', 12, 15], ['16+', 16, 99]];
  I.ageBand = function (dob, now) {
    if (!dob) return null; const d = new Date(String(dob).slice(0, 10) + 'T12:00:00'); if (isNaN(d)) return null;
    const y = Math.floor(((now || new Date()) - d) / (365.25 * DAY)); if (y < 0) return null;
    const b = I.AGE.find(a => y >= a[1] && y <= a[2]); return b ? b[0] : null;
  };
  I.countBy = function (arr, fn) {
    const m = {}; arr.forEach(x => { const k = fn(x); if (k == null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  I.monthKey = s => String(s || '').slice(0, 7);
  I.lastMonths = function (n, now) {
    now = now || new Date(); const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
    return out;
  };
  I.monthLabel = k => new Date(k + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  I.perDay = function (rows, from, to) {
    const m = {}; rows.forEach(r => { const d = String(r.checkin_date || '').slice(0, 10); if (d) m[d] = (m[d] || 0) + 1; });
    const out = []; for (let d = from, g = 0; d <= to && g < 400; d = MC.addDays(d, 1), g++) out.push({ d, n: m[d] || 0 }); return out;
  };
  /* weekday × hour grid of arrivals. checkin_time is a UTC timestamp, so it is shifted to Dubai time (UTC+4);
   * a plain "HH:MM" (older rows) is taken as local time. */
  I.localParts = function (r) {
    const t = String(r.checkin_time || '');
    if (/^\d{1,2}:\d{2}/.test(t) && r.checkin_date) { const m = MC.toMin(t); return { dow: MC.parseYmd(String(r.checkin_date).slice(0, 10)).getDay(), hour: Math.floor(m / 60) }; }
    const ms = new Date(t.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).getTime(); if (isNaN(ms)) return null;
    const d = new Date(ms + 4 * 3600e3); return { dow: d.getUTCDay(), hour: d.getUTCHours() };
  };
  I.heatmap = function (rows) {
    const H0 = 8, H1 = 22, grid = Array.from({ length: 7 }, () => Array(H1 - H0).fill(0)); let max = 0;
    rows.forEach(r => {
      const p = I.localParts(r); if (!p || p.hour < H0 || p.hour >= H1) return;
      grid[p.dow][p.hour - H0]++; if (grid[p.dow][p.hour - H0] > max) max = grid[p.dow][p.hour - H0];
    });
    return { grid, max, H0, H1 };
  };
  const T = v => new Date(String(v).replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')).getTime();   // tolerate '2026-10-14 17:42:39+00'
  const mins = (a, b) => { if (!a || !b) return null; const x = (T(b) - T(a)) / 60000; return isNaN(x) ? null : x; };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
  /* wait = arrival → called; service = called → done. Implausible values (<0 or >4h) are ignored. */
  I.ops = function (rows) {
    const okW = x => x != null && x >= 0 && x <= 240, okS = x => x != null && x >= 1 && x <= 240;
    const all = { w: [], s: [] }, by = {}, day = {};
    rows.forEach(r => {
      const w = mins(r.created_at, r.called_at), s = mins(r.called_at, r.done_at), st = r.stylist || '—', d = String(r.checkin_date || '').slice(0, 10);
      const o = by[st] = by[st] || { name: st, count: 0, w: [], s: [] }; o.count++;
      const dd = day[d] = day[d] || { d, count: 0, w: [] }; dd.count++;
      if (okW(w)) { all.w.push(w); o.w.push(w); dd.w.push(w); } if (okS(s)) { all.s.push(s); o.s.push(s); }
    });
    return { avgWait: avg(all.w), avgSvc: avg(all.s), n: rows.length,
      byStylist: Object.values(by).map(o => ({ name: o.name, count: o.count, avgSvc: avg(o.s), avgWait: avg(o.w) })).sort((a, b) => b.count - a.count),
      byDay: Object.values(day).map(o => ({ d: o.d, count: o.count, avgWait: avg(o.w) })).sort((a, b) => a.d < b.d ? -1 : 1) };
  };
  /* Same idea as the Loyalty app: of the children seen in the last N days, how many had visited before (returners). */
  I.returnRate = function (customers, visits, days, now) {
    now = now || new Date(); const cut = new Date(now.getTime() - days * DAY).toISOString();
    const all = {}, win = {};
    visits.forEach(v => { if (!v.customer_id || v.type === 'expired') return; all[v.customer_id] = (all[v.customer_id] || 0) + 1; if (String(v.created_at) >= cut) win[v.customer_id] = (win[v.customer_id] || 0) + 1; });
    const seen = customers.filter(c => win[c.id] > 0), ret = seen.filter(c => all[c.id] > 1);
    const rate = (a, b) => a ? Math.round(b / a * 100) : 0, g = k => { const s = seen.filter(c => c.gender === k), r = ret.filter(c => c.gender === k); return { visited: s.length, returners: r.length, rate: rate(s.length, r.length) }; };
    const age = I.AGE.map(a => { const s = seen.filter(c => I.ageBand(c.dob, now) === a[0]), r = ret.filter(c => I.ageBand(c.dob, now) === a[0]); return { label: a[0], visited: s.length, returners: r.length, rate: rate(s.length, r.length) }; }).filter(a => a.visited);
    return { visited: seen.length, returners: ret.length, first: seen.length - ret.length, rate: rate(seen.length, ret.length),
      avgVisits: ret.length ? ret.reduce((s, c) => s + all[c.id], 0) / ret.length : 0, boy: g('boy'), girl: g('girl'), age };
  };
  /* first-ever visit date per child (from the visits log), as Dubai-local yyyy-mm-dd */
  I.firstSeen = function (visits) {
    const f = {}; visits.forEach(v => { if (!v.customer_id || v.type === 'expired') return; const d = MC.ymd(new Date(v.created_at)); if (!f[v.customer_id] || d < f[v.customer_id]) f[v.customer_id] = d; }); return f;
  };
  /* by acquisition source: distinct new vs returning children in [from,to] */
  I.sources = function (rows, custMap, first, from, to) {
    const out = {};
    rows.forEach(r => {
      const c = custMap[r.customer_id] || {}, src = r.heard_via || c.heard_via || 'Unknown', id = r.customer_id || r.mobile || r.id;
      const o = out[src] = out[src] || { key: src, nu: new Set(), re: new Set(), visits: 0, rev: 0 };
      const f = first[r.customer_id], isNew = f && f >= from && f <= to; (isNew ? o.nu : o.re).add(id); o.visits++; o.rev += num(r.service_value);
    });
    return Object.values(out).map(o => ({ key: o.key, newKids: o.nu.size, retKids: o.re.size, visits: o.visits, rev: o.rev })).sort((a, b) => (b.newKids + b.retKids) - (a.newKids + a.retKids));
  };
  I.games = function (sessions) {
    const by = I.countBy(sessions, s => s.game_type), pts = {}, players = {}; let total = 0;
    sessions.forEach(s => { pts[s.game_type] = (pts[s.game_type] || 0) + num(s.points_earned); total += num(s.points_earned); const k = s.customer_name || s.customer_id; if (k) players[k] = (players[k] || 0) + 1; });
    const sorted = sessions.slice().sort((a, b) => String(a.created_at) < String(b.created_at) ? -1 : 1), seen = {}; let dupes = 0;
    sorted.forEach(s => { const k = s.customer_id + '|' + s.game_type, t = new Date(s.created_at).getTime(); if (seen[k] != null && t - seen[k] < 20000) dupes++; seen[k] = t; });
    return { plays: sessions.length, byGame: by.map(([g, n]) => ({ game: g, plays: n, points: pts[g] || 0 })), points: total, players: Object.keys(players).length,
      top: Object.entries(players).sort((a, b) => b[1] - a[1]).slice(0, 8), dupes };
  };

  /* ── small chart helpers (plain HTML/CSS, no library) ─────────────────── */
  const e = MC.esc;
  const PAL = ['#1565C0', '#EC4899', '#F59E0B', '#16A34A', '#7C3AED', '#0891B2', '#94A3B8'];
  const card = (title, body, sub, wide) => '<div class="in-card' + (wide ? ' wide' : '') + '"><div class="in-ct">' + title + '</div>' + (sub ? '<div class="in-cs">' + sub + '</div>' : '') + body + '</div>';
  const kpi = (l, v, s, c) => '<div class="in-kpi"><div class="n"' + (c ? ' style="color:' + c + '"' : '') + '>' + v + '</div><div class="l">' + l + '</div>' + (s ? '<div class="s">' + s + '</div>' : '') + '</div>';
  const bars = (list, o) => { o = o || {}; const max = Math.max.apply(null, list.map(x => x[1]).concat([1])), tot = list.reduce((a, x) => a + x[1], 0);
    return list.length ? list.map((x, i) => '<div class="in-bar"><div class="t" title="' + e(x[0]) + '">' + e(x[0]) + '</div><div class="k"><i style="width:' + Math.max(2, x[1] / max * 100) + '%;background:' + (o.color || PAL[i % PAL.length]) + '"></i></div><div class="v">' + (o.fmt ? o.fmt(x[1]) : x[1]) + (o.pct && tot ? ' <span>' + Math.round(x[1] / tot * 100) + '%</span>' : '') + '</div></div>').join('') : '<div class="in-empty">No data for this period.</div>'; };
  const cols = (list, o) => { o = o || {}; const max = Math.max.apply(null, list.map(x => x.n).concat([1]));
    return '<div class="in-cols">' + list.map(x => '<div class="c" title="' + e(x.label) + ': ' + x.n + '"><i style="height:' + Math.round(x.n / max * 100) + '%;background:' + (x.color || '#1565C0') + '"></i>' + (o.labels === false ? '' : '<b>' + e(x.short || '') + '</b>') + '</div>').join('') + '</div>'; };
  const heat = h => { const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], order = [1, 2, 3, 4, 5, 6, 0];
    let hd = '<div class="in-hr"><span></span>'; for (let x = h.H0; x < h.H1; x++) hd += '<b>' + (x > 12 ? x - 12 : x) + (x >= 12 ? 'p' : 'a') + '</b>'; hd += '</div>';
    return '<div class="in-heat">' + hd + order.map(d => '<div class="in-hr"><span>' + dn[d] + '</span>' + h.grid[d].map(n => '<i title="' + n + ' arrivals" style="background:' + (n ? 'rgba(21,101,192,' + (0.12 + 0.88 * n / Math.max(h.max, 1)).toFixed(2) + ')' : '#F1F5F9') + ';color:' + (n / Math.max(h.max, 1) > 0.55 ? '#fff' : '#334155') + '">' + (n || '') + '</i>').join('') + '</div>').join('') + '</div>'; };
  const min1 = v => v == null ? '—' : (v < 1 ? '<1' : Math.round(v)) + ' min';

  const style = `
  .in-top{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}
  .in-seg{display:flex;background:#fff;border:1px solid var(--border);border-radius:12px;padding:3px;gap:2px;flex-wrap:wrap;}
  .in-seg button{border:none;background:none;border-radius:9px;padding:7px 12px;font:800 12.5px var(--fb);color:var(--muted);cursor:pointer;white-space:nowrap;}
  .in-seg button.on{background:var(--b);color:#fff;}
  .in-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:14px;}
  .in-card{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;box-shadow:0 1px 3px rgba(15,23,42,.04);min-width:0;}
  .in-card.wide{grid-column:1/-1;}
  .in-ct{font:800 14.5px var(--fh);color:var(--bd);}.in-cs{font-size:11.5px;color:var(--muted);margin:2px 0 10px;line-height:1.4;}.in-ct + *{margin-top:10px;}.in-cs + *{margin-top:0;}
  .in-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;}
  .in-kpi{background:#fff;border:1px solid var(--border);border-radius:14px;padding:13px 14px;}.in-kpi .n{font:900 25px var(--fh);color:var(--bd);line-height:1.05;}.in-kpi .l{font-size:10.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:3px;}.in-kpi .s{font-size:11.5px;color:var(--muted);margin-top:3px;}
  .in-bar{display:grid;grid-template-columns:minmax(80px,38%) 1fr auto;gap:9px;align-items:center;margin-bottom:7px;font-size:12.5px;}
  .in-bar .t{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.in-bar .k{background:#F1F5F9;border-radius:99px;height:9px;overflow:hidden;}.in-bar .k i{display:block;height:100%;border-radius:99px;}
  .in-bar .v{font-weight:800;min-width:34px;text-align:right;}.in-bar .v span{color:var(--muted);font-weight:700;font-size:11px;}
  .in-cols{display:flex;align-items:flex-end;gap:3px;height:120px;}.in-cols .c{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0;}
  .in-cols .c i{display:block;width:100%;max-width:26px;border-radius:5px 5px 0 0;min-height:2px;}.in-cols .c b{font-size:9.5px;color:var(--muted);font-weight:700;margin-top:4px;white-space:nowrap;}
  .in-heat{overflow-x:auto;}.in-hr{display:flex;gap:3px;margin-bottom:3px;align-items:center;min-width:480px;}.in-hr span{width:34px;font-size:11px;font-weight:800;color:var(--muted);flex-shrink:0;}
  .in-hr b{flex:1;font-size:9.5px;color:var(--muted);text-align:center;font-weight:700;}.in-hr i{flex:1;height:26px;border-radius:6px;font:800 10.5px var(--fb);font-style:normal;display:flex;align-items:center;justify-content:center;}
  .in-empty{color:var(--muted);font-size:12.5px;padding:10px 0;}
  .in-tbl{width:100%;border-collapse:collapse;font-size:12.5px;}.in-tbl th{text-align:left;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--border);}.in-tbl td{padding:8px;border-bottom:1px solid #F1F5F9;}
  .in-lock{background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:9px 12px;font-size:12.5px;color:#92400E;display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;}
  .in-note{font-size:11.5px;color:var(--muted);margin-top:10px;line-height:1.5;}`;

  /* ── data ─────────────────────────────────────────────────────────────── */
  I.st = { tab: 'overview', preset: '30', from: null, to: null, rrDays: 90, cache: {} };
  const cached = async (key, ttl, fn) => { const c = I.st.cache[key]; if (c && Date.now() - c.t < ttl) return c.v; const v = await fn(); I.st.cache[key] = { t: Date.now(), v }; return v; };
  const rangeFor = p => { const n = new Date(), t = MC.today();
    if (p === 'month') return { from: MC.monthRange(n.getFullYear(), n.getMonth()).from, to: t };
    if (p === 'last') { const m = n.getMonth() === 0 ? 11 : n.getMonth() - 1, y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear(); return MC.monthRange(y, m); }
    return { from: MC.addDays(t, -(Number(p) - 1)), to: t }; };
  const loadAll = async () => {
    const [cust, visits] = await Promise.all([MC.customers.load().then(() => MC.customers.st.all), cached('visits', 300000, () => MC.sbAll('visits', 'select=customer_id,type,created_at&order=created_at.asc'))]);
    return { cust, visits };
  };
  const loadRows = (from, to) => cached('q' + from + to, 120000, () => MC.sbAll('queue', 'select=id,customer_id,mobile,checkin_date,checkin_time,created_at,called_at,done_at,service,stylist,service_value,heard_via,status&status=eq.done&checkin_date=gte.' + from + '&checkin_date=lte.' + to));
  const money = () => !!(MC.reports && MC.reports.st && MC.reports.st.unlocked);

  I.askPin = function (then) {
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:8px;">🔒 Show revenue</div><input id="ip-pin" class="fi" type="password" inputmode="numeric" placeholder="PIN" style="margin:6px 0 8px;"/><div id="ip-err" class="sm err"></div><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-ghost" id="ip-no">Cancel</button><button class="btn btn-y" id="ip-go" style="flex:1;">Unlock</button></div>', { width: 320 });
    const go = () => { if (MC.reports.unlock(ov.querySelector('#ip-pin').value)) { ov.close(); then(); } else ov.querySelector('#ip-err').textContent = 'Wrong PIN'; };
    ov.querySelector('#ip-go').onclick = go; ov.querySelector('#ip-no').onclick = () => ov.close(); ov.querySelector('#ip-pin').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); }); setTimeout(() => ov.querySelector('#ip-pin').focus(), 40);
  };

  /* ── screens ──────────────────────────────────────────────────────────── */
  const TABS = [['overview', '📈 Overview'], ['customers', '👨‍👩‍👧 Customers'], ['retention', '🔄 Retention'], ['ops', '⏱ Operations'], ['acq', '📣 Acquisition'], ['games', '🎮 Games']];
  const PRESETS = [['7', '7 days'], ['30', '30 days'], ['month', 'This month'], ['last', 'Last month'], ['90', '90 days']];

  I.init = function () {
    const el = document.getElementById('mc-insights-root'); if (!el) return;
    if (!document.getElementById('in-style')) { const s = document.createElement('style'); s.id = 'in-style'; s.textContent = style; document.head.appendChild(s); }
    const S = I.st; if (!S.from) Object.assign(S, rangeFor(S.preset));
    const needsRange = ['overview', 'ops', 'acq'].includes(S.tab);
    el.innerHTML = '<div class="in-top"><div class="in-seg" id="in-tabs">' + TABS.map(t => '<button data-t="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div>' +
      (needsRange ? '<div class="in-seg" id="in-pre" style="margin-left:auto;">' + PRESETS.map(p => '<button data-p="' + p[0] + '" class="' + (S.preset === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div><span class="in-cs" style="margin:0;">' + MC.fmtDate(S.from) + ' → ' + MC.fmtDate(S.to) + '</span>' : '') + '</div><div id="in-out"><div class="in-empty">Loading…</div></div>';
    el.querySelectorAll('#in-tabs [data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; I.init(); });
    el.querySelectorAll('#in-pre [data-p]').forEach(b => b.onclick = () => { S.preset = b.dataset.p; Object.assign(S, rangeFor(S.preset)); I.init(); });
    const out = el.querySelector('#in-out'), my = S.run = (S.run || 0) + 1;
    I['tab_' + S.tab](out).then(() => {}, err => { if (my === S.run) out.innerHTML = '<div style="color:var(--err);padding:14px;">Could not load: ' + e(err.message) + '</div>'; });
  };

  I.tab_overview = async function (out) {
    const S = I.st, [{ cust, visits }, rows] = await Promise.all([loadAll(), loadRows(S.from, S.to)]);
    const first = I.firstSeen(visits), kids = new Set(rows.map(r => r.customer_id || r.mobile || r.id)), days = Math.max(1, MC.parseYmd(S.to) - MC.parseYmd(S.from)) / DAY + 1;
    const newKids = new Set(rows.filter(r => first[r.customer_id] && first[r.customer_id] >= S.from && first[r.customer_id] <= S.to).map(r => r.customer_id));
    const ops = I.ops(rows), perDay = I.perDay(rows, S.from, S.to), rev = rows.reduce((a, r) => a + num(r.service_value), 0), unlocked = money();
    const svc = I.countBy(rows, r => r.service).slice(0, 6), sty = I.countBy(rows, r => r.stylist).slice(0, 6);
    const step = Math.ceil(perDay.length / 14);
    out.innerHTML = (unlocked ? '' : '<div class="in-lock">🔒 Revenue figures are hidden.<button class="btn btn-sm btn-ghost" id="in-unlock">Show revenue</button></div>') +
      '<div class="in-kpis">' + kpi('Visits', rows.length, (rows.length / days).toFixed(1) + ' per day') + kpi('Children served', kids.size, newKids.size + ' new · ' + Math.max(0, kids.size - newKids.size) + ' returning') +
      kpi('Avg wait', min1(ops.avgWait), 'arrival → called') + kpi('Avg service', min1(ops.avgSvc), 'called → done') +
      (unlocked ? kpi('Revenue', MC.r2(rev).toFixed(0), 'AED incl. VAT · avg ' + (rows.length ? MC.r2(rev / rows.length).toFixed(0) : 0), 'var(--ok)') : kpi('Revenue', '🔒', 'enter PIN to show')) + kpi('Customer base', cust.length, 'children registered') + '</div>' +
      '<div class="in-grid">' + card('Visits per day', cols(perDay.map((x, i) => ({ n: x.n, label: MC.fmtDate(x.d), short: i % step === 0 ? x.d.slice(8) : '' })))) +
      card('Busiest times', heat(I.heatmap(rows)), 'Arrivals by weekday and hour in this period — useful for rostering.', true) +
      card('Most booked services', bars(svc)) + card('Visits by stylist', bars(sty, { cat: true })) + '</div>';
    const u = out.querySelector('#in-unlock'); if (u) u.onclick = () => I.askPin(() => I.init());
  };

  I.tab_customers = async function (out) {
    const { cust } = await loadAll(), now = new Date(), months = I.lastMonths(12, now), reg = {}; cust.forEach(c => { const k = I.monthKey(c.created_at); reg[k] = (reg[k] || 0) + 1; });
    const boys = cust.filter(c => c.gender === 'boy').length, girls = cust.filter(c => c.gender === 'girl').length, ages = {}; cust.forEach(c => { const b = I.ageBand(c.dob, now); if (b) ages[b] = (ages[b] || 0) + 1; });
    const unk = cust.filter(c => !c.dob).length, cfg = MC.customers.cfg(), st = I.countBy(cust, c => MC.customers.status(c, cfg, now).label.replace(/ \S*[🚿⏰😴]$/u, ''));
    out.innerHTML = '<div class="in-kpis">' + kpi('Registered children', cust.length) + kpi('Boys', boys, cust.length ? Math.round(boys / cust.length * 100) + '%' : '', '#1565C0') + kpi('Girls', girls, cust.length ? Math.round(girls / cust.length * 100) + '%' : '', '#EC4899') +
      kpi('Missing details', cust.filter(c => MC.profileGaps(c).length).length, 'birthday, area or source') + '</div><div class="in-grid">' +
      card('New registrations', cols(months.map(k => ({ n: reg[k] || 0, label: I.monthLabel(k), short: I.monthLabel(k).slice(0, 3) }))), 'Children added per month (last 12 months).') +
      card('Age', bars(I.AGE.map(a => [a[0] + ' yrs', ages[a[0]] || 0])) + (unk ? '<div class="in-note">' + unk + ' without a birthday are not counted.</div>' : '')) +
      card('Where they live', bars(I.countBy(cust, c => c.location).slice(0, 10), { pct: true }), 'Top 10 areas.') +
      card('How they heard about us', bars(I.countBy(cust, c => c.heard_via), { pct: true, cat: true })) +
      card('Passport status', bars(st, { pct: true, cat: true }), 'Where every child stands in the loyalty cycle today.') + '</div>';
  };

  I.tab_retention = async function (out) {
    const S = I.st, { cust, visits } = await loadAll(), r = I.returnRate(cust, visits, S.rrDays), now = new Date(), cfg = MC.customers.cfg();
    const risk = { expiring: 0, lapsed: 0, ready: 0 }; cust.forEach(c => { const k = MC.customers.status(c, cfg, now).key; if (risk[k] != null) risk[k]++; });
    out.innerHTML = '<div class="in-top"><div class="in-seg" id="in-rr">' + [30, 60, 90, 120, 180, 270, 360].map(d => '<button data-d="' + d + '" class="' + (S.rrDays === d ? 'on' : '') + '">' + d + ' days</button>').join('') + '</div></div>' +
      '<div class="in-kpis">' + kpi('Return rate', r.rate + '%', 'of children seen in the last ' + S.rrDays + ' days who had visited before', 'var(--ok)') + kpi('Children seen', r.visited) + kpi('Returning', r.returners, 'avg ' + r.avgVisits.toFixed(1) + ' visits each') + kpi('First-timers', r.first) + '</div><div class="in-grid">' +
      card('Boys vs girls', bars([['Boys', r.boy.rate], ['Girls', r.girl.rate]].map(x => x), { fmt: v => v + '%', color: '#1565C0' }) + '<div class="in-note">Boys: ' + r.boy.returners + ' of ' + r.boy.visited + ' · Girls: ' + r.girl.returners + ' of ' + r.girl.visited + '</div>') +
      card('By age', r.age.length ? bars(r.age.map(a => [a.label + ' yrs', a.rate]), { fmt: v => v + '%' }) + '<div class="in-note">Only children with a birthday on file.</div>' : '<div class="in-empty">No birthdays on file for these children.</div>') +
      card('Needs attention', bars([['Free wash ready', risk.ready], ['Passport expiring soon', risk.expiring], ['Lapsed', risk.lapsed]], { color: '#F59E0B' }), 'Message these from the Customers screen (filters at the top) or the Loyalty app’s Miss You list.') + '</div>' +
      '<div class="in-note">Visits counted = paid haircuts and free washes from the loyalty log, the same source as the Loyalty app.</div>';
    out.querySelectorAll('#in-rr [data-d]').forEach(b => b.onclick = () => { S.rrDays = Number(b.dataset.d); I.init(); });
  };

  I.tab_ops = async function (out) {
    const S = I.st, rows = await loadRows(S.from, S.to), o = I.ops(rows), slow = o.byDay.filter(d => d.avgWait != null && d.avgWait > 20);
    const perDay = I.perDay(rows, S.from, S.to), step = Math.ceil(perDay.length / 14);
    out.innerHTML = '<div class="in-kpis">' + kpi('Visits', rows.length) + kpi('Avg wait', min1(o.avgWait), 'arrival → called', o.avgWait > 20 ? 'var(--err)' : 'var(--ok)') + kpi('Avg service', min1(o.avgSvc), 'called → done') + kpi('Busy days (wait > 20 min)', slow.length, 'in this period') + '</div><div class="in-grid">' +
      card('Customer load by day', cols(perDay.map((x, i) => ({ n: x.n, label: MC.fmtDate(x.d), short: i % step === 0 ? x.d.slice(8) : '' }))), '', true) +
      card('Busiest times', heat(I.heatmap(rows)), 'Arrivals by weekday and hour — use it to plan the roster.', true) +
      card('Stylists', o.byStylist.length ? '<div style="overflow:auto;"><table class="in-tbl"><thead><tr><th>Stylist</th><th>Visits</th><th>Avg service</th><th>Avg wait</th></tr></thead><tbody>' + o.byStylist.map(s => '<tr><td><b>' + e(s.name) + '</b></td><td>' + s.count + '</td><td>' + min1(s.avgSvc) + '</td><td>' + min1(s.avgWait) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="in-empty">No data.</div>', 'Service time = called → done. Only plausible times (under 4 hours) are averaged.') +
      card('Days with long waits', slow.length ? '<div style="overflow:auto;"><table class="in-tbl"><thead><tr><th>Date</th><th>Visits</th><th>Avg wait</th></tr></thead><tbody>' + slow.sort((a, b) => b.avgWait - a.avgWait).slice(0, 10).map(d => '<tr><td>' + MC.fmtDate(d.d) + '</td><td>' + d.count + '</td><td style="color:var(--err);font-weight:800;">' + min1(d.avgWait) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="in-empty">No day averaged more than 20 minutes of waiting. 🎉</div>', 'Worst 10. Compare with the busy slots in the heat map to adjust the roster.') + '</div>';
  };

  I.tab_acq = async function (out) {
    const S = I.st, [{ cust, visits }, rows] = await Promise.all([loadAll(), loadRows(S.from, S.to)]), map = {}; cust.forEach(c => { map[c.id] = c; });
    const src = I.sources(rows, map, I.firstSeen(visits), S.from, S.to), unlocked = money(), months = I.lastMonths(6), by = {};
    cust.forEach(c => { const k = I.monthKey(c.created_at), s = c.heard_via || 'Unknown'; if (months.includes(k)) { by[s] = by[s] || {}; by[s][k] = (by[s][k] || 0) + 1; } });
    out.innerHTML = (unlocked ? '' : '<div class="in-lock">🔒 Revenue per source is hidden.<button class="btn btn-sm btn-ghost" id="in-unlock">Show revenue</button></div>') + '<div class="in-grid">' +
      card('Who came in this period', src.length ? '<div style="overflow:auto;"><table class="in-tbl"><thead><tr><th>Source</th><th>New kids</th><th>Returning</th><th>Visits</th>' + (unlocked ? '<th>Revenue</th>' : '') + '</tr></thead><tbody>' + src.map(s => '<tr><td><b>' + e(s.key) + '</b></td><td>' + s.newKids + '</td><td>' + s.retKids + '</td><td>' + s.visits + '</td>' + (unlocked ? '<td>' + MC.r2(s.rev).toFixed(0) + '</td>' : '') + '</tr>').join('') + '</tbody></table></div>' : '<div class="in-empty">No visits in this period.</div>', 'New = first-ever visit falls in the period.') +
      card('New registrations by source', Object.keys(by).length ? '<div style="overflow:auto;"><table class="in-tbl"><thead><tr><th>Source</th>' + months.map(k => '<th>' + I.monthLabel(k) + '</th>').join('') + '</tr></thead><tbody>' + Object.keys(by).sort().map(s => '<tr><td><b>' + e(s) + '</b></td>' + months.map(k => '<td>' + (by[s][k] || '') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<div class="in-empty">No registrations.</div>', 'Last 6 months. “Unknown” = source not recorded — worth fixing at the front desk.') + '</div>' +
      '<div class="in-note">Revenue by day, stylist and service, and the VAT report, are in Reports. Importing old Excel history stays in the Loyalty app.</div>';
    const u = out.querySelector('#in-unlock'); if (u) u.onclick = () => I.askPin(() => I.init());
  };

  I.tab_games = async function (out) {
    const ss = await cached('games', 300000, () => MC.sbAll('game_sessions', 'select=customer_id,customer_name,game_type,points_earned,created_at&order=created_at.asc').catch(() => [])), g = I.games(ss);
    out.innerHTML = '<div class="in-kpis">' + kpi('Plays', g.plays) + kpi('Players', g.players) + kpi('Points earned', g.points) + kpi('Possible double-taps', g.dupes, 'same game within 20 s', g.dupes ? 'var(--warn)' : '') + '</div><div class="in-grid">' +
      card('Plays by game', bars(g.byGame.map(x => [x.game, x.plays]), { pct: true })) + card('Points by game', bars(g.byGame.map(x => [x.game, x.points]), { color: '#F59E0B' })) +
      card('Most active players', bars(g.top, { color: '#7C3AED' })) + '</div>';
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
