// Run: node tests/e2e_chain.js — SalonChain in practice mode (?demo=1&chain=1): logins, role-based menus, stock, purchase orders, approvals
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1366, height: 768 } }); const pg = await ctx.newPage();
  const errs = []; let leaked = 0; pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => d.accept());
  await pg.route('**/*', route => { const u = route.request().url();
    if (/supabase\.co/.test(u)) { leaked++; return route.abort(); }
    if (/cdnjs.*jspdf/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.JSPDF) });
    if (u.startsWith('file:')) return route.continue(); return route.fulfill({ status: 200, contentType: 'text/plain', body: '' }); });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const vis = sel => pg.evaluate(s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }, sel);
  const login = async em => {
    if (!(await pg.$('#mc-login'))) await pg.evaluate(() => MC.rbac.signOut());
    await pg.waitForSelector('#lg-demo [data-e="' + em + '"]'); await pg.click('#lg-demo [data-e="' + em + '"]');
    await pg.waitForSelector('#mc-signout'); await pg.waitForTimeout(500);
  };
  const tab = async id => { await pg.evaluate(id => document.querySelector('.tab[data-p="' + id + '"]').click(), id); await pg.waitForTimeout(700); };
  await pg.goto('file://' + ROOT + '/minicuts-staff.html?demo=1&chain=1'); await pg.waitForSelector('#mc-login');
  ok(true, 'sign-in screen appears in chain mode');
  // wrong password
  await pg.fill('#lg-e', 'owner@minicuts.demo'); await pg.fill('#lg-p', 'nope'); await pg.click('#lg-go'); await pg.waitForTimeout(400);
  ok(/Wrong e-mail/.test(await pg.innerText('#lg-err')), 'wrong password is refused');

  // OWNER
  await login('owner@minicuts.demo');
  ok(await vis('.tab[data-p="t-chain"]') && await vis('.tab[data-p="t-users"]') && await vis('.tab[data-p="t-po"]') && await vis('.tab[data-p="t-inventory"]'), 'owner sees controller, users, stock and purchase-order menus');
  ok(await vis('#mc-branch'), 'owner has an outlet switcher');
  await tab('t-chain'); let t = await pg.innerText('#t-chain-root');
  ok(/DSO/.test(t) && /MIR/.test(t) && /PO\/DSO\/\d+\/0001/.test(t), 'controller overview lists both outlets and the order waiting');
  ok(/Waiting for you/.test(t), 'owner is told an order is waiting for them');
  const needs = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).filter(r => r.needs).map(r => r.item.id).sort().join(','));
  ok(needs === 'i2,i4,i5', 'reorder alerts: items at/below reorder point (shampoo already on order is not repeated) → ' + needs);
  await tab('t-users'); t = await pg.innerText('#t-users-root'); ok(/manager\.dso@minicuts\.demo/.test(t) && /Store keeper/.test(t), 'users & access lists the team');

  // STOCK: record use, then a too-large use is refused
  await tab('t-inventory'); await pg.waitForTimeout(400);
  const before = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).find(r => r.item.id === 'i3').onHand);
  await pg.evaluate(() => MC.inventory.post([{ branch_id: 'b-dso', item_id: 'i3', move_type: 'issue', qty_delta: -2, reason: 'used_in_service' }]));
  const after = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).find(r => r.item.id === 'i3').onHand);
  ok(after === before - 2, 'stock used reduces on-hand (' + before + ' → ' + after + ')');
  const neg = await pg.evaluate(async () => { try { await MC.inventory.post([{ branch_id: 'b-dso', item_id: 'i3', move_type: 'issue', qty_delta: -9999 }]); return 'allowed'; } catch (e) { return 'refused'; } });
  ok(neg === 'refused', 'cannot take stock below zero');

  // CREATE POs from low stock
  await pg.evaluate(async () => { const rows = MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).filter(r => r.needs); await MC.purchasing.loadSuppliers(); MC.purchasing.newFromSuggestions(rows, 'b-dso'); });
  await pg.waitForSelector('#ns-go'); ok((await pg.$$('[data-g]')).length === 3, 'low stock grouped into one draft per supplier (3)');
  await pg.click('#ns-go'); await pg.waitForTimeout(900);
  const drafts = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).purchase_orders.filter(p => p.status === 'draft'));
  ok(drafts.length === 3 && drafts.every(p => /^PO\/DSO\/\d+\/\d{4}$/.test(p.po_number) && p.created_by === 'owner@minicuts.demo'), 'three draft POs numbered by the server and stamped with the creator');

  // Approve PO 0001 as owner, place order
  await pg.evaluate(() => MC.purchasing.open('po1')); await pg.waitForSelector('[data-a="approve"]');
  ok(!(await pg.$eval('[data-a="approve"]', e => e.disabled)), 'owner (unlimited) can approve a 1,260 order');
  await pg.click('[data-a="approve"]'); await pg.waitForTimeout(700);
  await pg.evaluate(() => MC.purchasing.open('po1')); await pg.waitForSelector('[data-a="order"]'); await pg.click('[data-a="order"]'); await pg.waitForTimeout(600);
  ok((await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).purchase_orders.find(p => p.id === 'po1').status)) === 'ordered', 'PO approved then marked ordered');

  // STORE KEEPER receives goods (partial then rest)
  await login('keeper.dso@minicuts.demo');
  ok(!(await vis('.tab[data-p="t-users"]')) && !(await vis('.tab[data-p="t-chain"]')), 'store keeper does not see Users or Controller');
  const i1a = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).find(r => r.item.id === 'i1').onHand);
  await pg.evaluate(() => MC.purchasing.open('po1')); await pg.waitForSelector('[data-a="receive"]'); await pg.click('[data-a="receive"]'); await pg.waitForSelector('#rc-ok');
  await pg.fill('input[data-n="0"]', '40'); await pg.fill('#rc-ref', 'DN-123'); await pg.click('#rc-ok'); await pg.waitForTimeout(800);
  let st = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).purchase_orders.find(p => p.id === 'po1').status);
  ok(st === 'partial', 'receiving 40 of 60 → part received');
  await pg.evaluate(() => MC.purchasing.open('po1')); await pg.waitForSelector('[data-a="receive"]'); await pg.click('[data-a="receive"]'); await pg.waitForSelector('#rc-ok');
  ok((await pg.inputValue('input[data-n="0"]')) === '20', 'pending quantity pre-filled with the remaining 20');
  await pg.fill('input[data-n="0"]', '21'); await pg.click('#rc-ok'); await pg.waitForTimeout(300); ok(/more than is pending/.test(await pg.innerText('#rc-msg')), 'cannot receive more than pending');
  await pg.fill('input[data-n="0"]', '20'); await pg.click('#rc-ok'); await pg.waitForTimeout(800);
  st = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).purchase_orders.find(p => p.id === 'po1').status);
  const i1b = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).find(r => r.item.id === 'i1').onHand);
  ok(st === 'received' && i1b === i1a + 60, 'PO fully received and stock increased by 60 (' + i1a + ' → ' + i1b + ')');
  await pg.evaluate(() => MC.purchasing.open('po1')); await pg.waitForSelector('.mc-ov'); t = await pg.innerText('.mc-ov'); ok(/DN-123/.test(t), 'delivery reference kept on the order'); await pg.evaluate(() => document.querySelector('.mc-ov').remove());

  // BRANCH MANAGER: limit 500, own outlet only
  await login('manager.dso@minicuts.demo');
  ok(!(await vis('#mc-branch')), 'manager of one outlet has no outlet switcher');
  await pg.evaluate(async () => { await MC.sb('purchase_orders', 'POST', { branch_id: 'b-dso', supplier_id: 's1', currency: 'AED', status: 'draft' }).then(r => MC.sb('purchase_orders', 'PATCH', { status: 'submitted', subtotal: 1000, tax_amount: 50, total: 1050, created_by: 'keeper.dso@minicuts.demo' }, 'id=eq.' + r[0].id)); });
  const big = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')).purchase_orders.find(p => p.total === 1050).id);
  await pg.evaluate(id => MC.purchasing.open(id), big); await pg.waitForSelector('[data-a="approve"]');
  ok(await pg.$eval('[data-a="approve"]', e => e.disabled) && /approval limit/.test(await pg.innerText('.mc-ov')), 'manager cannot approve 1,050 (limit 500) and is told why');
  await pg.evaluate(() => document.querySelector('.mc-ov').remove());
  ok(await pg.evaluate(() => MC.can('po.approve', 'b-dso') && !MC.can('po.approve', 'b-mir')), 'manager rights apply to own outlet only');

  // STYLIST: stock yes, purchasing no
  await login('stylist.dso@minicuts.demo');
  ok(await vis('.tab[data-p="t-inventory"]') && !(await vis('.tab[data-p="t-po"]')), 'stylist sees Stock but not Purchase orders');
  ok(await pg.evaluate(() => !MC.can('invoice.void') && !MC.can('discount.apply') && MC.can('inventory.issue') && !MC.can('inventory.receive')), 'stylist can record usage only');
  // sidebar fits without scrolling at laptop height
  const fit = await pg.evaluate(() => { const s = document.querySelector('.side'); return s.scrollHeight <= s.clientHeight + 2; });
  ok(fit, 'sidebar fits at 1366x768 without scrolling');

  // AUDITOR read-only
  await login('auditor@minicuts.demo');
  ok(await pg.evaluate(() => MC.can('chain.overview') && !MC.can('po.create') && !MC.can('inventory.adjust')), 'auditor can look but not change');

  // chain OFF: today's salon unchanged
  const p2 = await ctx.newPage(); await p2.route('**/*', r => { const u = r.request().url(); if (/supabase\.co/.test(u)) { leaked++; return r.abort(); } return u.startsWith('file:') ? r.continue() : r.fulfill({ status: 200, body: '' }); });
  await p2.goto('file://' + ROOT + '/minicuts-staff.html?demo=1&chain=0'); await p2.waitForTimeout(1200);
  ok(!(await p2.$('#mc-login')) && await p2.evaluate(() => MC.can('po.approve') && MC.can('invoice.void') && !document.querySelector('.tab[data-p="t-po"]')), 'with chain off there is no sign-in, no new menus, and everything is allowed as today');
  ok(leaked === 0, 'zero real Supabase calls (' + leaked + ')'); ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3))); await b.close();
})();
