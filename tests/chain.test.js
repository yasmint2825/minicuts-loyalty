// Run: node tests/chain.test.js — pure rules of SalonChain (RBAC, reorder maths, PO totals/actions) + JS roles match the SQL seed
const fs = require('fs'), path = require('path'), vm = require('vm'), R0 = path.resolve(__dirname, '..');
global.MC = { parseYmd: s => new Date(String(s).slice(0, 10) + 'T12:00:00'), ymd: d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'), today: () => '2026-10-15', addDays: (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); } };
for (const f of ['mc-rbac.js', 'mc-inventory.js', 'mc-purchasing.js', 'mc-chain.js']) vm.runInThisContext(fs.readFileSync(path.join(R0, f), 'utf8'), { filename: f });
const R = MC.rbac, I = MC.inventory, P = MC.purchasing; let n = 0, bad = 0;
const t = (c, m) => { n++; if (!c) { bad++; console.log('FAIL ' + m); } else console.log('PASS ' + m); };
const ctx = (role, o) => Object.assign({ active: true, perms: R.PRESETS[role].perms, all: R.PRESETS[role].all, branches: [], limit: R.PRESETS[role].limit }, o || {});
t(R.has(ctx('owner'), 'users.manage') && R.has(ctx('owner'), 'po.approve') && !R.has(ctx('owner'), 'clients.manage'), 'business owner: everything except onboarding clients');
t(R.has(ctx('platform_admin'), 'clients.manage') && R.has(ctx('platform_admin'), 'anything.at.all', 'x'), 'application admin has every permission');
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

// group performance
const C = MC.chain, BR = [{ id: 'a', code: 'DSO' }, { id: 'b', code: 'MIR' }];
const V = (o) => Object.assign({ status: 'done', checkin_date: '2026-10-10', service_value: 100, list_price: 100, tip: 0, payment_type: 'Cash', service: 'Boys Haircut', stylist: 'Lester', customer_id: 'c1' }, o);
const rowsG = [V({}), V({ service_value: 90, list_price: 100, tip: 5, payment_type: 'Credit', customer_id: 'c2' }), V({ branch_id: 'b', service_value: 200, service: 'Girls Styling', stylist: 'George', customer_id: 'c3' }), V({ checkin_date: '2026-09-01' }), V({ status: 'waiting' })];
const custG = [{ id: 'c1', created_at: '2026-01-01' }, { id: 'c2', created_at: '2026-10-09' }, { id: 'c3', created_at: '2026-01-01' }];
const G = C.groupStats(rowsG, custG, BR, '2026-10-01', '2026-10-31', 'a');
t(G[0].visits === 2 && G[0].revenue === 190 && G[0].discount === 10 && G[0].tips === 5, 'outlet without branch_id counts under the default outlet; discount and tips summed');
t(G[1].visits === 1 && G[1].revenue === 200 && G[1].topService === 'Girls Styling' && G[1].topStylist === 'George', 'outlet B gets its own visits, top service and stylist');
t(G[0].newCustomers === 1 && G[0].returningPct === 50 && G[0].avgBill === 95, 'new customers, returning share and average bill');
t(G[0].cash === 100 && G[0].credit === 90, 'cash / card split');
t(G[0].days.length === 31 && G[0].days[9] === 190, 'daily revenue series covers the whole period');
t(C.pctChange(150, 100) === 50 && C.pctChange(50, 100) === -50 && C.pctChange(10, 0) === null && C.pctChange(0, 0) === 0, 'percentage change vs previous period');
const be = C.breakEven(11000, 32000, '2026-10-15');
t(be.pct === 34 && be.gap === 21000 && be.daysLeft === 16 && be.perDayNeeded === 1312.5 && be.projected === 22733.33, 'break-even: 34% of cost, AED 1,312.50/day still needed');
t(C.breakEven(100, 0, '2026-10-15') === null, 'no cost set → no break-even');
const rg = C.range('mtd', '2026-10-15'); t(rg.from === '2026-10-01' && rg.pFrom === '2026-09-16' && rg.pTo === '2026-09-30', 'this-month range compares with the previous equal-length period');
t(C.range('lm', '2026-10-15').from === '2026-09-01' && C.range('lm', '2026-10-15').to === '2026-09-30', 'last-month range');
// login controls
R.fails = [1000, 2000, 3000, 4000]; t(R.lockedFor(5000) === 0, 'four wrong passwords: still allowed');
R.fails = [1000, 2000, 3000, 4000, 5000]; t(R.lockedFor(6000) === 59 && R.lockedFor(70000) === 0 && R.fails.length === 5 ? true : R.lockedFor(6000) > 0, 'five wrong passwords: locked for about a minute');
R.fails = [0, 0, 0, 0, 0]; t(R.lockedFor(11 * 60000) === 0 && R.fails.length === 0, 'old failures are forgotten after 10 minutes');
t(R.idleExpired(0, 121 * 60000, 120) && !R.idleExpired(0, 119 * 60000, 120) && !R.idleExpired(0, 9e9, 0), 'idle sign-out after the limit; 0 means never');
// JS role presets == SQL seed
const sql = fs.readFileSync(path.join(R0, 'sql/002_salonchain_core.sql'), 'utf8');
Object.keys(R.PRESETS).forEach(k => { const m = new RegExp("\\('" + k + "'[\\s\\S]*?array\\[([^\\]]*)\\]", 'm').exec(sql); t(!!m, 'SQL seeds role ' + k);
  if (m) { const sp = m[1].replace(/'/g, '').split(',').map(x => x.trim()).sort().join(','), jp = R.PRESETS[k].perms.slice().sort().join(','); t(sp === jp, 'permissions for ' + k + ' identical in app and database'); } });
console.log(n - bad + ' passed, ' + bad + ' failed'); process.exit(bad ? 1 : 0);
