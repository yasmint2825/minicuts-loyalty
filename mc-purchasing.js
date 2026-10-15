/* ============================================================================
 * mc-purchasing.js — SalonChain: suppliers and purchase orders (PO).
 *
 * Life of a purchase order:
 *   Draft ─submit→ Awaiting approval ─approve→ Approved ─place order→ Ordered ─receive→ Part received → Received
 *                       └─reject→ Rejected (can be re-opened)         └─ close short ─→ Closed
 *   A PO can be cancelled before any goods arrive. Receiving goods writes "receipt" lines into the stock
 *   ledger, so incoming stock is always tied to the order it came from.
 *
 * Who may do what is decided by roles (see mc-rbac.js) and enforced again by the database:
 *   create/submit = po.create · approve = po.approve (up to the person's limit; never your own order unless
 *   you hold po.approve_own) · receive = po.receive · cancel = po.cancel.
 * Pure helpers (totals, actions, grouping) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const P = MC.purchasing = MC.purchasing || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Number(v) || 0;
  const r2 = n => Math.round((num(n) + Number.EPSILON) * 100) / 100;
  const q3 = n => Math.round(num(n) * 1000) / 1000;
  const fmt = n => q3(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const money = (n, cur) => (cur || 'AED') + ' ' + r2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const note = (m, t) => { if (typeof toast === 'function') toast(m, t); };
  P.STATUS = { draft: ['Draft', ''], submitted: ['Awaiting approval', 'warn'], approved: ['Approved', 'info'], rejected: ['Rejected', 'err'], ordered: ['Ordered', 'info'], partial: ['Part received', 'warn'], received: ['Received', 'ok'], closed: ['Closed short', ''], cancelled: ['Cancelled', 'err'] };

  /* ── pure logic ───────────────────────────────────────────────────────── */
  /* same arithmetic the database uses when a PO is submitted */
  P.totals = function (lines, taxRate) {
    const subtotal = r2((lines || []).reduce((a, l) => a + r2(num(l.qty_ordered != null ? l.qty_ordered : l.qty) * num(l.unit_cost)), 0));
    const tax = r2(subtotal * num(taxRate) / 100);
    return { subtotal, tax, total: r2(subtotal + tax) };
  };
  /* received so far per line, from the stock ledger */
  P.received = function (moves) { const m = {}; (moves || []).forEach(x => { if (x.po_line_id) m[x.po_line_id] = q3((m[x.po_line_id] || 0) + num(x.qty_delta)); }); return m; };
  /* which buttons does this person get on this PO?  [{k, ok, reason}] — mirrors the database rules */
  P.actions = function (ctx, po, email, hasReceipts) {
    const R = MC.rbac, has = p => R.has(ctx, p, po.branch_id), out = [], add = (k, ok, reason) => out.push({ k, ok: ok !== false, reason: reason || '' });
    switch (po.status) {
      case 'draft': if (has('po.create')) { add('edit'); add('submit'); } if (has('po.cancel')) add('cancel'); break;
      case 'rejected': if (has('po.create')) add('reopen'); if (has('po.cancel')) add('cancel'); break;
      case 'submitted': { const a = R.canApprove(ctx, po, email); if (has('po.approve')) { add('approve', a.ok, a.reason); add('reject', has('po.approve')); } if (has('po.cancel')) add('cancel'); break; }
      case 'approved': if (has('po.create')) add('order'); if (has('po.cancel')) add('cancel'); break;
      case 'ordered': if (has('po.receive')) add('receive'); if (has('po.cancel') && !hasReceipts) add('cancel'); break;
      case 'partial': if (has('po.receive')) { add('receive'); add('close'); } break;
      default: break;
    }
    return out;
  };
  /* low-stock rows → one draft per supplier.  rows = Inventory.rows() output with needs=true */
  P.groupBySupplier = function (rows) { const g = {}; rows.forEach(r => { const k = r.item.supplier_id || ''; (g[k] = g[k] || []).push(r); }); return Object.keys(g).map(k => ({ supplier_id: k || null, rows: g[k] })); };

  /* ── data ─────────────────────────────────────────────────────────────── */
  P.st = { tab: 'orders', filter: 'open', branch: '', q: '', pos: [], sups: [], items: [] };
  const R = () => MC.rbac;
  const ctx = () => R().ctx();
  const brCode = id => R().branchName(id);
  P.loadSuppliers = async () => { P.st.sups = await MC.sb('suppliers', 'GET', null, 'order=name&limit=500'); return P.st.sups; };
  P.supplier = id => P.st.sups.find(s => s.id === id) || {};
  P.waitingForMe = async function () {
    const rows = await MC.sb('purchase_orders', 'GET', null, 'status=eq.submitted&select=id,branch_id,total,created_by,status&limit=200');
    return rows.filter(p => R().canApprove(ctx(), p, R().email()).ok).length;
  };

  /* ── screen ───────────────────────────────────────────────────────────── */
  P.init = async function () {
    R().injectCss(); const el = document.getElementById('t-po-root'); if (!el) return;
    if (!MC.can('po.view')) { el.innerHTML = '<div class="ch-card">You do not have access to purchasing.</div>'; return; }
    el.innerHTML = '<div class="ch-wrap"><div class="ch-h">🧾 Purchase orders</div><div class="ch-sub">Order what the outlets need. Orders over a person’s limit wait for someone with higher approval rights.</div>' +
      '<div class="ch-tabs">' + [['orders', '🧾 Orders'], ['suppliers', '🚚 Suppliers']].map(t => '<button class="ch-tab' + (P.st.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="po-body">Loading…</div></div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { P.st.tab = b.dataset.t; P.init(); });
    try { await P.loadSuppliers(); await (P.st.tab === 'orders' ? P.renderOrders() : P.renderSuppliers()); }
    catch (e) { document.getElementById('po-body').innerHTML = '<div class="ch-note ch-warn">Could not load: ' + esc(e.message) + '<br>If this says a table does not exist, the SalonChain database script (sql/002) has not been applied yet.</div>'; }
  };
  if (typeof document !== 'undefined') document.addEventListener('mc-branch-change', () => { const p = document.getElementById('t-po'); if (p && p.classList.contains('active')) P.init(); });

  const FILTERS = [['open', 'To do'], ['approval', 'Awaiting approval'], ['receive', 'To receive'], ['draft', 'Drafts'], ['done', 'Completed'], ['all', 'All']];
  const inFilter = (f, p) => f === 'all' || (f === 'open' && ['draft', 'submitted', 'approved', 'rejected', 'ordered', 'partial'].includes(p.status)) || (f === 'approval' && p.status === 'submitted') || (f === 'receive' && ['approved', 'ordered', 'partial'].includes(p.status)) || (f === 'draft' && ['draft', 'rejected'].includes(p.status)) || (f === 'done' && ['received', 'closed', 'cancelled'].includes(p.status));
  P.renderOrders = async function () {
    const S = P.st, body = document.getElementById('po-body'); S.pos = await MC.sb('purchase_orders', 'GET', null, 'order=created_at.desc&limit=300');
    const brs = R().st.branches, me = R().email(), mine = S.pos.filter(p => R().canApprove(ctx(), p, me).ok).length;
    body.innerHTML = '<div class="ch-bar">' + FILTERS.map(f => '<button class="ch-tab' + (S.filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + (f[0] === 'approval' && mine ? ' · ' + mine + ' for you' : '') + '</button>').join('') +
      '<span style="flex:1"></span>' + (brs.length > 1 ? '<select id="po-br" class="fi"><option value="">All my outlets</option>' + brs.map(b => '<option value="' + esc(b.id) + '"' + (S.branch === b.id ? ' selected' : '') + '>' + esc(b.code) + '</option>').join('') + '</select>' : '') +
      '<input id="po-q" class="fi" type="search" placeholder="🔍 PO no. or supplier" value="' + esc(S.q) + '"/>' + (R().canAt('po.create').length ? '<button class="btn btn-y btn-sm" id="po-new">＋ New purchase order</button>' : '') + '</div>' +
      '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>PO</th><th>Outlet</th><th>Supplier</th><th>Date</th><th class="ch-r">Total</th><th>Status</th><th>Created by</th></tr></thead><tbody id="po-tb"></tbody></table></div>';
    const paint = () => {
      const t = S.q.trim().toLowerCase(), rows = S.pos.filter(p => inFilter(S.filter, p) && (!S.branch || p.branch_id === S.branch) && (!t || ((p.po_number || '') + ' ' + (P.supplier(p.supplier_id).name || '')).toLowerCase().includes(t)));
      body.querySelector('#po-tb').innerHTML = rows.map(p => { const st = P.STATUS[p.status] || [p.status, ''], mineRow = p.status === 'submitted' && R().canApprove(ctx(), p, me).ok;
        return '<tr style="cursor:pointer' + (mineRow ? ';background:#FFFBEB' : '') + '" data-o="' + esc(p.id) + '"><td><b>' + esc(p.po_number || '—') + '</b></td><td>' + esc(brCode(p.branch_id)) + '</td><td>' + esc(P.supplier(p.supplier_id).name || '—') + '</td><td>' + MC.fmtDate(p.order_date) + '</td><td class="ch-r">' + money(p.total, p.currency) + '</td><td><span class="ch-chip ' + st[1] + '">' + st[0] + '</span>' + (mineRow ? ' <span class="ch-chip warn">needs you</span>' : '') + '</td><td class="ch-muted">' + esc(p.created_by || '') + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="ch-muted" style="text-align:center;padding:22px">No purchase orders here.</td></tr>';
      body.querySelectorAll('[data-o]').forEach(r => r.onclick = () => P.open(r.dataset.o));
    };
    paint();
    body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.filter = b.dataset.f; P.renderOrders(); });
    body.querySelector('#po-q').oninput = e => { S.q = e.target.value; paint(); }; const sb = body.querySelector('#po-br'); if (sb) sb.onchange = e => { S.branch = e.target.value; paint(); };
    const nb = body.querySelector('#po-new'); if (nb) nb.onclick = () => P.editor(null);
  };

  /* ── create / edit a draft ────────────────────────────────────────────── */
  P.editor = async function (po, prefill) {
    const isNew = !po, brs = R().st.branches.filter(b => MC.can('po.create', b.id)); if (!brs.length) return note('You cannot create purchase orders.', 'err');
    let items = P.st.items; try { items = P.st.items = await MC.sb('inventory_items', 'GET', null, 'active=eq.true&order=name&limit=1000'); } catch (e) { /* use cache */ }
    let lines = []; if (po) lines = await MC.sb('purchase_order_lines', 'GET', null, 'po_id=eq.' + po.id + '&limit=500');
    if (prefill) lines = prefill.lines;
    const cur = po || { branch_id: (prefill && prefill.branch_id) || R().st.branchId, supplier_id: (prefill && prefill.supplier_id) || '', expected_date: '', notes: '', tax_rate: 5, currency: 'AED' };
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + (isNew ? 'New purchase order' : 'Edit ' + esc(po.po_number)) + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div>' + MC.lbl('Outlet') + '<select id="pe-br" class="fi"' + (isNew ? '' : ' disabled') + '>' + brs.map(b => '<option value="' + esc(b.id) + '"' + (b.id === cur.branch_id ? ' selected' : '') + '>' + esc(b.code) + '</option>').join('') + '</select></div>' +
      '<div>' + MC.lbl('Supplier') + '<select id="pe-sup" class="fi"><option value="">Select…</option>' + P.st.sups.filter(s => s.active !== false).map(s => '<option value="' + esc(s.id) + '"' + (s.id === cur.supplier_id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div>' +
      '<div>' + MC.lbl('Expected by') + '<input id="pe-exp" class="fi" type="date" value="' + esc(cur.expected_date || '') + '"/></div></div>' +
      '<div style="margin:12px 0 4px">' + MC.lbl('Items') + '</div><div id="pe-lines"></div><button type="button" class="btn btn-ghost btn-sm" id="pe-add" style="margin-top:6px">＋ Add item</button>' +
      '<div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-top:12px"><div>' + MC.lbl('Notes to supplier (optional)') + '<input id="pe-note" class="fi" value="' + esc(cur.notes || '') + '"/></div><div>' + MC.lbl('VAT %') + '<input id="pe-tax" class="fi" type="number" min="0" step="any" value="' + esc(cur.tax_rate) + '"/></div></div>' +
      '<div id="pe-sum" style="text-align:right;margin-top:10px;font-size:13px"></div><div id="pe-msg" class="ch-err" style="display:none"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="pe-x">Cancel</button><button class="btn btn-ghost" id="pe-save" style="flex:1">Save draft</button><button class="btn btn-y" id="pe-sub" style="flex:1">Save &amp; submit for approval</button></div>', { width: 720, sticky: true });
    const $ = id => ov.querySelector('#' + id), L = lines.map(l => ({ item_id: l.item_id, qty: l.qty_ordered, cost: l.unit_cost }));
    const itemOpts = sel => '<option value="">Pick item…</option>' + items.map(i => '<option value="' + esc(i.id) + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.name) + ' (' + esc(i.unit) + ')</option>').join('');
    const sum = () => { const t = P.totals(L.map(l => ({ qty: l.qty, unit_cost: l.cost })), $('pe-tax').value), c = (brs.find(b => b.id === $('pe-br').value) || {}).currency || 'AED'; $('pe-sum').innerHTML = 'Subtotal <b>' + money(t.subtotal, c) + '</b> · VAT <b>' + money(t.tax, c) + '</b> · Total <b style="font-size:15px">' + money(t.total, c) + '</b>'; };
    const draw = () => {
      $('pe-lines').innerHTML = L.map((l, n) => '<div style="display:grid;grid-template-columns:3fr 1fr 1fr 28px;gap:6px;margin-bottom:6px;align-items:center"><select class="fi" data-n="' + n + '" data-f="item">' + itemOpts(l.item_id) + '</select><input class="fi" type="number" min="0" step="any" placeholder="Qty" data-n="' + n + '" data-f="qty" value="' + esc(l.qty || '') + '"/><input class="fi" type="number" min="0" step="any" placeholder="Unit cost" data-n="' + n + '" data-f="cost" value="' + esc(l.cost || '') + '"/><button type="button" class="ch-x" data-rm="' + n + '" title="Remove">✕</button></div>').join('') || '<div class="ch-muted" style="font-size:13px">No items yet.</div>';
      $('pe-lines').querySelectorAll('[data-f]').forEach(inp => inp.oninput = inp.onchange = () => { const l = L[+inp.dataset.n], f = inp.dataset.f;
        if (f === 'item') { l.item_id = inp.value; const it = items.find(i => i.id === l.item_id); if (it && !num(l.cost)) { l.cost = it.last_cost || ''; if (!num(l.qty) && num(it.pack_size) > 1) l.qty = it.pack_size; draw(); return; } if (it && it.supplier_id && !$('pe-sup').value) $('pe-sup').value = it.supplier_id; } else l[f] = inp.value; sum(); });
      $('pe-lines').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { L.splice(+b.dataset.rm, 1); draw(); sum(); }); sum();
    };
    if (!L.length) L.push({ item_id: '', qty: '', cost: '' }); draw();
    $('pe-add').onclick = () => { L.push({ item_id: '', qty: '', cost: '' }); draw(); }; $('pe-tax').oninput = sum; $('pe-br').onchange = sum; $('pe-x').onclick = () => ov.close();
    const save = async submit => {
      const fail = t => { $('pe-msg').textContent = t; $('pe-msg').style.display = 'block'; };
      if (!$('pe-sup').value) return fail('Choose a supplier.');
      const good = L.filter(l => l.item_id && num(l.qty) > 0); if (!good.length) return fail('Add at least one item with a quantity.');
      if (good.length !== L.filter(l => l.item_id || num(l.qty) > 0).length) return fail('Every line needs an item and a quantity.');
      if (new Set(good.map(l => l.item_id)).size !== good.length) return fail('An item appears twice — combine the quantities.');
      $('pe-save').disabled = $('pe-sub').disabled = true;
      try {
        const head = { supplier_id: $('pe-sup').value, expected_date: $('pe-exp').value || null, notes: $('pe-note').value.trim() || null, tax_rate: num($('pe-tax').value) };
        let id; if (isNew) { const a = await MC.sb('purchase_orders', 'POST', Object.assign({ branch_id: $('pe-br').value, currency: (brs.find(b => b.id === $('pe-br').value) || {}).currency || 'AED', status: 'draft' }, head)); id = (Array.isArray(a) ? a[0] : a).id; }
        else { id = po.id; await MC.sb('purchase_orders', 'PATCH', head, 'id=eq.' + id, 'return=minimal'); await MC.sb('purchase_order_lines', 'DELETE', null, 'po_id=eq.' + id, 'return=minimal'); }
        await MC.sb('purchase_order_lines', 'POST', good.map(l => { const it = items.find(i => i.id === l.item_id) || {}; return { po_id: id, item_id: l.item_id, description: it.name || 'Item', qty_ordered: num(l.qty), unit_cost: num(l.cost) }; }), null, 'return=minimal');
        if (submit) { const t = P.totals(good.map(l => ({ qty: l.qty, unit_cost: l.cost })), head.tax_rate); await MC.sb('purchase_orders', 'PATCH', { status: 'submitted', subtotal: t.subtotal, tax_amount: t.tax, total: t.total }, 'id=eq.' + id, 'return=minimal'); }
        ov.close(); note(submit ? 'Submitted for approval' : 'Draft saved'); await P.init(); R().badges(true);
      } catch (e) { $('pe-save').disabled = $('pe-sub').disabled = false; fail(cleanErr(e)); }
    };
    $('pe-save').onclick = () => save(false); $('pe-sub').onclick = () => save(true);
  };
  const cleanErr = e => { const m = /"message":"([^"]+)"/.exec(e.message || ''); return m ? m[1] : (e.message || 'Something went wrong'); };

  /* low-stock → one draft PO per supplier */
  P.newFromSuggestions = function (rows, branchId) {
    if (!rows.length) return; const groups = P.groupBySupplier(rows), sups = P.st.sups.length ? Promise.resolve(P.st.sups) : P.loadSuppliers();
    sups.then(() => {
      const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:4px">Create purchase orders from low stock</div><div class="ch-sub">One draft per supplier. Check the supplier for each group — you can edit quantities before submitting.</div><div id="ns-groups"></div><div id="ns-msg" class="ch-err" style="display:none"></div>' +
        '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-ghost" id="ns-x">Cancel</button><button class="btn btn-y" id="ns-go" style="flex:1">Create ' + groups.length + ' draft' + (groups.length > 1 ? 's' : '') + '</button></div>', { width: 560, sticky: true });
      const $ = id => ov.querySelector('#' + id);
      $('ns-groups').innerHTML = groups.map((g, n) => '<div class="ch-card" style="margin-bottom:8px"><select class="fi" data-g="' + n + '" style="margin-bottom:6px"><option value="">Select supplier…</option>' + P.st.sups.filter(s => s.active !== false).map(s => '<option value="' + esc(s.id) + '"' + (s.id === g.supplier_id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>' +
        g.rows.map(r => '<div style="font-size:13px;display:flex;justify-content:space-between"><span>' + esc(r.item.name) + '</span><b>' + fmt(r.qty) + ' ' + esc(r.item.unit) + '</b></div>').join('') + '</div>').join('');
      $('ns-x').onclick = () => ov.close();
      $('ns-go').onclick = async () => {
        const sel = [...ov.querySelectorAll('[data-g]')]; if (sel.some(s => !s.value)) { $('ns-msg').textContent = 'Choose a supplier for every group.'; $('ns-msg').style.display = 'block'; return; }
        $('ns-go').disabled = true; const br = (R().st.branches.find(b => b.id === branchId) || {});
        try {
          for (let n = 0; n < groups.length; n++) {
            const a = await MC.sb('purchase_orders', 'POST', { branch_id: branchId, supplier_id: sel[n].value, currency: br.currency || 'AED', tax_rate: 5, status: 'draft', notes: 'Created from low-stock list' }), id = (Array.isArray(a) ? a[0] : a).id;
            await MC.sb('purchase_order_lines', 'POST', groups[n].rows.map(r => ({ po_id: id, item_id: r.item.id, description: r.item.name, qty_ordered: r.qty, unit_cost: num(r.item.last_cost) })), null, 'return=minimal');
          }
          ov.close(); note(groups.length + ' draft purchase order' + (groups.length > 1 ? 's' : '') + ' created'); P.st.filter = 'draft'; showTab('t-po'); P.init();
        } catch (e) { $('ns-go').disabled = false; $('ns-msg').textContent = cleanErr(e); $('ns-msg').style.display = 'block'; }
      };
    });
  };

  /* ── one PO: details, history and the buttons this person is allowed to press ── */
  P.open = async function (id) {
    const po = (await MC.sb('purchase_orders', 'GET', null, 'id=eq.' + id + '&limit=1'))[0]; if (!po) return note('Purchase order not found.', 'err');
    const [lines, receipts] = await Promise.all([MC.sb('purchase_order_lines', 'GET', null, 'po_id=eq.' + id + '&limit=500'), MC.sb('po_receipts', 'GET', null, 'po_id=eq.' + id + '&order=created_at')]);
    const lineIds = lines.map(l => l.id), recMoves = lineIds.length ? await MC.sb('stock_movements', 'GET', null, 'po_line_id=in.(' + lineIds.join(',') + ')&limit=1000') : [], got = P.received(recMoves);
    let items = P.st.items; if (!items.length) { try { items = P.st.items = await MC.sb('inventory_items', 'GET', null, 'order=name&limit=1000'); } catch (e) { items = []; } }
    const sup = P.supplier(po.supplier_id), st = P.STATUS[po.status] || [po.status, ''], acts = P.actions(ctx(), po, R().email(), receipts.length > 0), cur = po.currency;
    const nm = {}; items.forEach(i => { nm[i.id] = i; });
    const ev = [['Created', po.created_at, po.created_by], ['Submitted for approval', po.submitted_at, po.created_by], ['Approved', po.approved_at, po.approved_by], ['Order placed', po.ordered_at, '']].filter(e => e[1]).map(e => '<div>• ' + e[0] + ' — ' + new Date(e[1]).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (e[2] ? ' by ' + esc(e[2]) : '') + '</div>').join('') +
      receipts.map(r => '<div>• Goods received ' + MC.fmtDate(r.received_on) + (r.delivery_ref ? ' (ref ' + esc(r.delivery_ref) + ')' : '') + (r.received_by ? ' by ' + esc(r.received_by) : '') + '</div>').join('') +
      (po.rejected_reason && po.status === 'rejected' ? '<div style="color:#B91C1C">• Rejected: ' + esc(po.rejected_reason) + '</div>' : '') + (po.cancelled_reason ? '<div style="color:#B91C1C">• Cancelled: ' + esc(po.cancelled_reason) + '</div>' : '');
    const btn = { edit: ['✏️ Edit', 'btn-ghost'], submit: ['📤 Submit for approval', 'btn-y'], approve: ['✅ Approve', 'btn-g'], reject: ['✋ Reject', 'btn-ghost'], order: ['📨 Place order', 'btn-y'], receive: ['📥 Receive goods', 'btn-y'], close: ['Close short', 'btn-ghost'], cancel: ['Cancel order', 'btn-ghost'], reopen: ['↩ Re-open as draft', 'btn-y'] };
    const ov = MC.modal('<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div style="font:800 19px var(--fh);color:var(--bd)">' + esc(po.po_number) + '</div><div class="ch-muted" style="font-size:12.5px">' + esc(brCode(po.branch_id)) + ' · ' + esc(sup.name || '') + ' · ' + MC.fmtDate(po.order_date) + (po.expected_date ? ' · expected ' + MC.fmtDate(po.expected_date) : '') + '</div></div><span class="ch-chip ' + st[1] + '" style="font-size:12px">' + st[0] + '</span></div>' +
      '<div class="ch-card" style="padding:0;overflow:auto;margin:12px 0"><table class="ch-tbl"><thead><tr><th>Item</th><th class="ch-r">Ordered</th><th class="ch-r">Received</th><th class="ch-r">Pending</th><th class="ch-r">Unit cost</th><th class="ch-r">Total</th></tr></thead><tbody>' +
      lines.map(l => { const g = got[l.id] || 0, pend = Math.max(0, q3(num(l.qty_ordered) - g)), u = (nm[l.item_id] || {}).unit || ''; return '<tr><td>' + esc(l.description) + '</td><td class="ch-r">' + fmt(l.qty_ordered) + ' ' + esc(u) + '</td><td class="ch-r">' + (g ? fmt(g) : '—') + '</td><td class="ch-r">' + (['ordered', 'partial'].includes(po.status) && pend ? '<b>' + fmt(pend) + '</b>' : '—') + '</td><td class="ch-r">' + r2(l.unit_cost).toFixed(2) + '</td><td class="ch-r">' + r2(l.line_total != null ? l.line_total : num(l.qty_ordered) * num(l.unit_cost)).toFixed(2) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div style="text-align:right;font-size:13px">Subtotal ' + money(po.subtotal || P.totals(lines, po.tax_rate).subtotal, cur) + ' · VAT ' + money(po.tax_amount || P.totals(lines, po.tax_rate).tax, cur) + ' · <b style="font-size:16px">' + money(po.total || P.totals(lines, po.tax_rate).total, cur) + '</b></div>' +
      (po.notes ? '<div class="ch-muted" style="font-size:12.5px;margin-top:6px">📝 ' + esc(po.notes) + '</div>' : '') + '<div class="ch-muted" style="font-size:12.5px;line-height:1.7;margin-top:10px">' + ev + '</div>' +
      (acts.some(a => !a.ok) ? '<div class="ch-note ch-warn">' + acts.filter(a => !a.ok).map(a => esc(a.reason)).join('<br>') + '</div>' : '') + '<div id="pd-msg" class="ch-err" style="display:none"></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-ghost" id="pd-x">Close</button><span style="flex:1"></span>' +
      (['approved', 'ordered', 'partial', 'received'].includes(po.status) ? '<button class="btn btn-ghost" id="pd-print">🖨 Print</button>' + (sup.whatsapp || sup.phone ? '<button class="btn btn-ghost" id="pd-wa">📲 WhatsApp supplier</button>' : '') : '') +
      acts.map(a => '<button class="btn ' + btn[a.k][1] + '" data-a="' + a.k + '"' + (a.ok ? '' : ' disabled style="opacity:.45"') + '>' + btn[a.k][0] + '</button>').join('') + '</div>', { width: 720 });
    const $ = x => ov.querySelector('#' + x), fail = t => { $('pd-msg').textContent = t; $('pd-msg').style.display = 'block'; };
    $('pd-x').onclick = () => ov.close();
    const patch = async (body, ok) => { try { await MC.sb('purchase_orders', 'PATCH', body, 'id=eq.' + id, 'return=minimal'); ov.close(); note(ok); await P.init(); R().badges(true); } catch (e) { fail(cleanErr(e)); } };
    const ask = (title, label, then) => { const o2 = MC.modal('<div style="font:800 17px var(--fh);color:var(--bd);margin-bottom:8px">' + title + '</div>' + MC.lbl(label) + '<input id="as-t" class="fi"/><div id="as-m" class="ch-err" style="display:none">Please give a reason.</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-ghost" id="as-x">Back</button><button class="btn btn-y" id="as-ok" style="flex:1">Confirm</button></div>', { width: 380, sticky: true });
      o2.querySelector('#as-x').onclick = () => o2.close(); o2.querySelector('#as-ok').onclick = () => { const v = o2.querySelector('#as-t').value.trim(); if (!v) { o2.querySelector('#as-m').style.display = 'block'; return; } o2.close(); then(v); }; setTimeout(() => o2.querySelector('#as-t').focus(), 40); };
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({
      edit: () => { ov.close(); P.editor(po); },
      submit: () => { const t = P.totals(lines, po.tax_rate); patch({ status: 'submitted', subtotal: t.subtotal, tax_amount: t.tax, total: t.total }, 'Submitted for approval'); },
      approve: () => patch({ status: 'approved' }, 'Approved'),
      reject: () => ask('Reject ' + esc(po.po_number), 'Reason', v => patch({ status: 'rejected', rejected_reason: v }, 'Rejected')),
      order: () => patch({ status: 'ordered' }, 'Marked as ordered — send it to the supplier'),
      cancel: () => ask('Cancel ' + esc(po.po_number), 'Reason', v => patch({ status: 'cancelled', cancelled_reason: v }, 'Cancelled')),
      close: () => ask('Close ' + esc(po.po_number) + ' short', 'Why is the rest not coming?', v => patch({ status: 'closed', notes: ((po.notes || '') + ' [Closed short: ' + v + ']').trim() }, 'Closed')),
      reopen: () => patch({ status: 'draft' }, 'Re-opened as a draft'),
      receive: () => { ov.close(); P.receiveDialog(po, lines, got, nm); }
    })[b.dataset.a]());
    const text = P.shareText(po, lines, sup, nm);
    if ($('pd-print')) $('pd-print').onclick = () => P.print(po, lines, sup, nm);
    if ($('pd-wa')) $('pd-wa').onclick = () => window.open('https://wa.me/' + String(sup.whatsapp || sup.phone).replace(/\D/g, '') + '?text=' + encodeURIComponent(text), '_blank');
  };
  P.shareText = function (po, lines, sup, nm) {
    const br = (R().st.branches.find(b => b.id === po.branch_id) || {});
    return 'Purchase order ' + po.po_number + ' — ' + (br.name || 'MiNiCUTS') + '\n' + lines.map(l => '• ' + l.description + ' × ' + fmt(l.qty_ordered) + ' ' + ((nm[l.item_id] || {}).unit || '') + ' @ ' + r2(l.unit_cost).toFixed(2)).join('\n') + '\nTotal ' + money(po.total, po.currency) + ' (incl. ' + num(po.tax_rate) + '% VAT)' + (po.expected_date ? '\nNeeded by ' + po.expected_date : '') + '\nPlease confirm availability and delivery date. Thank you.';
  };
  P.print = async function (po, lines, sup, nm) {
    let co = {}; try { co = (await MC.getConfig('co_settings')) || {}; } catch (e) { /* optional */ } const br = (R().st.branches.find(b => b.id === po.branch_id) || {});
    const w = window.open('', '_blank'); if (!w) return note('Allow pop-ups to print.', 'err');
    w.document.write('<!doctype html><title>' + esc(po.po_number) + '</title><style>body{font:14px system-ui,sans-serif;margin:30px;color:#111}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}.r{text-align:right}h1{font-size:22px;margin:0}</style>' +
      '<h1>Purchase order ' + esc(po.po_number) + '</h1><p>' + esc(co.bname || 'MiNiCUTS FZCO') + (co.trn ? ' · TRN ' + esc(co.trn) : '') + '<br>Deliver to: ' + esc(br.name || '') + (br.address ? ', ' + esc(br.address) : '') + '</p><p><b>Supplier:</b> ' + esc(sup.name || '') + (sup.contact_name ? ' · ' + esc(sup.contact_name) : '') + '<br><b>Date:</b> ' + esc(po.order_date) + (po.expected_date ? ' · <b>Needed by:</b> ' + esc(po.expected_date) : '') + '</p>' +
      '<table><tr><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th class="r">Total</th></tr>' + lines.map(l => '<tr><td>' + esc(l.description) + '</td><td class="r">' + fmt(l.qty_ordered) + ' ' + esc((nm[l.item_id] || {}).unit || '') + '</td><td class="r">' + r2(l.unit_cost).toFixed(2) + '</td><td class="r">' + r2(num(l.qty_ordered) * num(l.unit_cost)).toFixed(2) + '</td></tr>').join('') + '</table><p class="r"><b>Subtotal ' + r2(po.subtotal).toFixed(2) + ' · VAT ' + r2(po.tax_amount).toFixed(2) + ' · Total ' + money(po.total, po.currency) + '</b></p>' + (po.notes ? '<p>' + esc(po.notes) + '</p>' : '') + '<p style="margin-top:40px">Approved by: ' + esc(po.approved_by || '—') + '</p>');
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  /* ── receiving goods → incoming stock tied to this PO ─────────────────── */
  P.receiveDialog = function (po, lines, got, nm) {
    const open = lines.map(l => ({ l, pend: Math.max(0, q3(num(l.qty_ordered) - (got[l.id] || 0))) })).filter(x => x.pend > 0);
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:4px">📥 Receive goods — ' + esc(po.po_number) + '</div><div class="ch-sub">Enter what actually arrived. Anything not received stays open on the order.</div>' +
      '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Item</th><th class="ch-r">Pending</th><th class="ch-r">Received now</th></tr></thead><tbody>' +
      open.map((x, n) => '<tr><td>' + esc(x.l.description) + '</td><td class="ch-r">' + fmt(x.pend) + ' ' + esc((nm[x.l.item_id] || {}).unit || '') + '</td><td class="ch-r"><input class="fi" style="width:90px;text-align:right" type="number" min="0" max="' + x.pend + '" step="any" data-n="' + n + '" value="' + x.pend + '"/></td></tr>').join('') + '</tbody></table></div>' +
      '<div style="margin-top:10px">' + MC.lbl('Delivery note / invoice no. (optional)') + '<input id="rc-ref" class="fi"/></div><div id="rc-msg" class="ch-err" style="display:none"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="rc-x">Cancel</button><button class="btn btn-y" id="rc-ok" style="flex:1">Add to stock</button></div>', { width: 560, sticky: true });
    const $ = id => ov.querySelector('#' + id); $('rc-x').onclick = () => ov.close();
    $('rc-ok').onclick = async () => {
      const fail = t => { $('rc-msg').textContent = t; $('rc-msg').style.display = 'block'; }, qs = [...ov.querySelectorAll('[data-n]')].map(i => num(i.value));
      if (qs.some((q, n) => q < 0 || q > open[n].pend + 1e-9)) return fail('You cannot receive more than is pending.'); if (!qs.some(q => q > 0)) return fail('Enter a quantity for at least one item.');
      $('rc-ok').disabled = true;
      try {
        const rc = await MC.sb('po_receipts', 'POST', { po_id: po.id, received_on: MC.today(), delivery_ref: $('rc-ref').value.trim() || null, received_by: R().email() }), rid = (Array.isArray(rc) ? rc[0] : rc).id;
        await MC.sb('stock_movements', 'POST', open.map((x, n) => qs[n] > 0 ? { branch_id: po.branch_id, item_id: x.l.item_id, move_type: 'receipt', qty_delta: qs[n], unit_cost: num(x.l.unit_cost), po_line_id: x.l.id, receipt_id: rid, moved_on: MC.today(), note: 'PO ' + po.po_number } : null).filter(Boolean), null, 'return=minimal');
        ov.close(); note('Stock updated'); await P.init(); R().badges(true);
      } catch (e) { $('rc-ok').disabled = false; fail(cleanErr(e)); }
    };
  };

  /* ── suppliers ────────────────────────────────────────────────────────── */
  P.renderSuppliers = function () {
    const body = document.getElementById('po-body'), can = MC.can('suppliers.manage');
    body.innerHTML = (can ? '<div class="ch-bar"><button class="btn btn-y btn-sm" id="su-add">＋ Add supplier</button></div>' : '') + '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Supplier</th><th>Contact</th><th>Terms</th><th class="ch-r">Lead time</th><th>Status</th><th></th></tr></thead><tbody>' +
      (P.st.sups.map(s => '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.contact_name || '') + '<div class="ch-muted" style="font-size:11.5px">' + esc([s.phone, s.email].filter(Boolean).join(' · ')) + '</div></td><td>' + esc(s.payment_terms || '—') + '</td><td class="ch-r">' + esc(s.lead_time_days) + ' d</td><td>' + (s.active === false ? '<span class="ch-chip err">Off</span>' : '<span class="ch-chip ok">Active</span>') + '</td><td class="ch-r">' + (can ? '<button class="btn btn-ghost btn-sm" data-e="' + esc(s.id) + '">Edit</button>' : '') + '</td></tr>').join('') || '<tr><td colspan="6" class="ch-muted" style="text-align:center;padding:22px">No suppliers yet.</td></tr>') + '</tbody></table></div>' + (can ? '' : '<div class="ch-note">Only the controller or owner can add or change suppliers.</div>');
    if (can) { body.querySelector('#su-add').onclick = () => P.editSupplier(null); body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => P.editSupplier(P.st.sups.find(s => s.id === b.dataset.e))); }
  };
  P.editSupplier = function (s) {
    const isNew = !s; s = s || { name: '', contact_name: '', phone: '', whatsapp: '', email: '', payment_terms: '', lead_time_days: 3, notes: '', active: true };
    const f = (id, l, v, t) => '<div>' + MC.lbl(l) + '<input id="' + id + '" class="fi" type="' + (t || 'text') + '" value="' + esc(v == null ? '' : v) + '"/></div>';
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + (isNew ? 'Add supplier' : 'Edit supplier') + '</div><div style="display:grid;gap:10px">' + f('sp-name', 'Name', s.name) + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + f('sp-con', 'Contact person', s.contact_name) + f('sp-ph', 'Phone', s.phone) + f('sp-wa', 'WhatsApp (with country code)', s.whatsapp) + f('sp-em', 'E-mail', s.email, 'email') + f('sp-terms', 'Payment terms', s.payment_terms) + f('sp-lead', 'Lead time (days)', s.lead_time_days, 'number') + '</div>' +
      '<label style="display:flex;gap:6px;font-size:13px"><input type="checkbox" id="sp-act"' + (s.active !== false ? ' checked' : '') + '/> Active</label></div><div id="sp-msg" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="sp-x">Cancel</button><button class="btn btn-y" id="sp-save" style="flex:1">Save</button></div>', { width: 460, sticky: true });
    const $ = id => ov.querySelector('#' + id); $('sp-x').onclick = () => ov.close();
    $('sp-save').onclick = async () => {
      if (!$('sp-name').value.trim()) { $('sp-msg').textContent = 'Enter the supplier name.'; $('sp-msg').style.display = 'block'; return; }
      const row = { name: $('sp-name').value.trim(), contact_name: $('sp-con').value.trim() || null, phone: $('sp-ph').value.trim() || null, whatsapp: $('sp-wa').value.trim() || null, email: $('sp-em').value.trim() || null, payment_terms: $('sp-terms').value.trim() || null, lead_time_days: parseInt($('sp-lead').value, 10) || 0, active: $('sp-act').checked };
      try { if (isNew) await MC.sb('suppliers', 'POST', row, null, 'return=minimal'); else await MC.sb('suppliers', 'PATCH', row, 'id=eq.' + s.id, 'return=minimal'); ov.close(); P.init(); }
      catch (e) { $('sp-msg').textContent = cleanErr(e); $('sp-msg').style.display = 'block'; }
    };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof window !== 'undefined' ? window : globalThis);
