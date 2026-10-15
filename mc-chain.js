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

  C.init = async function () {
    const R = MC.rbac; R.injectCss(); const el = document.getElementById('t-chain-root'); if (!el) return;
    if (!MC.can('chain.overview')) { el.innerHTML = '<div class="ch-card">You do not have access to the controller overview.</div>'; return; }
    el.innerHTML = '<div class="ch-wrap"><div class="ch-h">🏢 Controller overview</div><div class="ch-sub">Every outlet you look after, side by side.</div><div id="co-body">Loading…</div></div>';
    const body = el.querySelector('#co-body'), me = R.email(), ctx = R.ctx();
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
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof window !== 'undefined' ? window : globalThis);
