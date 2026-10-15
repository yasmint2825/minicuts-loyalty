// Rehearses sql/002_salonchain_core.sql on a throw-away Postgres (PGlite, runs in WASM) — never touches Supabase.
// Run: PGLITE=<path to node_modules/@electric-sql/pglite/dist/index.js> node tests/sql_salonchain.test.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.PGLITE);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite(); let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
// minimal Supabase look-alike: auth.jwt(), anon / authenticated roles, and the table grants Supabase gives by default
await db.exec(`create schema auth;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public, auth to anon, authenticated; grant execute on function auth.jwt() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;`);
await db.exec(fs.readFileSync(path.join(root, 'sql/002_salonchain_core.sql'), 'utf8'));
await db.exec(fs.readFileSync(path.join(root, 'sql/002_salonchain_core.sql'), 'utf8'));   // idempotent re-run
ok(true, 'migration applies cleanly and can be re-run');
const asUser = async (email, sql, params) => {            // run as a signed-in user; returns {rows} or {err}
  await db.exec(`reset role; select set_config('request.jwt.claims', '${email ? JSON.stringify({ email }) : ''}', false); set role ${email ? 'authenticated' : 'anon'};`);
  try { const r = await db.query(sql, params); return { rows: r.rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role;'); }
};
const su = async (sql, p) => (await db.query(sql, p)).rows;

// seed (as the owner of the database, like a migration would)
const [dso] = await su(`select id from branches where code='DSO'`);
const [mir] = await su(`insert into branches(code,name) values ('MIR','MiNiCUTS — Mirdif') returning id`);
const mem = (email, role, all, brs, lim) => su(`insert into memberships(email,display_name,role_key,all_branches,branch_ids,po_approval_limit) values ($1,$1,$2,$3,$4::uuid[],$5)`, [email, role, all, brs, lim]);
await mem('owner@x', 'owner', true, [], null); await mem('ctrl@x', 'controller', true, [], null); await mem('mgr.dso@x', 'branch_manager', false, [dso.id], null);
await mem('mgr.mir@x', 'branch_manager', false, [mir.id], null); await mem('store.dso@x', 'store_keeper', false, [dso.id], null); await mem('sty.dso@x', 'stylist', false, [dso.id], null);
await mem('aud@x', 'auditor', true, [], null); await mem('mgr2.dso@x', 'branch_manager', false, [dso.id], null);
const [sup] = await su(`insert into suppliers(name,whatsapp) values ('Gulf Salon Supplies','971500000000') returning id`);
const [shamp] = await su(`insert into inventory_items(name,unit,pack_size,last_cost,supplier_id) values ('Kids shampoo 1L','bottle',6,20,$1) returning id`, [sup.id]);
const [lolly] = await su(`insert into inventory_items(name,unit,pack_size,last_cost) values ('Lollipop','pcs',100,0.5) returning id`);

// ── who can see what ──
let r = await asUser('mgr.dso@x', `select code from branches order by code`); ok(r.rows.length === 1 && r.rows[0].code === 'DSO', 'branch manager sees only their own outlet');
r = await asUser('ctrl@x', `select code from branches order by code`); ok(r.rows.length === 2, 'controller sees every outlet');
r = await asUser(null, `select * from stock_movements`); ok(!!r.err, 'anonymous key cannot read stock (permission denied)');
r = await asUser('stranger@x', `select code from branches`); ok(r.rows && r.rows.length === 0, 'a signed-in stranger with no membership sees nothing');
r = await asUser('mgr.dso@x', `select email from memberships`); ok(r.rows.length === 1 && r.rows[0].email === 'mgr.dso@x', 'a manager can only see their own membership row');
r = await asUser('owner@x', `select email from memberships`); ok(r.rows.length === 8, 'owner sees all memberships');
r = await asUser('mgr.dso@x', `insert into memberships(email,role_key,all_branches) values ('evil@x','owner',true)`); ok(!!r.err, 'a manager cannot create an owner login');
r = await asUser('owner@x', `insert into memberships(email,role_key,branch_ids) values ('new.sty@x','stylist',array['${dso.id}']::uuid[])`); ok(!r.err, 'owner can add a user');
ok((await su(`select count(*)::int n from audit_log where action='user.insert' and actor='owner@x'`))[0].n === 1, 'adding a user is audited with the actor');

// ── stock ──
const mv = (email, branch, item, type, q, extra) => asUser(email, `insert into stock_movements(branch_id,item_id,move_type,qty_delta,reason,po_line_id,receipt_id,transfer_id,unit_cost) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [branch, item, type, q, (extra || {}).reason || null, (extra || {}).po_line || null, (extra || {}).receipt || null, (extra || {}).transfer || null, (extra || {}).cost || null]);
r = await mv('store.dso@x', dso.id, shamp.id, 'receipt', 12); ok(!r.err, 'store keeper can receive stock at their outlet');
r = await mv('store.dso@x', mir.id, shamp.id, 'receipt', 12); ok(!!r.err, 'store keeper cannot touch another outlet');
r = await asUser('store.dso@x', `select on_hand from v_stock_on_hand where branch_id='${dso.id}'`); ok(r.rows.length === 1 && Number(r.rows[0].on_hand) === 12, 'on-hand view = 12');
r = await asUser('mgr.mir@x', `select on_hand from v_stock_on_hand`); ok(r.rows.length === 0, 'other outlet manager cannot see DSO stock through the view');
r = await mv('sty.dso@x', dso.id, shamp.id, 'issue', -2, { reason: 'used_in_service' }); ok(!r.err, 'stylist can record stock used');
r = await mv('sty.dso@x', dso.id, shamp.id, 'issue', -50); ok(/Insufficient stock/.test(r.err || ''), 'cannot issue more than on hand (server-side, no negative stock)');
r = await mv('sty.dso@x', dso.id, shamp.id, 'adjust', -1); ok(!!r.err, 'stylist cannot adjust stock');
r = await mv('mgr.dso@x', dso.id, shamp.id, 'adjust', -1, { reason: 'count' }); ok(!r.err, 'manager can adjust stock');
ok((await su(`select count(*)::int n from audit_log where action='stock.adjust' and actor='mgr.dso@x'`))[0].n === 1, 'stock adjustment is audited');
r = await mv('mgr.dso@x', dso.id, shamp.id, 'receipt', -3); ok(!!r.err, 'a receipt cannot be negative');
r = await asUser('owner@x', `update stock_movements set qty_delta = 99`); ok(!!r.err, 'the ledger cannot be edited through the API, even by the owner');
r = await asUser('owner@x', `delete from stock_movements`); ok(!!r.err, 'the ledger cannot be deleted through the API, even by the owner');
try { await db.exec(`update stock_movements set qty_delta = 99`); ok(false, 'ledger trigger'); } catch (e) { ok(/append-only/.test(e.message), 'even a database administrator is stopped by the append-only trigger'); }
r = await asUser('mgr.dso@x', `select qty_delta,created_by from stock_movements where reason='count'`); ok(r.rows[0] && r.rows[0].created_by === 'mgr.dso@x', 'actor is stamped by the server, not the browser');
// transfer DSO -> MIR (9 on hand: 12-2-1)
const tid = (await su(`select gen_random_uuid() id`))[0].id;
r = await mv('mgr.mir@x', mir.id, shamp.id, 'transfer_in', 3, { transfer: tid }); ok(!!r.err, 'transfer-in without a matching transfer-out is refused');
r = await mv('mgr.dso@x', dso.id, shamp.id, 'transfer_out', -3, { transfer: tid }); ok(!r.err, 'manager can transfer out of their outlet');
r = await mv('mgr.dso@x', mir.id, shamp.id, 'transfer_in', 3, { transfer: tid }); ok(!r.err, 'transfer-in at the other outlet is accepted once the out-leg exists');
r = await asUser('ctrl@x', `select branch_id, sum(qty_delta)::int q from stock_movements where item_id='${shamp.id}' group by 1 order by 2`); ok(r.rows.length === 2 && r.rows[0].q === 3 && r.rows[1].q === 6, 'stock after transfer: DSO 6, MIR 3');

// ── purchase orders ──
const YR = (await su(`select to_char(now(),'YYYY') y`))[0].y;
const po = async (email, branch, extra) => asUser(email, `insert into purchase_orders(branch_id,supplier_id,notes) values ($1,$2,$3) returning id, po_number, status, created_by`, [branch, sup.id, extra || null]);
const line = (email, poId, item, qty, cost) => asUser(email, `insert into purchase_order_lines(po_id,item_id,description,qty_ordered,unit_cost) values ($1,$2,'x',$3,$4) returning id`, [poId, item, qty, cost]);
const setSt = (email, poId, st, extra) => asUser(email, `update purchase_orders set status=$2, rejected_reason=$3, cancelled_reason=$4 where id=$1 returning status`, [poId, st, (extra || {}).rej || null, (extra || {}).can || null]);
r = await po('sty.dso@x', dso.id); ok(!!r.err, 'a stylist cannot create purchase orders');
r = await po('store.dso@x', dso.id); const p1 = r.rows && r.rows[0]; ok(p1 && p1.status === 'draft' && p1.po_number === 'PO/DSO/' + YR + '/0001' && p1.created_by === 'store.dso@x', 'store keeper drafts a PO — numbered PO/DSO/<year>/0001, creator stamped');
r = await po('store.dso@x', dso.id); ok(r.rows[0].po_number === 'PO/DSO/' + YR + '/0002', 'next PO number is 0002');
await line('store.dso@x', p1.id, shamp.id, 12, 20);   // 240 + 5% = 252
r = await setSt('store.dso@x', p1.id, 'submitted'); ok(!r.err && r.rows[0].status === 'submitted', 'store keeper submits for approval');
r = await asUser('store.dso@x', `select subtotal,tax_amount,total from purchase_orders where id=$1`, [p1.id]); ok(Number(r.rows[0].total) === 252 && Number(r.rows[0].tax_amount) === 12, 'totals are computed by the server (240 + 5% = 252)');
r = await line('store.dso@x', p1.id, shamp.id, 1, 1); ok(/draft/.test(r.err || ''), 'lines are locked once submitted');
r = await setSt('store.dso@x', p1.id, 'approved'); ok(/not allowed to approve/i.test(r.err || ''), 'store keeper cannot approve');
r = await setSt('mgr.mir@x', p1.id, 'approved'); ok(r.err || (r.rows && r.rows.length === 0), 'manager of another outlet cannot approve (cannot even see it)');
r = await setSt('mgr.dso@x', p1.id, 'rejected'); ok(/reason/i.test(r.err || ''), 'rejecting needs a reason');
r = await setSt('mgr.dso@x', p1.id, 'approved'); ok(!r.err && r.rows[0].status === 'approved', 'branch manager approves a PO within their AED 500 limit');
ok((await su(`select approved_by from purchase_orders where id=$1`, [p1.id]))[0].approved_by === 'mgr.dso@x', 'approver recorded');
// big PO above the manager's limit, and self-approval
r = await po('mgr.dso@x', dso.id); const p2 = r.rows[0]; await line('mgr.dso@x', p2.id, shamp.id, 30, 20);   // 600 + 5% = 630
await setSt('mgr.dso@x', p2.id, 'submitted');
r = await setSt('mgr.dso@x', p2.id, 'approved'); ok(/own|created/i.test(r.err || ''), 'a manager cannot approve the PO they created');
r = await setSt('mgr2.dso@x', p2.id, 'approved'); ok(/above your approval limit/.test(r.err || ''), 'AED 630 is above a branch manager\'s AED 500 limit');
r = await setSt('ctrl@x', p2.id, 'approved'); ok(!r.err && r.rows[0].status === 'approved', 'controller (unlimited) approves the large PO');
r = await setSt('owner@x', p2.id, 'ordered'); ok(!r.err, 'approved PO can be marked ordered');
// receiving p1
r = await setSt('mgr.dso@x', p1.id, 'ordered'); ok(!r.err, 'creator-side user places the order');
const l1 = (await su(`select id from purchase_order_lines where po_id=$1`, [p1.id]))[0].id;
const rc = async (email, poId, q) => { const a = await asUser(email, `insert into po_receipts(po_id,delivery_ref) values ($1,'DN-1') returning id`, [poId]); if (a.err) return a; return mv(email, dso.id, shamp.id, 'receipt', q, { po_line: l1, receipt: a.rows[0].id, cost: 20 }); };
r = await rc('sty.dso@x', p1.id, 5); ok(!!r.err, 'a stylist cannot receive goods');
r = await rc('store.dso@x', p1.id, 5); ok(!r.err, 'store keeper receives 5 of 12');
ok((await su(`select status from purchase_orders where id=$1`, [p1.id]))[0].status === 'partial', 'PO becomes "partial" automatically');
r = await setSt('mgr.dso@x', p1.id, 'cancelled', { can: 'changed mind' }); ok(/already received/i.test(r.err || ''), 'a PO with receipts cannot be cancelled');
r = await rc('store.dso@x', p1.id, 7); ok(!r.err, 'store keeper receives the remaining 7');
ok((await su(`select status from purchase_orders where id=$1`, [p1.id]))[0].status === 'received', 'PO becomes "received" automatically');
ok((await su(`select coalesce(sum(qty_delta),0)::int q from stock_movements where branch_id=$1 and item_id=$2`, [dso.id, shamp.id]))[0].q === 18, 'received goods increased stock (6 + 12 = 18)');
r = await setSt('mgr.dso@x', p1.id, 'draft'); ok(/cannot become/.test(r.err || ''), 'a received PO cannot be re-opened');
// cancel path
r = await po('store.dso@x', dso.id); const p3 = r.rows[0]; await line('store.dso@x', p3.id, lolly.id, 100, 0.5); await setSt('store.dso@x', p3.id, 'submitted');
r = await setSt('mgr.dso@x', p3.id, 'cancelled'); ok(/reason/i.test(r.err || ''), 'cancelling needs a reason');
r = await setSt('mgr.dso@x', p3.id, 'cancelled', { can: 'not needed' }); ok(!r.err, 'manager cancels with a reason');
r = await asUser('mgr.dso@x', `delete from purchase_orders where id=$1`, [p3.id]); ok(!!r.err || (r.rows && r.rows.length === 0), 'purchase orders cannot be deleted');
// audit
r = await asUser('ctrl@x', `select action from audit_log where entity='purchase_orders' order by id`); ok(r.rows.some(x => x.action === 'po.approved') && r.rows.some(x => x.action === 'po.received') && r.rows.some(x => x.action === 'po.cancelled'), 'controller can read the audit trail (approved / received / cancelled)');
r = await asUser('mgr.dso@x', `select * from audit_log`); ok(!!r.err || r.rows.length === 0, 'a branch manager cannot read the audit trail');
r = await asUser('aud@x', `select count(*)::int n from purchase_orders`); ok(r.rows[0].n >= 3, 'auditor can read purchase orders across outlets');
r = await asUser('aud@x', `insert into suppliers(name) values ('x')`); ok(!!r.err, 'auditor cannot change anything');
r = await asUser('mgr.dso@x', `insert into suppliers(name) values ('x')`); ok(!!r.err, 'branch manager cannot add suppliers (controller/owner only)');
r = await asUser('ctrl@x', `insert into suppliers(name) values ('New supplier')`); ok(!r.err, 'controller can add suppliers');
// seed file for the first three people
await db.exec(fs.readFileSync(path.join(root, 'sql/003_seed_users.sql'), 'utf8')); await db.exec(fs.readFileSync(path.join(root, 'sql/003_seed_users.sql'), 'utf8'));   // idempotent
r = await db.query(`select email, role_key, all_branches, array_length(branch_ids,1) nb from memberships where email in ('munir20684@gmail.com','yasmin1388@gmail.com','mincutsfze@gmail.com') order by email`);
ok(r.rows.length === 3 && r.rows.find(x => x.email === 'munir20684@gmail.com').role_key === 'platform_admin' && r.rows.find(x => x.email === 'yasmin1388@gmail.com').role_key === 'owner' && r.rows.find(x => x.email === 'mincutsfze@gmail.com').nb === 1, 'seed file adds application admin, owner and DSO salon manager (and can be re-run)');
r = await asUser('munir20684@gmail.com', `select rbac_has('clients.manage', null) a, rbac_has('users.manage', null) b`); ok(r.rows[0].a === true && r.rows[0].b === true, 'application admin holds every permission, including onboarding clients');
r = await asUser('yasmin1388@gmail.com', `select rbac_has('clients.manage', null) a, rbac_has('users.manage', null) b, rbac_has('po.approve', null) c`); ok(r.rows[0].a === false && r.rows[0].b === true && r.rows[0].c === true, 'business owner manages users and purchasing but cannot onboard other client businesses');
r = await asUser('mincutsfze@gmail.com', `select rbac_has('po.approve', (select id from branches where code='DSO')) a, rbac_has('users.manage', null) b`); ok(r.rows[0].a === true && r.rows[0].b === false, 'salon manager runs DSO but cannot manage users');
console.log(`\n${pass} passed, ${fail} failed`); process.exitCode = fail ? 1 : 0;
