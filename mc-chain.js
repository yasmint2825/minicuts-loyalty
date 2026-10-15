/* ============================================================================
 * mc-chain.js — SalonChain: Controller overview (all outlets on one screen).
 * Needs permission chain.overview. Shows, per outlet: items to reorder / out of stock, stock value,
 * open purchase orders, orders waiting for approval (with a one-tap Open), spend this month.
 * Revenue / visits per outlet arrive once queue + invoices carry a branch_id (Phase 0 migration).
 * Pure helper C.summarise is exported for tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const C = MC.chain = MC.chain || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  const money = (n, cur) => (cur || 'AED') + ' ' + r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const OPEN = ['draft', 'submitted', 'approved', 'ordered', 'partial'], SPENT = ['approved', 'ordered', 'partial', 'received', 'closed'];

  /* one outlet's numbers from its stock rows and purchase orders */
  C.summarise = function (rows, pos, monthStart) {
    const s = MC.inventory.sum(rows), open = pos.filter(p => OPEN.includes(p.status));
    return { toOrder: s.toOrder, out: s.out, low: s.low, stockValue: s.value, items: s.items,
      openPOs: open.length, openValue: r2(open.reduce((a, p) => a + (Number(p.total) || 0), 0)),
      awaiting: pos.filter(p => p.status === 'submitted'),
      spend: r2(pos.filter(p => SPENT.includes(p.status) && String(p.order_date) >= monthStart).reduce((a, p) => a + (Number(p.total) || 0), 0)) };
  };


  /* ── group performance (pure) ─────────────────────────────────────────── */
  const dkey = r => String(r.checkin_date || '').slice(0, 10);
  const bOf = (r, def) => r.branch_id || def;      // until queue carries branch_id every visit belongs to the first outlet
  const cnt = a => { const m = {}; a.forEach(x => { if (x) m[x] = (m[x] || 0) + 1; }); return Object.keys(m).map(k => [k, m[k]]).sort((x, y) => y[1] - x[1]); };
  /* rows = finished visits (queue, status done); customers = {id, created_at}; one entry per outlet */
  C.groupStats = function (rows, customers, branches, from, to, def) {
    const created = {}; (customers || []).forEach(c => { created[c.id] = String(c.created_at || '').slice(0, 10); });
    return branches.map(b => {
      const mine = rows.filter(r => r.status === 'done' && bOf(r, def) === b.id && dkey(r) >= from && dkey(r) <= to), vis = mine.length;
      const rev = r2(mine.reduce((a, r) => a + (Number(r.service_value) || 0), 0)), tips = r2(mine.reduce((a, r) => a + (Number(r.tip) || 0), 0));
      const disc = r2(mine.reduce((a, r) => a + (Number(r.list_price) > Number(r.service_value) && Number(r.service_value) > 0 ? Number(r.list_price) - Number(r.service_value) : 0), 0));
      const cust = new Set(mine.map(r => r.customer_id).filter(Boolean)), isNew = id => created[id] && created[id] >= from && created[id] <= to;
      const retVisits = mine.filter(r => r.customer_id && created[r.customer_id] && created[r.customer_id] < from).length;
      const day = {}; mine.forEach(r => { day[dkey(r)] = (day[dkey(r)] || 0) + (Number(r.service_value) || 0); });
      const days = []; for (let d = from, g = 0; d <= to && g < 400; d = MC.addDays(d, 1), g++) days.push(r2(day[d] || 0));
      return { branch: b, visits: vis, revenue: rev, tips, discount: disc, avgBill: vis ? r2(rev / vis) : 0, customers: cust.size, newCustomers: [...cust].filter(isNew).length,
        returningPct: vis ? Math.round(100 * retVisits / vis) : 0, cash: r2(mine.filter(r => r.payment_type === 'Cash').reduce((a, r) => a + (Number(r.service_value) || 0), 0)),
        credit: r2(mine.filter(r => r.payment_type === 'Credit').reduce((a, r) => a + (Number(r.service_value) || 0), 0)), topService: (cnt(mine.map(r => r.service))[0] || [])[0] || '—', topStylist: (cnt(mine.map(r => r.stylist))[0] || [])[0] || '—',
        activeDays: Object.keys(day).length, days };
    });
  };
  C.pctChange = (now, before) => before > 0 ? Math.round(100 * (now - before) / before) : (now > 0 ? null : 0);
  /* month-to-date against a monthly cost: how far to break-even and what daily revenue still needed */
  C.breakEven = function (mtdRevenue, monthlyCost, today) {
    const d = MC.parseYmd(today), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), left = dim - d.getDate(), cost = Number(monthlyCost) || 0;
    if (!cost) return null; const gap = Math.max(0, cost - mtdRevenue);
    return { pct: Math.round(100 * mtdRevenue / cost), gap: r2(gap), daysLeft: left, perDayNeeded: left > 0 ? r2(gap / left) : r2(gap), projected: r2(mtdRevenue / Math.max(1, d.getDate()) * dim) };
  };

  C.st = { tab: 'perf', preset: '30', from: null, to: null };
  C.init = async function () {
    const R = MC.rbac; R.injectCss(); const el = document.getElementById('t-chain-root'); if (!el) return;
    if (!MC.can('chain.overview')) { el.innerHTML = '<div class="ch-card">You do not have access to the controller overview.</div>'; return; }
    el.innerHTML = '<div class="ch-wrap"><div class="ch-h">🏢 Group overview</div><div class="ch-sub">Every outlet you look after, side by side.</div>' +
      '<div class="ch-tabs">' + [['perf', '📈 Performance'], ['stock', '📦 Stock & purchasing']].map(t => '<button class="ch-tab' + (C.st.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="co-body">Loading…</div></div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { C.st.tab = b.dataset.t; C.init(); });
    const body = el.querySelector('#co-body');
    if (C.st.tab === 'perf') return C.renderPerf(body);
    return C.renderStock(body);
  };
  C.renderStock = async function (body) {
    const R = MC.rbac, me = R.email(), ctx = R.ctx();
    try {
      const brs = R.st.branches.filter(b => MC.can('chain.overview', b.id)), ms = MC.today().slice(0, 8) + '01';
      const [sups, allPOs] = await Promise.all([MC.purchasing.loadSuppliers().catch(() => []), MC.sb('purchase_orders', 'GET', null, 'order=created_at.desc&limit=1000')]);
      const sum = []; for (const b of brs) { const rows = MC.inventory.rows(await MC.inventory.loadBranch(b.id)); sum.push({ b, rows, s: C.summarise(rows, allPOs.filter(p => p.branch_id === b.id), ms) }); }
      const mine = allPOs.filter(p => R.canApprove(ctx, p, me).ok), cur = (brs[0] || {}).currency;
      body.innerHTML = '<div class="ch-grid" style="margin-bottom:12px">' +
        [['To reorder', sum.reduce((a, x) => a + x.s.toOrder, 0), 'items across outlets'], ['Out of stock', sum.reduce((a, x) => a + x.s.out, 0), 'items at zero'], ['Waiting for approval', allPOs.filter(p => p.status === 'submitted').length, mine.length + ' for you'], ['Spend this month', money(sum.reduce((a, x) => a + x.s.spend, 0), cur), 'approved purchase orders']]
          .map(k => '<div class="ch-card" style="margin:0"><div class="ch-kpi">' + k[1] + '</div><div class="ch-kl">' + k[0] + '</div><div class="ch-muted" style="font-size:12px">' + k[2] + '</div></div>').join('') + '</div>' +
        (mine.length ? '<div class="ch-card"><b>✋ Waiting for you</b>' + mine.map(p => '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid #F1F5F9;font-size:13px"><span><b>' + esc(p.po_number) + '</b> · ' + esc(R.branchName(p.branch_id)) + ' · ' + esc((MC.purchasing.supplier(p.supplier_id) || {}).name || '') + ' · ' + money(p.total, p.currency) + '</span><button class="btn btn-y btn-sm" data-po="' + esc(p.id) + '">Review</button></div>').join('') + '</div>' : '') +
        '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Outlet</th><th class="ch-r">To reorder</th><th class="ch-r">Out</th><th class="ch-r">Stock value</th><th class="ch-r">Open POs</th><th class="ch-r">Open value</th><th class="ch-r">Spend (month)</th></tr></thead><tbody>' +
        sum.map(x => '<tr><td><b>' + esc(x.b.code) + '</b> <span class="ch-muted">' + esc(x.b.name) + '</span></td><td class="ch-r">' + (x.s.toOrder ? '<span class="ch-chip warn">' + x.s.toOrder + '</span>' : '0') + '</td><td class="ch-r">' + (x.s.out ? '<span class="ch-chip err">' + x.s.out + '</span>' : '0') + '</td><td class="ch-r">' + money(x.s.stockValue, x.b.currency) + '</td><td class="ch-r">' + x.s.openPOs + (x.s.awaiting.length ? ' <span class="ch-chip warn">' + x.s.awaiting.length + ' to approve</span>' : '') + '</td><td class="ch-r">' + money(x.s.openValue, x.b.currency) + '</td><td class="ch-r">' + money(x.s.spend, x.b.currency) + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="ch-note">Revenue, visits and stylist figures per outlet will appear here once the queue and invoices carry an outlet (a separate, approved database step).</div><div id="co-audit"></div>';
      body.querySelectorAll('[data-po]').forEach(b => b.onclick = () => MC.purchasing.open(b.dataset.po));
      if (MC.can('audit.view')) {
        const a = await MC.sb('audit_log', 'GET', null, 'order=at.desc&limit=15').catch(() => []);
        body.querySelector('#co-audit').innerHTML = '<div class="ch-card"><b>🕵️ Recent activity</b>' + (a.map(x => '<div style="font-size:12.5px;padding:4px 0;border-top:1px solid #F1F5F9"><span class="ch-muted">' + new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</span> · ' + esc(x.actor || '') + ' · ' + esc(x.action) + ' ' + esc(x.entity) + (x.branch_id ? ' · ' + esc(R.branchName(x.branch_id)) : '') + '</div>').join('') || '<div class="ch-muted">Nothing yet.</div>') + '</div>';
      }
    } catch (e) { body.innerHTML = '<div class="ch-note ch-warn">Could not load: ' + esc(e.message) + '</div>'; }
  };

  /* ── Performance tab ─────────────────────────────────────────────────── */
  const PRESETS = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['mtd', 'This month'], ['lm', 'Last month']];
  C.range = function (preset, today) {
    const t = today || MC.today(); let from, to = t;
    if (preset === 'today') from = t; else if (preset === '7') from = MC.addDays(t, -6); else if (preset === '30') from = MC.addDays(t, -29);
    else if (preset === 'mtd') from = t.slice(0, 8) + '01';
    else { const d = MC.parseYmd(t); const f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0); from = MC.ymd(f); to = MC.ymd(l); }
    const len = Math.round((MC.parseYmd(to) - MC.parseYmd(from)) / 864e5) + 1, pTo = MC.addDays(from, -1), pFrom = MC.addDays(pTo, -(len - 1));
    return { from, to, pFrom, pTo };
  };
  const spark = (a, w, h) => { const m = Math.max(1, ...a), n = a.length, bw = w / Math.max(1, n); return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + a.map((v, i) => '<rect x="' + (i * bw + .5).toFixed(1) + '" y="' + (h - (v / m) * h).toFixed(1) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + ((v / m) * h).toFixed(1) + '" rx="1" fill="#1565C0" opacity=".75"/>').join('') + '</svg>'; };
  const arrow = p => p == null ? '<span class="ch-muted">new</span>' : p === 0 ? '<span class="ch-muted">±0%</span>' : '<span style="color:' + (p > 0 ? '#15803D' : '#B91C1C') + ';font-weight:800">' + (p > 0 ? '▲' : '▼') + Math.abs(p) + '%</span>';
  C.renderPerf = async function (body) {
    const R = MC.rbac, S = C.st, today = MC.today(), rg = C.range(S.preset, today);
    const brs = R.st.branches.filter(b => MC.can('reports.view_all', b.id) || MC.can('reports.view', b.id)), def = ((R.st.branches.find(b => b.code === 'DSO') || R.st.branches[0]) || {}).id;
    if (!brs.length) { body.innerHTML = '<div class="ch-note">You do not have access to revenue figures.</div>'; return; }
    try {
      const mStart = today.slice(0, 8) + '01', since = [rg.pFrom, mStart].sort()[0];
      const [rows, custs, tg] = await Promise.all([MC.sbAll('queue', 'select=*&status=eq.done&checkin_date=gte.' + since + '&checkin_date=lte.' + today),
        MC.sbAll('customers', 'select=id,created_at&created_at=gte.' + since), MC.getConfig('chain_targets').catch(() => null)]);
      const cur = C.groupStats(rows, custs, brs, rg.from, rg.to, def), prev = C.groupStats(rows, custs, brs, rg.pFrom, rg.pTo, def), mtd = C.groupStats(rows, custs, brs, mStart, today, def), targets = tg || {};
      const T = f => cur.reduce((a, x) => a + x[f], 0), P = f => prev.reduce((a, x) => a + x[f], 0), rev = T('revenue'), vis = T('visits'), cur0 = (brs[0] || {}).currency;
      const kpi = (l, v, sub) => '<div class="ch-card" style="margin:0"><div class="ch-kpi">' + v + '</div><div class="ch-kl">' + l + '</div><div style="font-size:12px">' + sub + '</div></div>';
      body.innerHTML = '<div class="ch-bar">' + PRESETS.map(x => '<button class="ch-tab' + (S.preset === x[0] ? ' on' : '') + '" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '<span class="ch-muted" style="font-size:12px">' + MC.fmtDate(rg.from) + ' – ' + MC.fmtDate(rg.to) + ' · compared with the previous ' + (Math.round((MC.parseYmd(rg.to) - MC.parseYmd(rg.from)) / 864e5) + 1) + ' days</span></div>' +
        '<div class="ch-grid" style="margin-bottom:12px">' + kpi('Group revenue', money(rev, cur0), arrow(C.pctChange(rev, P('revenue')))) + kpi('Visits', vis, arrow(C.pctChange(vis, P('visits')))) +
        kpi('Average bill', money(vis ? rev / vis : 0, cur0), arrow(C.pctChange(vis ? rev / vis : 0, P('visits') ? P('revenue') / P('visits') : 0))) + kpi('New customers', T('newCustomers'), arrow(C.pctChange(T('newCustomers'), P('newCustomers')))) + '</div>' +
        '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Outlet</th><th class="ch-r">Revenue</th><th class="ch-r">vs prev</th><th class="ch-r">Share</th><th class="ch-r">Visits</th><th class="ch-r">Avg bill</th><th class="ch-r">New</th><th class="ch-r">Returning</th><th class="ch-r">Discounts</th><th class="ch-r">Tips</th><th class="ch-r">Cash / Card</th><th>Top service</th><th>Top stylist</th><th>Trend</th></tr></thead><tbody>' +
        cur.map((x, i) => '<tr><td><b>' + esc(x.branch.code) + '</b></td><td class="ch-r"><b>' + money(x.revenue, x.branch.currency) + '</b></td><td class="ch-r">' + arrow(C.pctChange(x.revenue, prev[i].revenue)) + '</td><td class="ch-r">' + (rev ? Math.round(100 * x.revenue / rev) : 0) + '%</td><td class="ch-r">' + x.visits + '</td><td class="ch-r">' + r2(x.avgBill).toFixed(0) + '</td><td class="ch-r">' + x.newCustomers + '</td><td class="ch-r">' + x.returningPct + '%</td><td class="ch-r">' + r2(x.discount).toFixed(0) + '</td><td class="ch-r">' + r2(x.tips).toFixed(0) + '</td><td class="ch-r">' + (x.revenue ? Math.round(100 * x.cash / x.revenue) : 0) + '/' + (x.revenue ? Math.round(100 * x.credit / x.revenue) : 0) + '%</td><td>' + esc(x.topService) + '</td><td>' + esc(x.topStylist) + '</td><td>' + (x.days.length > 1 ? spark(x.days, 90, 26) : '') + '</td></tr>').join('') + '</tbody></table></div>' +
        '<div class="ch-card"><b>🎯 Break-even this month</b> <span class="ch-muted" style="font-size:12px">revenue so far against the outlet’s monthly running cost</span><div id="co-be" style="margin-top:8px"></div></div>' +
        '<div class="ch-note">Visits and revenue are counted per outlet from the day the queue carries an outlet. Until then every visit is shown under ' + esc(((R.st.branches.find(b => b.id === def)) || {}).code || 'the first outlet') + '. Revenue includes VAT, as on the invoice.</div>';
      body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { S.preset = b.dataset.p; C.init(); });
      const canSet = MC.can('settings.chain'), be = body.querySelector('#co-be');
      be.innerHTML = mtd.map(x => { const t = C.breakEven(x.revenue, (targets[x.branch.id] || {}).cost, today), c = (targets[x.branch.id] || {}).cost || '';
        return '<div style="display:grid;grid-template-columns:70px 1fr 150px;gap:10px;align-items:center;padding:6px 0;border-top:1px solid #F1F5F9;font-size:13px"><b>' + esc(x.branch.code) + '</b><div>' + (t ? '<div style="height:10px;background:#E5E7EB;border-radius:6px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, t.pct) + '%;background:' + (t.pct >= 100 ? '#16A34A' : t.pct >= 60 ? '#F59E0B' : '#DC2626') + '"></div></div><div class="ch-muted" style="font-size:12px;margin-top:3px">' + money(x.revenue, x.branch.currency) + ' of ' + money(c, x.branch.currency) + ' (' + t.pct + '%) · need <b>' + money(t.perDayNeeded, x.branch.currency) + '</b>/day for the last ' + t.daysLeft + ' days · on track for ' + money(t.projected, x.branch.currency) + '</div>' : '<span class="ch-muted">Set the monthly cost to see break-even.</span>') + '</div>' +
          (canSet ? '<input class="fi" type="number" min="0" step="100" placeholder="Monthly cost" data-cost="' + esc(x.branch.id) + '" value="' + esc(c) + '"/>' : '<span class="ch-muted">' + (c ? 'Cost ' + money(c, x.branch.currency) : '') + '</span>') + '</div>'; }).join('');
      if (canSet) be.querySelectorAll('[data-cost]').forEach(i => i.onchange = async () => { const t = Object.assign({}, targets); t[i.dataset.cost] = Object.assign({}, t[i.dataset.cost], { cost: Number(i.value) || 0 }); try { await MC.setConfig('chain_targets', t); C.init(); } catch (e) { if (typeof toast === 'function') toast('Could not save: ' + e.message, 'err'); } });
    } catch (e) { body.innerHTML = '<div class="ch-note ch-warn">Could not load: ' + esc(e.message) + '</div>'; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
