/* ============================================================================
 * mc-inventory.js — SalonChain: stock for the current outlet.
 *
 * Stock is never edited directly. Every change is a line in an append-only ledger (stock_movements):
 *   incoming  = receipt (from a supplier / purchase order), transfer_in, opening, adjust(+)
 *   outgoing  = issue (used in a service, gift to a child, damaged, expired…), transfer_out, adjust(−)
 * "On hand" is the sum of the ledger. Reorder alerts compare it with each item's reorder point, and the
 * suggested order quantity also counts what is already on order, so the same item is not ordered twice.
 *
 * Pure helpers (suggest, rows, onHand …) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const I = MC.inventory = MC.inventory || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Number(v) || 0;
  const r2 = n => Math.round((num(n) + Number.EPSILON) * 100) / 100;
  const q3 = n => Math.round(num(n) * 1000) / 1000;
  const fmt = n => q3(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
  I.SAFETY_DAYS = 2; I.USAGE_DAYS = 30;
  I.CATEGORIES = ['Hair care', 'Styling', 'Disposables', 'Kids gifts', 'Cleaning', 'Colour', 'Other'];
  I.REASONS_OUT = [['used_in_service', 'Used in a service'], ['gift', 'Gift to a child'], ['damaged', 'Damaged'], ['expired', 'Expired'], ['other', 'Other']];
  I.REASONS_ADJ = [['count', 'Stock count'], ['damaged', 'Damaged'], ['expired', 'Expired'], ['lost', 'Lost / missing'], ['correction', 'Correction']];
  I.STARTER = [['Kids shampoo 1L', 'Hair care', 'bottle', 6, 20], ['Kids conditioner 1L', 'Hair care', 'bottle', 6, 20], ['Detangler spray 500ml', 'Hair care', 'bottle', 6, 18], ['Hair gel 500ml', 'Styling', 'bottle', 6, 15],
    ['Neck strips (roll)', 'Disposables', 'roll', 10, 8], ['Disposable capes', 'Disposables', 'pack', 10, 12], ['Razor blades', 'Disposables', 'box', 10, 10], ['Cotton wool', 'Disposables', 'pack', 10, 6], ['Tissue boxes', 'Disposables', 'box', 24, 3],
    ['Lollipops', 'Kids gifts', 'pcs', 100, 0.4], ['Small gift toys', 'Kids gifts', 'pcs', 50, 2.5], ['Stickers', 'Kids gifts', 'pack', 20, 4], ['Hand sanitiser 500ml', 'Cleaning', 'bottle', 12, 9], ['Surface disinfectant', 'Cleaning', 'bottle', 12, 11], ['Comb sanitising solution', 'Cleaning', 'bottle', 6, 14]];
  I.uuid = () => (root.crypto && root.crypto.randomUUID) ? root.crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

  /* ── pure logic ───────────────────────────────────────────────────────── */
  /* status from what is physically on the shelf */
  I.status = function (onHand, reorderPoint) {
    if (num(onHand) <= 0) return 'out';
    if (num(reorderPoint) > 0 && num(onHand) <= num(reorderPoint)) return 'low';
    return 'ok';
  };
  /* Reorder rule.
   *   position = on hand + already on order.  Reorder when position <= reorder point.
   *   target   = max level, or (reorder point + reorder qty) when no max level is set.
   *   qty      = the larger of "reorder qty" and "target − position", rounded UP to whole packs.
   *   daysCover = on hand ÷ average daily use (last 30 days);  suggestedRp = daily use × (lead time + safety days). */
  I.suggest = function (o) {
    const onHand = num(o.onHand), onOrder = num(o.onOrder), rp = num(o.reorderPoint), rq = num(o.reorderQty), pack = num(o.packSize) > 0 ? num(o.packSize) : 1, avg = num(o.avgDaily);
    const position = onHand + onOrder, needs = rp > 0 && position <= rp;
    const target = num(o.maxLevel) > 0 ? num(o.maxLevel) : rp + rq;
    let qty = 0; if (needs) { qty = Math.max(rq, target - position); if (qty <= 0) qty = pack; qty = Math.ceil(qty / pack - 1e-9) * pack; }
    return { status: I.status(onHand, rp), position, needs, qty, daysCover: avg > 0 ? onHand / avg : null,
      suggestedRp: avg > 0 ? Math.ceil(avg * ((o.leadDays != null ? num(o.leadDays) : 3) + (o.safetyDays != null ? num(o.safetyDays) : I.SAFETY_DAYS))) : null };
  };
  /* one row per item for a single outlet.  data = { items, sets:{item_id:settings}, moves, lines } */
  I.rows = function (data, today, days) {
    days = days || I.USAGE_DAYS; const since = MC.addDays(today || MC.today(), -days);
    const oh = {}, use = {}, rec = {}, ord = {}, last = {};
    (data.moves || []).forEach(m => { oh[m.item_id] = (oh[m.item_id] || 0) + num(m.qty_delta); if (m.move_type === 'issue' && String(m.moved_on) >= since) use[m.item_id] = (use[m.item_id] || 0) - num(m.qty_delta); if (m.po_line_id) rec[m.po_line_id] = (rec[m.po_line_id] || 0) + num(m.qty_delta); last[m.item_id] = 1; });
    (data.lines || []).forEach(l => { if (l.item_id) ord[l.item_id] = (ord[l.item_id] || 0) + Math.max(0, num(l.qty_ordered) - (rec[l.id] || 0)); });
    return (data.items || []).map(it => {
      const s = (data.sets || {})[it.id] || {}, onHand = q3(oh[it.id] || 0), avg = (use[it.id] || 0) / days;
      const g = I.suggest({ onHand, onOrder: ord[it.id] || 0, reorderPoint: s.reorder_point, reorderQty: s.reorder_qty, maxLevel: s.max_level, packSize: it.pack_size, avgDaily: avg, leadDays: s.lead_time_days != null ? s.lead_time_days : 3 });
      return Object.assign({ item: it, set: s, onHand, onOrder: q3(ord[it.id] || 0), avgDaily: avg, value: r2(onHand * num(it.last_cost)), hasMoves: !!last[it.id] }, g);
    });
  };
  I.sum = (rows) => ({ items: rows.length, low: rows.filter(r => r.status === 'low').length, out: rows.filter(r => r.status === 'out').length, toOrder: rows.filter(r => r.needs).length, value: r2(rows.reduce((a, r) => a + r.value, 0)) });

  /* ── data ─────────────────────────────────────────────────────────────── */
  I.loadBranch = async function (bid) {
    const [items, sets, moves, pos] = await Promise.all([
      MC.sb('inventory_items', 'GET', null, 'active=eq.true&order=name&limit=1000'),
      MC.sb('item_branch_settings', 'GET', null, 'branch_id=eq.' + bid + '&limit=1000'),
      MC.sbAll('stock_movements', 'select=item_id,move_type,qty_delta,moved_on,po_line_id&branch_id=eq.' + bid),
      MC.sb('purchase_orders', 'GET', null, 'branch_id=eq.' + bid + '&status=in.(submitted,approved,ordered,partial)&select=id,status&limit=500')]);
    let lines = []; if (pos.length) lines = await MC.sb('purchase_order_lines', 'GET', null, 'po_id=in.(' + pos.map(p => p.id).join(',') + ')&limit=3000');
    const m = {}; sets.forEach(s => { m[s.item_id] = s; });
    return { bid, items, sets: m, moves, lines };
  };
  I.st = { tab: 'stock', q: '', cat: '', lowOnly: false, data: null, rows: [] };
  const bid = () => (MC.rbac && MC.rbac.st.branchId) || null;
  const can = (p, b) => MC.can(p, b == null ? bid() : b);
  I.lowCount = async function () { if (!bid()) return 0; return I.rows(await I.loadBranch(bid())).filter(x => x.needs).length; };
  const note = (m, t) => { if (typeof toast === 'function') toast(m, t); };

  /* ── screen ───────────────────────────────────────────────────────────── */
  I.init = async function () {
    MC.rbac.injectCss(); const el = document.getElementById('t-inventory-root'); if (!el) return;
    if (!MC.can('inventory.view')) { el.innerHTML = '<div class="ch-card">You do not have access to stock.</div>'; return; }
    if (!bid()) { el.innerHTML = '<div class="ch-card">No outlet is assigned to your login yet.</div>'; return; }
    const br = MC.rbac.branch();
    el.innerHTML = '<div class="ch-wrap"><div class="ch-h">📦 Stock — ' + esc(br.name) + '</div><div class="ch-sub">Everything coming in and going out of this outlet, with reorder alerts.</div>' +
      '<div class="ch-tabs">' + [['stock', '📦 Stock'], ['moves', '↕ Movements'], ['items', '🏷 Items & reorder levels']].filter(t => t[0] !== 'items' || can('inventory.items')).map(t => '<button class="ch-tab' + (I.st.tab === t[0] ? ' on' : '') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="inv-body">Loading…</div></div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { I.st.tab = b.dataset.t; I.init(); });
    try {
      I.st.data = await I.loadBranch(bid()); I.st.rows = I.rows(I.st.data);
      await ({ stock: I.renderStock, moves: I.renderMoves, items: I.renderItems })[I.st.tab]();
    } catch (e) { document.getElementById('inv-body').innerHTML = '<div class="ch-note ch-warn">Could not load stock: ' + esc(e.message) + '<br>If this says a table does not exist, the SalonChain database script (sql/002) has not been applied yet.</div>'; }
  };
  if (typeof document !== 'undefined') document.addEventListener('mc-branch-change', () => { const p = document.getElementById('t-inventory'); if (p && p.classList.contains('active')) I.init(); });

  const chip = (r) => r.status === 'out' ? '<span class="ch-chip err">Out of stock</span>' : r.status === 'low' ? '<span class="ch-chip warn">Reorder</span>' : '<span class="ch-chip ok">OK</span>';
  I.renderStock = function () {
    const S = I.st, sum = I.sum(S.rows), body = document.getElementById('inv-body'), cats = [...new Set(S.rows.map(r => r.item.category).filter(Boolean))].sort();
    body.innerHTML = '<div class="ch-grid" style="margin-bottom:12px">' + [['Items', sum.items, ''], ['Need reordering', sum.toOrder, sum.toOrder ? 'warn' : ''], ['Out of stock', sum.out, sum.out ? 'err' : ''], ['Stock value (at last cost)', 'AED ' + sum.value.toLocaleString(), '']].map(k => '<div class="ch-card" style="margin:0"><div class="ch-kpi"' + (k[2] === 'err' ? ' style="color:var(--err)"' : k[2] === 'warn' ? ' style="color:#B45309"' : '') + '>' + k[1] + '</div><div class="ch-kl">' + k[0] + '</div></div>').join('') + '</div>' +
      '<div class="ch-bar"><input id="inv-q" class="fi" type="search" placeholder="🔍 Search items" value="' + esc(S.q) + '"/><select id="inv-cat" class="fi"><option value="">All categories</option>' + cats.map(c => '<option' + (c === S.cat ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select>' +
      '<label style="font-size:13px"><input type="checkbox" id="inv-low"' + (S.lowOnly ? ' checked' : '') + '/> Only items to reorder</label><span style="flex:1"></span>' +
      (can('inventory.receive') ? '<button class="btn btn-y btn-sm" id="inv-rec">＋ Receive stock</button>' : '') + (can('inventory.issue') ? '<button class="btn btn-ghost btn-sm" id="inv-use">− Use / give out</button>' : '') +
      (can('inventory.transfer') && MC.rbac.st.branches.length > 1 ? '<button class="btn btn-ghost btn-sm" id="inv-tr">↔ Transfer</button>' : '') + (can('po.create') && sum.toOrder ? '<button class="btn btn-b btn-sm" id="inv-po">🧾 Create PO from low stock (' + sum.toOrder + ')</button>' : '') + '</div>' +
      '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Item</th><th class="ch-r">On hand</th><th class="ch-r">Reorder at</th><th>Status</th><th class="ch-r">Days left</th><th class="ch-r">On order</th><th class="ch-r">Suggested order</th><th></th></tr></thead><tbody id="inv-tb"></tbody></table></div>' +
      (sum.items ? '' : '<div class="ch-note">No items yet.' + (can('inventory.items') ? ' Go to <b>Items &amp; reorder levels</b> to add your first items, or load a starter list.' : ' Ask a manager to set up the item list.') + '</div>');
    const paint = () => {
      const t = S.q.trim().toLowerCase(), rows = S.rows.filter(r => (!t || (r.item.name + ' ' + (r.item.sku || '')).toLowerCase().includes(t)) && (!S.cat || r.item.category === S.cat) && (!S.lowOnly || r.needs));
      body.querySelector('#inv-tb').innerHTML = rows.map(r => '<tr><td><b>' + esc(r.item.name) + '</b><div class="ch-muted" style="font-size:11.5px">' + esc(r.item.category || '') + (r.item.sku ? ' · ' + esc(r.item.sku) : '') + '</div></td>' +
        '<td class="ch-r"><b>' + fmt(r.onHand) + '</b> <span class="ch-muted">' + esc(r.item.unit) + '</span></td><td class="ch-r">' + (num(r.set.reorder_point) ? fmt(r.set.reorder_point) : '<span class="ch-muted">not set</span>') + '</td><td>' + chip(r) + '</td>' +
        '<td class="ch-r">' + (r.daysCover == null ? '<span class="ch-muted">—</span>' : (r.daysCover < 7 ? '<b style="color:#B45309">' : '<b>') + Math.round(r.daysCover) + '</b>') + '</td><td class="ch-r">' + (r.onOrder ? fmt(r.onOrder) : '<span class="ch-muted">—</span>') + '</td>' +
        '<td class="ch-r">' + (r.needs ? '<b>' + fmt(r.qty) + '</b> ' + esc(r.item.unit) : '<span class="ch-muted">—</span>') + '</td><td class="ch-r" style="white-space:nowrap">' +
        (can('inventory.receive') ? '<button class="btn btn-ghost btn-sm" data-a="in" data-i="' + esc(r.item.id) + '" title="Receive">＋</button> ' : '') + (can('inventory.issue') ? '<button class="btn btn-ghost btn-sm" data-a="out" data-i="' + esc(r.item.id) + '" title="Use / give out">−</button> ' : '') +
        (can('inventory.adjust') ? '<button class="btn btn-ghost btn-sm" data-a="adj" data-i="' + esc(r.item.id) + '" title="Count / adjust">⚖</button>' : '') + '</td></tr>').join('') || '<tr><td colspan="8" class="ch-muted" style="text-align:center;padding:22px">Nothing to show.</td></tr>';
      body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => I.moveDialog(b.dataset.a, b.dataset.i));
    };
    paint();
    body.querySelector('#inv-q').oninput = e => { S.q = e.target.value; paint(); }; body.querySelector('#inv-cat').onchange = e => { S.cat = e.target.value; paint(); }; body.querySelector('#inv-low').onchange = e => { S.lowOnly = e.target.checked; paint(); };
    const on = (id, f) => { const b = body.querySelector(id); if (b) b.onclick = f; };
    on('#inv-rec', () => I.moveDialog('in')); on('#inv-use', () => I.moveDialog('out')); on('#inv-tr', () => I.moveDialog('transfer'));
    on('#inv-po', () => { MC.purchasing.newFromSuggestions(S.rows.filter(r => r.needs), bid()); });
  };

  /* one dialog for the four kinds of movement */
  I.moveDialog = function (kind, itemId) {
    const S = I.st, rows = S.rows, others = MC.rbac.st.branches.filter(b => b.id !== bid());
    const title = { in: '＋ Receive stock', out: '− Use / give out', adj: '⚖ Count / adjust stock', transfer: '↔ Transfer to another outlet' }[kind];
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + title + '</div><div style="display:grid;gap:10px">' +
      '<div>' + MC.lbl('Item') + '<select id="mv-item" class="fi">' + rows.map(r => '<option value="' + esc(r.item.id) + '"' + (r.item.id === itemId ? ' selected' : '') + '>' + esc(r.item.name) + '</option>').join('') + '</select><div id="mv-have" class="ch-muted" style="font-size:12px;margin-top:3px"></div></div>' +
      (kind === 'adj' ? '<div>' + MC.lbl('Counted quantity (what is really on the shelf)') + '<input id="mv-qty" class="fi" type="number" min="0" step="any"/></div>' : '<div>' + MC.lbl('Quantity') + '<input id="mv-qty" class="fi" type="number" min="0" step="any"/></div>') +
      (kind === 'in' ? '<div>' + MC.lbl('Unit cost (AED) — optional') + '<input id="mv-cost" class="fi" type="number" min="0" step="any"/></div>' : '') +
      (kind === 'out' || kind === 'adj' ? '<div>' + MC.lbl('Reason') + '<select id="mv-reason" class="fi">' + (kind === 'out' ? I.REASONS_OUT : I.REASONS_ADJ).map(x => '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></div>' : '') +
      (kind === 'transfer' ? '<div>' + MC.lbl('To outlet') + '<select id="mv-to" class="fi">' + others.map(b => '<option value="' + esc(b.id) + '">' + esc(b.code + ' · ' + b.name) + '</option>').join('') + '</select></div>' : '') +
      '<div>' + MC.lbl(kind === 'in' ? 'Supplier note / delivery ref (optional)' : 'Note (optional)') + '<input id="mv-note" class="fi" type="text"/></div></div>' +
      '<div id="mv-msg" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="mv-x">Cancel</button><button class="btn btn-y" id="mv-save" style="flex:1">Save</button></div>', { width: 420, sticky: true });
    const $ = id => ov.querySelector('#' + id), row = () => rows.find(r => r.item.id === $('mv-item').value);
    const paint = () => { const r = row(); $('mv-have').textContent = r ? 'On hand now: ' + fmt(r.onHand) + ' ' + r.item.unit : ''; if (kind === 'in' && r && !$('mv-cost').value) $('mv-cost').placeholder = r.item.last_cost || ''; };
    $('mv-item').onchange = paint; paint(); $('mv-x').onclick = () => ov.close(); setTimeout(() => $('mv-qty').focus(), 40);
    $('mv-save').onclick = async () => {
      const msg = $('mv-msg'), fail = t => { msg.textContent = t; msg.style.display = 'block'; }, r = row(), q = parseFloat($('mv-qty').value);
      if (!r) return fail('Pick an item.'); if (isNaN(q) || q < 0 || (kind !== 'adj' && q <= 0)) return fail(kind === 'adj' ? 'Enter the counted quantity.' : 'Enter a quantity above zero.');
      const base = { branch_id: bid(), item_id: r.item.id, moved_on: MC.today(), note: $('mv-note').value.trim() || null };
      $('mv-save').disabled = true;
      try {
        if (kind === 'in') await I.post(Object.assign({ move_type: 'receipt', qty_delta: q, unit_cost: $('mv-cost').value === '' ? null : Number($('mv-cost').value) }, base));
        else if (kind === 'out') { if (q > r.onHand + 1e-9) throw new Error('Only ' + fmt(r.onHand) + ' ' + r.item.unit + ' on hand.'); await I.post(Object.assign({ move_type: 'issue', qty_delta: -q, reason: $('mv-reason').value }, base)); }
        else if (kind === 'adj') { const d = q3(q - r.onHand); if (d === 0) throw new Error('The count matches the system — nothing to adjust.'); await I.post(Object.assign({ move_type: r.hasMoves ? 'adjust' : 'opening', qty_delta: d, reason: $('mv-reason').value }, base)); }
        else { if (q > r.onHand + 1e-9) throw new Error('Only ' + fmt(r.onHand) + ' ' + r.item.unit + ' on hand.'); const to = $('mv-to').value; if (!to) throw new Error('Pick the receiving outlet.'); const tid = I.uuid();
          await I.post(Object.assign({ move_type: 'transfer_out', qty_delta: -q, transfer_id: tid, reason: 'transfer' }, base)); await I.post(Object.assign({}, base, { branch_id: to, move_type: 'transfer_in', qty_delta: q, transfer_id: tid, reason: 'transfer' })); }
        ov.close(); note('Saved'); I.init(); MC.rbac.badges(true);
      } catch (e) { $('mv-save').disabled = false; fail(e.message.replace(/^\{.*"message":"([^"]+)".*$/, '$1')); }
    };
  };
  /* return=minimal: the receiving outlet's row may not be readable by the person who posts it */
  I.post = row => MC.sb('stock_movements', 'POST', row, null, 'return=minimal');

  I.renderMoves = async function () {
    const body = document.getElementById('inv-body');
    const rows = await MC.sb('stock_movements', 'GET', null, 'branch_id=eq.' + bid() + '&order=created_at.desc&limit=300'), nm = {}; I.st.data.items.forEach(i => { nm[i.id] = i; });
    const label = { opening: 'Opening stock', receipt: 'Received', issue: 'Used / given', adjust: 'Adjustment', transfer_in: 'Transfer in', transfer_out: 'Transfer out' }, cls = { opening: 'info', receipt: 'ok', issue: '', adjust: 'warn', transfer_in: 'info', transfer_out: 'info' };
    I.st.moves = rows;
    body.innerHTML = '<div class="ch-bar"><span class="ch-muted" style="font-size:12.5px">Latest 300 movements. The ledger can only be added to — mistakes are fixed with an adjustment.</span><span style="flex:1"></span><button class="btn btn-ghost btn-sm" id="mv-csv">⬇ CSV</button></div>' +
      '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th class="ch-r">Quantity</th><th>Reason / note</th><th>By</th></tr></thead><tbody>' +
      (rows.map(m => { const it = nm[m.item_id] || {}; return '<tr><td>' + MC.fmtDate(m.moved_on) + '</td><td>' + esc(it.name || '?') + '</td><td><span class="ch-chip ' + (cls[m.move_type] || '') + '">' + (label[m.move_type] || m.move_type) + '</span></td><td class="ch-r"><b style="color:' + (num(m.qty_delta) < 0 ? '#B91C1C' : '#15803D') + '">' + (num(m.qty_delta) > 0 ? '+' : '') + fmt(m.qty_delta) + '</b> ' + esc(it.unit || '') + '</td><td>' + esc([m.reason, m.note].filter(Boolean).join(' — ')) + '</td><td class="ch-muted">' + esc(m.created_by || '') + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="ch-muted" style="text-align:center;padding:22px">No movements yet.</td></tr>') + '</tbody></table></div>';
    body.querySelector('#mv-csv').onclick = () => MC.download('stock-movements-' + (MC.rbac.branch().code) + '-' + MC.today() + '.csv', MC.csv(['Date', 'Item', 'Type', 'Quantity', 'Unit', 'Reason', 'Note', 'By'], rows.map(m => { const it = nm[m.item_id] || {}; return [m.moved_on, it.name, m.move_type, m.qty_delta, it.unit, m.reason, m.note, m.created_by]; })));
  };

  /* catalogue + reorder levels for this outlet */
  I.renderItems = function () {
    const body = document.getElementById('inv-body'), rows = I.st.rows;
    MC.sb('suppliers', 'GET', null, 'order=name').then(s => { I.st.sups = s; });
    body.innerHTML = '<div class="ch-bar"><button class="btn btn-y btn-sm" id="it-add">＋ Add item</button>' + (rows.length ? '' : '<button class="btn btn-ghost btn-sm" id="it-starter">Load starter list (15 typical salon items)</button>') + '<span style="flex:1"></span><span class="ch-muted" style="font-size:12.5px">Reorder levels below are for <b>' + esc(MC.rbac.branch().code) + '</b>.</span></div>' +
      '<div class="ch-card" style="padding:0;overflow:auto"><table class="ch-tbl"><thead><tr><th>Item</th><th>Unit / pack</th><th class="ch-r">Last cost</th><th class="ch-r">Reorder at</th><th class="ch-r">Order qty</th><th class="ch-r">Max</th><th class="ch-r">Lead (days)</th><th class="ch-r">Suggested reorder at</th><th></th></tr></thead><tbody>' +
      (rows.map(r => '<tr><td><b>' + esc(r.item.name) + '</b><div class="ch-muted" style="font-size:11.5px">' + esc(r.item.category || '') + '</div></td><td>' + esc(r.item.unit) + ' · ×' + fmt(r.item.pack_size) + '</td><td class="ch-r">' + (num(r.item.last_cost) ? r2(r.item.last_cost).toFixed(2) : '—') + '</td><td class="ch-r">' + (num(r.set.reorder_point) ? fmt(r.set.reorder_point) : '—') + '</td><td class="ch-r">' + (num(r.set.reorder_qty) ? fmt(r.set.reorder_qty) : '—') + '</td><td class="ch-r">' + (num(r.set.max_level) ? fmt(r.set.max_level) : '—') + '</td><td class="ch-r">' + (r.set.lead_time_days != null ? r.set.lead_time_days : '—') + '</td>' +
        '<td class="ch-r">' + (r.suggestedRp != null ? '<span class="ch-chip info" title="Average daily use × (lead time + ' + I.SAFETY_DAYS + ' safety days)">' + r.suggestedRp + '</span>' : '<span class="ch-muted">needs usage data</span>') + '</td><td class="ch-r"><button class="btn btn-ghost btn-sm" data-e="' + esc(r.item.id) + '">Edit</button></td></tr>').join('') || '<tr><td colspan="9" class="ch-muted" style="text-align:center;padding:22px">No items yet.</td></tr>') + '</tbody></table></div>' +
      '<div class="ch-note"><b>How reordering works:</b> an item needs reordering when <i>on hand + already on order</i> falls to its <b>reorder at</b> level. The suggested quantity brings it back to the <b>max</b> level (or reorder-at + order qty), rounded up to whole packs. The blue “suggested reorder at” number is learned from the last 30 days of use.</div>';
    body.querySelector('#it-add').onclick = () => I.editItem(null); body.querySelectorAll('[data-e]').forEach(b => b.onclick = () => I.editItem(rows.find(r => r.item.id === b.dataset.e)));
    const st = body.querySelector('#it-starter'); if (st) st.onclick = async () => { st.disabled = true; try { await MC.sb('inventory_items', 'POST', I.STARTER.map(x => ({ name: x[0], category: x[1], unit: x[2], pack_size: x[3], last_cost: x[4] })), null, 'return=minimal'); I.init(); } catch (e) { st.disabled = false; note(e.message, 'err'); } };
  };
  I.editItem = async function (r) {
    const isNew = !r, it = r ? r.item : { name: '', category: 'Hair care', unit: 'pcs', pack_size: 1, last_cost: 0, supplier_id: null, sku: '' }, s = r ? r.set : {};
    let sups = I.st.sups; if (!sups) { try { sups = I.st.sups = await MC.sb('suppliers', 'GET', null, 'order=name'); } catch (e) { sups = []; } }
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:10px">' + (isNew ? 'Add item' : 'Edit item') + '</div><div style="display:grid;gap:10px">' +
      '<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px"><div>' + MC.lbl('Name') + '<input id="ei-name" class="fi" value="' + esc(it.name) + '"/></div><div>' + MC.lbl('Code (optional)') + '<input id="ei-sku" class="fi" value="' + esc(it.sku || '') + '"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px"><div>' + MC.lbl('Category') + '<input id="ei-cat" class="fi" list="ei-cats" value="' + esc(it.category || '') + '"/><datalist id="ei-cats">' + I.CATEGORIES.map(c => '<option>' + c + '</option>').join('') + '</datalist></div><div>' + MC.lbl('Unit') + '<input id="ei-unit" class="fi" value="' + esc(it.unit) + '" placeholder="bottle"/></div><div>' + MC.lbl('Pack size') + '<input id="ei-pack" class="fi" type="number" min="1" step="any" value="' + esc(it.pack_size) + '"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div>' + MC.lbl('Last cost (AED / unit)') + '<input id="ei-cost" class="fi" type="number" min="0" step="any" value="' + esc(it.last_cost || '') + '"/></div><div>' + MC.lbl('Usual supplier') + '<select id="ei-sup" class="fi"><option value="">—</option>' + sups.map(x => '<option value="' + esc(x.id) + '"' + (x.id === it.supplier_id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></div></div>' +
      '<div class="ch-card" style="margin:0;background:#F8FAFC"><div class="ch-kl" style="margin:0 0 6px">Reorder levels for ' + esc(MC.rbac.branch().code) + '</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px"><div>' + MC.lbl('Reorder at') + '<input id="ei-rp" class="fi" type="number" min="0" step="any" value="' + esc(s.reorder_point != null ? s.reorder_point : '') + '"/></div><div>' + MC.lbl('Order qty') + '<input id="ei-rq" class="fi" type="number" min="0" step="any" value="' + esc(s.reorder_qty != null ? s.reorder_qty : '') + '"/></div><div>' + MC.lbl('Max level') + '<input id="ei-max" class="fi" type="number" min="0" step="any" value="' + esc(s.max_level != null ? s.max_level : '') + '"/></div><div>' + MC.lbl('Lead days') + '<input id="ei-lead" class="fi" type="number" min="0" step="1" value="' + esc(s.lead_time_days != null ? s.lead_time_days : '') + '"/></div></div>' +
      (r && r.suggestedRp != null ? '<div class="ch-muted" style="font-size:12px;margin-top:6px">Based on the last 30 days of use, a safe “reorder at” would be about <b>' + r.suggestedRp + '</b>.</div>' : '') + '</div>' +
      (isNew ? '' : '<label style="display:flex;gap:6px;font-size:13px"><input type="checkbox" id="ei-act" checked/> Active (untick to hide this item)</label>') + '</div><div id="ei-msg" class="ch-err" style="display:none"></div><div style="display:flex;gap:8px;margin-top:14px"><button class="btn btn-ghost" id="ei-x">Cancel</button><button class="btn btn-y" id="ei-save" style="flex:1">Save</button></div>', { width: 520, sticky: true });
    const $ = id => ov.querySelector('#' + id); $('ei-x').onclick = () => ov.close();
    $('ei-save').onclick = async () => {
      const fail = t => { $('ei-msg').textContent = t; $('ei-msg').style.display = 'block'; }, name = $('ei-name').value.trim(); if (!name) return fail('Enter the item name.');
      const pack = Number($('ei-pack').value) || 1; if (pack <= 0) return fail('Pack size must be above zero.');
      const row = { name, sku: $('ei-sku').value.trim() || null, category: $('ei-cat').value.trim() || null, unit: $('ei-unit').value.trim() || 'pcs', pack_size: pack, last_cost: Number($('ei-cost').value) || 0, supplier_id: $('ei-sup').value || null };
      if (!isNew) row.active = $('ei-act').checked;
      $('ei-save').disabled = true;
      try {
        let id = it.id; if (isNew) { const a = await MC.sb('inventory_items', 'POST', row); id = (Array.isArray(a) ? a[0] : a).id; } else await MC.sb('inventory_items', 'PATCH', row, 'id=eq.' + id, 'return=minimal');
        const nv = v => v === '' ? null : Number(v), set = { reorder_point: nv($('ei-rp').value) || 0, reorder_qty: nv($('ei-rq').value) || 0, max_level: nv($('ei-max').value), lead_time_days: nv($('ei-lead').value) };
        const has = await MC.sb('item_branch_settings', 'GET', null, 'item_id=eq.' + id + '&branch_id=eq.' + bid() + '&limit=1');
        if (has.length) await MC.sb('item_branch_settings', 'PATCH', set, 'item_id=eq.' + id + '&branch_id=eq.' + bid(), 'return=minimal'); else await MC.sb('item_branch_settings', 'POST', Object.assign({ item_id: id, branch_id: bid() }, set), null, 'return=minimal');
        ov.close(); I.init(); MC.rbac.badges(true);
      } catch (e) { $('ei-save').disabled = false; fail(e.message); }
    };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = I;
})(typeof window !== 'undefined' ? window : globalThis);
