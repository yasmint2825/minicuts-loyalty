// Run: node tests/chain.test.js — pure rules of SalonChain (RBAC, reorder maths, PO totals/actions) + JS roles match the SQL seed
const fs = require('fs'), path = require('path'), vm = require('vm'), R0 = path.resolve(__dirname, '..');
global.MC = { today: () => '2026-10-15', addDays: (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); } };
for (const f of ['mc-rbac.js', 'mc-inventory.js', 'mc-purchasing.js']) vm.runInThisContext(fs.readFileSync(path.join(R0, f), 'utf8'), { filename: f });
const R = MC.rbac, I = MC.inventory, P = MC.purchasing; let n = 0, bad = 0;
const t = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } else console.log('PASS ' + m); };
const ctx = (role, o) => Object.assign({ active: true, perms: R.PRESETS[role].perms, all: R.PRESETS[role].all, branches: [], limit: R.PRESETS[role].limit }, o || {});
t(R.has(ctx('owner'), 'users.manage') && R.has(ctx('owner'), 'anything.at.all', 'x'), 'owner has every permission');
t(!R.has(ctx('stylist'), 'po.create') && R.has(ctx('stylist'), 'inventory.issue'), 'stylist: usage yes, ordering no');
t(R.has(ctx('branch_manager', { branches: ['a'] }), 'po.create', 'a') && !R.has(ctx('branch_manager', { branches: ['a'] }), 'po.create', 'b'), 'branch manager limited to own outlet');
t(!R.has(Object.assign(ctx('owner'), { active: false }), 'po.view'), 'inactive user has nothing');
const po = (o) => Object.assign({ status: 'submitted', branch_id: 'a', total: 400, created_by: 'x@y' }, o);
const bm = ctx('branch_manager', { branches: ['a'] });
t(R.canApprove(bm, po(), 'm@y').ok, 'manager approves 400 (limit 500)');
t(!R.canApprove(bm, po({ total: 900 }), 'm@y').ok, 'manager cannot approve 900');
t(!R.canApprove(bm, po({ created_by: 'm@y' }), 'm@y').ok, 'nobody approves their own order');
t(!R.canApprove(bm, po({ branch_id: 'b' }), 'm@y').ok, 'no approval at another outlet');
t(R.canApprove(ctx('controller'), po({ total: 99999 }), 'c@y').ok, 'controller unlimited');
t(!R.canApprove(bm, po({ status: 'draft' }), 'm@y').ok, 'only submitted orders can be approved');
// reorder maths
let s = I.suggest({ onHand: 4, onOrder: 0, reorderPoint: 8, reorderQty: 12, packSize: 6 });
t(s.needs && s.qty === 18 && s.status === 'low', 'low stock → order up to rp+qty (20) rounded to packs → 18');
s = I.suggest({ onHand: 4, onOrder: 60, reorderPoint: 8, reorderQty: 12, packSize: 6 }); t(!s.needs, 'stock already on order is not ordered twice');
s = I.suggest({ onHand: 0, onOrder: 0, reorderPoint: 8, reorderQty: 5, maxLevel: 40, packSize: 6 }); t(s.qty === 42 && s.status === 'out', 'order up to max level rounded up to packs (40→42)');
s = I.suggest({ onHand: 10, reorderPoint: 8, reorderQty: 5 }); t(!s.needs && s.qty === 0 && s.status === 'ok', 'healthy stock needs nothing');
s = I.suggest({ onHand: 30, reorderPoint: 8, reorderQty: 5, avgDaily: 3, leadDays: 3 }); t(s.daysCover === 10 && s.suggestedRp === 15, 'days of cover 10, suggested reorder point 3/day × (3+2) = 15');
t(I.status(0, 0) === 'out' && I.status(5, 0) === 'ok', 'no reorder point set → never "low"');
const rows = I.rows({ items: [{ id: 'i', pack_size: 1 }], sets: { i: { reorder_point: 5, reorder_qty: 10 } }, moves: [{ item_id: 'i', move_type: 'opening', qty_delta: 20, moved_on: '2026-09-01' }, { item_id: 'i', move_type: 'issue', qty_delta: -30 * 0.5, moved_on: '2026-10-10' }], lines: [] }, '2026-10-15');
t(rows[0].onHand === 5 && rows[0].needs && Math.abs(rows[0].avgDaily - 0.5) < 1e-9, 'ledger sums to on-hand; 30-day average use from issues');
// purchase orders
t(JSON.stringify(P.totals([{ qty: 3, unit_cost: 10.1 }, { qty: 1, unit_cost: 0.5 }], 5)) === JSON.stringify({ subtotal: 30.8, tax: 1.54, total: 32.34 }), 'PO totals with 5% VAT');
t(P.received([{ po_line_id: 'l', qty_delta: 4 }, { po_line_id: 'l', qty_delta: 2 }, { qty_delta: 9 }]).l === 6, 'received per line from ledger');
const keys = (c, p, hr) => P.actions(c, p, 'z@y', hr).filter(a => a.ok).map(a => a.k).join(',');
t(keys(ctx('store_keeper', { branches: ['a'] }), po({ status: 'ordered' })) === 'receive', 'store keeper can only receive ordered goods');
t(keys(bm, po({ status: 'draft' })) === 'edit,submit,cancel', 'manager drafts: edit, submit, cancel');
t(keys(ctx('stylist', { branches: ['a'] }), po({ status: 'draft' })) === '', 'stylist gets no PO actions');
t(keys(ctx('controller'), po({ status: 'partial' })) === 'receive,close', 'partial order: receive or close short');
t(keys(ctx('controller'), po({ status: 'ordered' }), true) === 'receive', 'cannot cancel once goods received');
t(P.groupBySupplier([{ item: { supplier_id: 's1' } }, { item: { supplier_id: 's2' } }, { item: { supplier_id: 's1' } }]).length === 2, 'low-stock rows grouped by supplier');
// JS role presets == SQL seed
const sql = fs.readFileSync(path.join(R0, 'sql/002_salonchain_core.sql'), 'utf8');
Object.keys(R.PRESETS).forEach(k => { const m = new RegExp("\\('" + k + "'[\\s\\S]*?array\\[([^\\]]*)\\]", 'm').exec(sql); t(!!m, 'SQL seeds role ' + k);
  if (m) { const sp = m[1].replace(/'/g, '').split(',').map(x => x.trim()).sort().join(','), jp = R.PRESETS[k].perms.slice().sort().join(','); t(sp === jp, 'permissions for ' + k + ' identical in app and database'); } });
console.log(n - bad + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
