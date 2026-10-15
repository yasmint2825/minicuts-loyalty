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

  // forgot password + lockout
  await pg.fill('#lg-e', 'owner@minicuts.demo'); await pg.click('#lg-forgot'); await pg.waitForTimeout(300); ok(/reset link is on its way/.test(await pg.innerText('#lg-info')), 'forgot password gives a neutral message');
  for (let i = 0; i < 5; i++) { await pg.fill('#lg-p', 'bad' + i); await pg.click('#lg-go'); await pg.waitForTimeout(200); }
  await pg.fill('#lg-p', 'demo'); await pg.click('#lg-go'); await pg.waitForTimeout(300); ok(/Too many wrong attempts/.test(await pg.innerText('#lg-err')), 'five wrong passwords pause sign-in (even a correct one)');
  await pg.evaluate(() => { MC.rbac.fails = []; });
  // OWNER
  await login('owner@minicuts.demo');
  ok(await vis('.tab[data-p="t-chain"]') && await vis('.tab[data-p="t-users"]') && await vis('.tab[data-p="t-po"]') && await vis('.tab[data-p="t-inventory"]'), 'owner sees controller, users, stock and purchase-order menus');
  ok(await vis('#mc-branch'), 'owner has an outlet switcher');
  await tab('t-chain'); await pg.click('[data-t="stock"]'); await pg.waitForSelector('#co-body .ch-tbl'); let t = await pg.innerText('#t-chain-root');
  ok(/DSO/.test(t) && /MIR/.test(t) && /PO\/DSO\/\d+\/0001/.test(t), 'controller overview lists both outlets and the order waiting');
  ok(/Waiting for you/.test(t), 'owner is told an order is waiting for them');
  const needs = await pg.evaluate(async () => MC.inventory.rows(await MC.inventory.loadBranch('b-dso')).filter(r => r.needs).map(r => r.item.id).sort().join(','));
  ok(needs === 'i2,i4,i5', 'reorder alerts: items at/below reorder point (shampoo already on order is not repeated) → ' + needs);
  // group performance
  await tab('t-chain'); await pg.click('[data-t="perf"]'); await pg.waitForSelector('#co-be'); t = await pg.innerText('#t-chain-root');
  ok(/group revenue/i.test(t) && /DSO/.test(t) && /MIR/.test(t) && /Break-even/.test(t), 'group performance shows revenue, both outlets and break-even');
  const shares = await pg.$$eval('#co-body .ch-tbl tbody tr', rs => rs.map(r => r.children[3].innerText)); ok(shares.length === 2 && shares.every(x => /%/.test(x)) && shares.reduce((a, x) => a + parseInt(x), 0) >= 99, 'revenue share per outlet adds up to ~100% (' + shares.join(' / ') + ')');
  await pg.fill('[data-cost="b-dso"]', '32000'); await pg.dispatchEvent('[data-cost="b-dso"]', 'change'); await pg.waitForSelector('#co-be .ch-muted b'); ok(/32,000/.test(await pg.innerText('#co-be')), 'monthly cost saved and break-even shown');
  await pg.click('[data-p="7"]'); await pg.waitForTimeout(700); ok(/7 days|previous 7/.test(await pg.innerText('#t-chain-root')), 'period switch works');
  await pg.click('[data-t="stock"]'); await pg.waitForTimeout(700); ok(/Waiting for you|To reorder/.test(await pg.innerText('#t-chain-root')), 'stock & purchasing tab still available'); 
  await tab('t-users'); t = await pg.innerText('#t-users-root'); ok(/manager\.dso@minicuts\.demo/.test(t) && /Store keeper/.test(t), 'users & access lists the team');

  // add users from the admin screen
  await pg.click('[data-t="users"]'); await pg.waitForSelector('#us-add'); await pg.click('#us-add'); await pg.waitForSelector('#ue-email');
  await pg.fill('#ue-email', 'new.keeper@minicuts.demo'); await pg.fill('#ue-name', 'New Keeper'); await pg.selectOption('#ue-role', 'store_keeper'); await pg.check('[data-b="b-mir"]'); await pg.click('#ue-save'); await pg.waitForTimeout(700);
  let dbx = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2')));
  ok(dbx.memberships.some(m => m.email === 'new.keeper@minicuts.demo' && m.role_key === 'store_keeper' && m.branch_ids.join() === 'b-mir') && (dbx.fn_calls || []).some(c => c.action === 'invite' && c.email === 'new.keeper@minicuts.demo'), 'owner adds a user in the admin screen and an invite e-mail is requested');
  await pg.click('#us-add'); await pg.waitForSelector('#ue-email'); await pg.fill('#ue-email', 'lester@minicuts.demo'); await pg.selectOption('#ue-role', 'stylist'); await pg.check('[data-b="b-dso"]'); await pg.check('[name="ue-lg"][value="temp"]'); await pg.click('#ue-save'); await pg.waitForSelector('#tp');
  const tp = await pg.innerText('#tp'); ok(tp.length >= 12 && /[A-Z]/.test(tp) && /[0-9]/.test(tp), 'temporary password generated and shown once (' + tp.length + ' characters)'); await pg.click('#tp-x');
  dbx = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2'))); ok((dbx.fn_calls || []).some(c => c.action === 'create' && c.email === 'lester@minicuts.demo') && dbx.demo_pw['lester@minicuts.demo'] === tp, 'login created through the logins service with that password');
  await pg.click('[data-e]:has-text("Edit") >> nth=0').catch(() => {});
  await pg.evaluate(() => document.querySelectorAll('.mc-ov').forEach(o => o.remove()));
  await pg.evaluate(async () => { const m = (await MC.sb('memberships', 'GET', null, 'email=eq.lester@minicuts.demo'))[0]; MC.rbac.users.edit(m); }); await pg.waitForSelector('#ue-act'); await pg.uncheck('#ue-act'); await pg.click('#ue-save'); await pg.waitForTimeout(700);
  dbx = await pg.evaluate(() => JSON.parse(localStorage.getItem('mc_demo_db_v2'))); ok((dbx.fn_calls || []).some(c => c.action === 'set_banned' && c.email === 'lester@minicuts.demo' && c.banned === true), 'switching a user off also blocks their login');
  await pg.evaluate(async () => { const m = (await MC.sb('memberships', 'GET', null, 'email=eq.lester@minicuts.demo'))[0]; MC.rbac.users.edit(m); }); await pg.waitForSelector('#ue-reset'); await pg.click('#ue-reset'); await pg.waitForTimeout(300); ok(/Sent/.test(await pg.innerText('#ue-resetm')), 'admin can send a password-reset e-mail for a user'); await pg.evaluate(() => document.querySelectorAll('.mc-ov').forEach(o => o.remove()));
  await pg.click('[data-t="security"]'); await pg.waitForSelector('#sc-idle'); ok(/Allow new users to sign up/.test(await pg.innerText('#us-body')), 'sign-in security tab explains the Supabase switches');
  await pg.fill('#sc-idle', '45'); await pg.click('#sc-save'); await pg.waitForTimeout(400); ok(await pg.evaluate(() => MC.rbac.SEC.idleMinutes) === 45, 'idle sign-out minutes can be changed by the owner');
  await pg.evaluate(() => { MC.rbac.SEC.idleMinutes = 120; });
  // password dialog
  await pg.click('#mc-pw'); await pg.fill('#pw1', 'short'); await pg.fill('#pw2', 'short'); await pg.click('#pw-ok'); await pg.waitForTimeout(300); ok(/at least 8/.test(await pg.innerText('#pw-m')), 'weak password refused');
  await pg.fill('#pw1', 'LongEnough1'); await pg.fill('#pw2', 'Different1'); await pg.click('#pw-ok'); await pg.waitForTimeout(200); ok(/do not match/.test(await pg.innerText('#pw-m')), 'mismatched passwords refused');
  await pg.fill('#pw2', 'LongEnough1'); await pg.click('#pw-ok'); await pg.waitForTimeout(400); ok(!(await pg.$('#pw-ok')), 'valid password change accepted');
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
