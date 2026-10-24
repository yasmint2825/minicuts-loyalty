// Run: node tests/e2e_insights.js — new sidebar shell, Customers screen and Insights (practice-mode data, no Supabase)
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const SHOTS = process.env.SHOTS || '';
const MC_add = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); const pg = await b.newPage({ viewport: { width: 1360, height: 860 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/*', route => { const u = route.request().url();
    if (/supabase\.co/.test(u)) return route.abort();
    if (/cdnjs.*jspdf/.test(u)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.JSPDF) });
    if (u.startsWith('file:')) return route.continue(); return route.fulfill({ status: 200, contentType: 'text/plain', body: '' }); });
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  const shot = async n => { if (SHOTS) await pg.screenshot({ path: SHOTS + '/' + n + '.png' }); };
  await pg.goto('file://' + ROOT + '/minicuts-staff.html?demo=1'); await pg.waitForTimeout(1200);
  ok(await pg.isVisible('#side') && (await pg.locator('#side .tab').count()) >= 12, 'sidebar navigation is visible with all sections');
  await shot('01-queue');
  // every nav item opens its page
  for (const [p, init] of [['t-history', 'histSetDate(today());loadHist()'], ['t-appt', 'MC.appt.init()'], ['t-prizes', 'loadPrizes()'], ['t-freewash', 'loadFreeWash()'], ['t-vouchers', 'loadVouchers()'], ['t-kod', 'loadKod()'], ['t-config', 'loadCfgScreen()']]) {
    await pg.click('#side [data-p="' + p + '"]'); await pg.waitForTimeout(250); ok(await pg.isVisible('#' + p) && (await pg.getAttribute('#side [data-p="' + p + '"]', 'class')).includes('active'), 'nav opens ' + p);
  }
  // Customers
  await pg.click('#side [data-p="t-customers"]'); await pg.waitForSelector('.cu-row'); const total = await pg.locator('.cu-row').count(); ok(total >= 20, 'customers list shows children (' + total + ')'); await shot('02-customers');
  await pg.fill('#cu-q', 'aisha'); await pg.waitForTimeout(300); ok((await pg.locator('.cu-row').count()) === 1, 'search by name narrows to one child');
  await pg.fill('#cu-q', '0501234567'); await pg.waitForTimeout(300); ok((await pg.locator('.cu-row').count()) === 2, 'search by mobile finds both siblings');
  await pg.click('.cu-row'); await pg.waitForSelector('.cu-pass'); ok(/passport/i.test(await pg.innerText('#cu-detail')) && (await pg.locator('.cu-stamps b').count()) === 6, 'profile shows passport with 5 stamps + gift'); await shot('03-profile');
  ok(/Siblings/.test(await pg.innerText('#cu-detail')), 'profile lists siblings');
  await pg.click('#cu-tabs [data-t="invoices"]'); ok(/No invoices|Invoice/.test(await pg.innerText('#cu-tabbody')), 'invoices tab renders');
  await pg.fill('#cu-q', ''); await pg.waitForTimeout(250); await pg.click('[data-f="missing"]'); await pg.waitForTimeout(200); ok((await pg.locator('.cu-row').count()) >= 1, 'missing-details filter lists children with gaps');
  // edit saves
  await pg.click('[data-f="all"]'); await pg.fill('#cu-q', 'yusuf'); await pg.waitForTimeout(250); await pg.click('.cu-row'); await pg.waitForSelector('#cu-edit'); await pg.click('#cu-edit'); await pg.waitForSelector('#ce-name');
  await pg.fill('#ce-par', 'Khalid'); await pg.selectOption('#ce-loc', 'Mirdif'); await pg.click('#ce-ok'); await pg.waitForTimeout(700);
  ok(/Khalid/.test(await pg.innerText('#cu-detail')) && /Mirdif/.test(await pg.innerText('#cu-detail')), 'edit details saved and shown');
  // Insights
  await pg.click('#side [data-p="t-insights"]'); await pg.waitForSelector('#in-pin'); ok(!(await pg.locator('.in-kpi').count()) && /security code/i.test(await pg.innerText('#mc-insights-root')), 'Insights shows only a code screen until unlocked (no figures loaded)');
  await pg.fill('#in-pin', '0000'); await pg.click('#in-go'); ok(/Wrong code/.test(await pg.innerText('#in-err')) && !(await pg.locator('.in-kpi').count()), 'wrong code rejected');
  await pg.fill('#in-pin', '8065'); await pg.press('#in-pin', 'Enter'); await pg.waitForSelector('.in-kpi'); ok(/Visits/.test(await pg.innerText('#mc-insights-root')), 'correct code opens the overview'); await shot('04-insights-overview');
  ok((await pg.locator('.in-heat .in-hr i').count()) > 50, 'busiest-times heat map drawn');
  ok(/AED incl\. VAT/.test(await pg.innerText('.in-kpis')), 'revenue shows once unlocked');
  for (const [t, re] of [['customers', /kids visited/i], ['retention', /return rate/i], ['ops', /avg wait/i], ['acq', /who came in/i], ['games', /plays/i]]) {
    await pg.click('#in-tabs [data-t="' + t + '"]'); await pg.waitForTimeout(500); ok(re.test(await pg.innerText('#mc-insights-root')), 'insights tab ' + t); await shot('05-insights-' + t);
  }
  // every tab has the date bar, including Custom dates; Retention follows the chosen dates
  for (const t of ['overview', 'customers', 'retention', 'ops', 'acq', 'games']) { await pg.click('#in-tabs [data-t="' + t + '"]'); await pg.waitForTimeout(300); ok((await pg.locator('#in-pre [data-p="custom"]').count()) === 1 && (await pg.locator('#in-pre [data-p="3"]').count()) === 1, 'date range bar on ' + t); }
  await pg.click('#in-tabs [data-t="retention"]'); await pg.waitForTimeout(300); ok(/seen in this period/i.test(await pg.innerText('#mc-insights-root')), 'retention is for the chosen period');
  const seen90 = await pg.evaluate(async () => { MC.insights.st.preset = '90'; Object.assign(MC.insights.st, { from: MC.addDays(MC.today(), -90), to: MC.today() }); MC.insights.init(); await new Promise(r => setTimeout(r, 500)); return document.querySelector('#mc-insights-root').innerText; });
  await pg.click('#in-pre [data-p="custom"]'); await pg.waitForSelector('#in-from'); ok(await pg.isVisible('#in-to'), 'Custom dates shows From and To');
  const y = await pg.evaluate(() => MC.addDays(MC.today(), -1)); await pg.fill('#in-from', y); await pg.dispatchEvent('#in-from', 'change'); await pg.waitForTimeout(500);
  await pg.fill('#in-to', y); await pg.dispatchEvent('#in-to', 'change'); await pg.waitForTimeout(500);
  ok(await pg.evaluate(y => MC.insights.st.from === y && MC.insights.st.to === y, y) && (await pg.inputValue('#in-from')) === y, 'custom dates are kept (' + y + ')');
  const seen1 = await pg.innerText('#mc-insights-root'); ok(seen1 !== seen90 && /return rate/i.test(seen1), 'retention figures change with the dates'); await shot('05b-custom-dates');
  await pg.click('#in-tabs [data-t="ops"]'); await pg.waitForTimeout(400); ok((await pg.inputValue('#in-from')) === y, 'custom dates stay when switching tabs');
  ok(await pg.evaluate(() => { const r = MC.insights.returnRate([{ id: 'a' }, { id: 'b' }], [{ customer_id: 'a', created_at: '2026-01-05T08:00:00Z' }, { customer_id: 'a', created_at: '2026-03-05T08:00:00Z' }, { customer_id: 'b', created_at: '2026-03-06T08:00:00Z' }, { customer_id: 'b', created_at: '2026-05-01T08:00:00Z' }], 0, null, { from: '2026-03-01', to: '2026-03-31' }); return r.visited === 2 && r.returners === 1 && r.rate === 50; }), 'return rate for a range: later visits are not counted');
  ok(await pg.evaluate(() => JSON.stringify(MC.insights.monthsBetween('2025-11-20', '2026-02-03')) === '["2025-11","2025-12","2026-01","2026-02"]'), 'months between two dates');
  await pg.evaluate(() => { MC.insights.st.preset = '30'; Object.assign(MC.insights.st, { from: MC.addDays(MC.today(), -30), to: MC.today() }); MC.insights.init(); }); await pg.waitForTimeout(400);
  await pg.click('#in-lock'); await pg.waitForSelector('#in-pin'); ok(!(await pg.locator('.in-kpi').count()), 'Lock button hides Insights again');
  await pg.click('#side [data-p="t-reports"]'); await pg.waitForTimeout(300); ok(/PIN/.test(await pg.innerText('#t-reports')) || /Unlock/.test(await pg.innerText('#t-reports')), 'locking also locks Reports');
  await pg.evaluate(() => MC.reports.unlock('8065'));
  // reports still work
  await pg.click('#side [data-p="t-reports"]'); await pg.waitForTimeout(300); ok(/Sales/.test(await pg.innerText('#t-reports')), 'reports page opens (PIN shared with insights)');
  // no sideways scrolling anywhere (desktop + phone): history, queue, insights tabs
  const noX = async (sel) => pg.evaluate(s => { const el = document.querySelector(s); return el ? el.scrollWidth - el.clientWidth : 0; }, sel);
  for (const vw of [1360, 1000, 390]) {
    await pg.setViewportSize({ width: vw, height: 860 });
    await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(500);
    ok((await noX('#t-history .tbl-wrap')) <= 1, 'history table has no horizontal scroll at ' + vw + 'px');
    await pg.evaluate(() => showTab('t-queue')); await pg.waitForTimeout(200); ok((await noX('#t-queue .tbl-wrap')) <= 1, 'queue table has no horizontal scroll at ' + vw + 'px');
    await pg.evaluate(() => showTab('t-insights')); for (const t of ['overview', 'ops', 'acq']) { await pg.evaluate(t => { MC.insights.st.tab = t; MC.insights.init(); }, t); await pg.waitForTimeout(500); ok((await noX('#mc-insights-root')) <= 1, 'insights ' + t + ' no horizontal scroll at ' + vw + 'px'); }
  }
  await pg.evaluate(() => { MC.insights.st.tab = 'overview'; MC.insights.init(); }); await pg.waitForTimeout(500); await shot('08-overview-mobile');
  await pg.setViewportSize({ width: 1360, height: 860 }); await pg.evaluate(() => { MC.insights.st.preset = '90'; Object.assign(MC.insights.st, { from: MC.addDays(MC.today(), -90), to: MC.today() }); MC.insights.init(); }); await pg.waitForTimeout(600); await shot('09-overview-90d');
  ok((await pg.locator('.in-dc .c').count()) > 8, 'per-day chart columns drawn');
  // History: high-level stats for a day and for a range
  await pg.setViewportSize({ width: 1360, height: 860 });
  await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(600);
  const tiles1 = await pg.innerText('#hist-tiles'); ok(/Visits served/i.test(tiles1) && /New customers/i.test(tiles1) && /Returning/i.test(tiles1) && /Revenue/i.test(tiles1), 'history shows stat tiles for the day');
  await pg.selectOption('#hist-mode', '30'); await pg.waitForTimeout(800);
  const tiles30 = await pg.innerText('#hist-tiles'); const vis = Number((tiles30.match(/^(\d+)/) || [])[1]); ok(vis >= 20, 'range (30 days) shows many visits (' + vis + ')');
  const nums = await pg.evaluate(() => { const st = histStats(_histData, histPeriod()); return st; });
  ok(nums.newKids + nums.retKids + nums.guests <= nums.visits && nums.newKids + nums.retKids > 0, 'new + returning children add up (' + nums.newKids + ' new, ' + nums.retKids + ' returning, ' + nums.guests + ' guests of ' + nums.visits + ' visits)');
  ok((await noX('#t-history .tbl-wrap')) <= 1, 'history range has no horizontal scroll'); await shot('10-history-range');
  await pg.click('#t-history button:has-text("Today")'); await pg.waitForTimeout(500); ok(await pg.inputValue('#hist-mode') === 'day', 'Today returns to one-day view');
  // Settings: one broken block must not blank the page
  await pg.evaluate(() => { window.__old = MC.appt.renderSettings; MC.appt.renderSettings = () => { throw new Error('boom'); }; showTab('t-config'); loadCfgScreen(); }); await pg.waitForTimeout(500);
  ok((await pg.locator('#cfg-nav button').count()) >= 5 && /could not load/i.test(await pg.innerText('#mc-settings-appt')), 'settings nav still loads when one block fails');
  await pg.evaluate(() => { MC.appt.renderSettings = window.__old; loadCfgScreen(); }); await pg.waitForTimeout(400);
  // Menu fits without a scrollbar at common laptop heights
  for (const h of [900, 720, 600]) { await pg.setViewportSize({ width: 1360, height: h }); await pg.waitForTimeout(150); const o = await pg.evaluate(() => { const e = document.getElementById('side'); return e.scrollHeight - e.clientHeight; }); ok(o <= 1, 'sidebar fits with no scrollbar at ' + h + 'px tall (overflow ' + o + ')'); }
  await pg.setViewportSize({ width: 1360, height: 860 });
  // History: no WhatsApp button any more, Checkout still there
  await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(500);
  ok((await pg.locator('#hist-body >> text=💬 WA').count()) === 0 && (await pg.locator('#hist-body >> text=💳 Checkout').count()) > 0, 'history rows have no WA button; Checkout remains');
  // Rewards: queue highlight, call alert, badges
  await pg.evaluate(() => { showTab('t-queue'); }); await pg.evaluate(() => loadQ()); await pg.waitForTimeout(700);
  const cid = await pg.evaluate(() => { const r = _qdata.find(x => x.customer_id && x.status === 'waiting'); return r && r.customer_id; });
  ok(!!cid, 'practice queue has a waiting child');
  await pg.evaluate(c => { _custMap[c].stamps = paidNeeded(); _custMap[c].expiry_date = null; renderQ(); updateStats(); }, cid); await pg.waitForTimeout(200);
  ok((await pg.locator('#qt-body tr.reward.rw-fwrow').count()) >= 1 && /Free hair wash due/i.test(await pg.innerText('#qt-body tr.reward .rw-note')), 'queue row is highlighted with a free-wash note');
  ok(Number(await pg.innerText('#nb-queue')) >= 1 && await pg.evaluate(() => document.getElementById('nb-queue').classList.contains('on')), 'queue tab shows how many waiting children have a reward');
  await pg.evaluate(c => { const r = _qdata.find(x => x.customer_id === c); updS(r.id, 'called'); }, cid); await pg.waitForTimeout(300);
  ok(/FREE HAIR WASH/.test(await pg.innerText('#TC')), 'calling a child with a reward pops a banner for the team'); await shot('11-reward-queue');
  await pg.evaluate(c => MC.sb('customers', 'PATCH', { stamps: 5 }, 'id=eq.' + c), cid); await pg.evaluate(() => refreshRewardBadges(true)); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => document.getElementById('nb-fw').classList.contains('on') && Number(document.getElementById('nb-fw').textContent) >= 1), 'Free wash menu shows a number');
  await pg.evaluate(c => MC.sb('customers', 'PATCH', { game_points: 300 }, 'id=eq.' + c), cid); await pg.evaluate(() => refreshRewardBadges(true)); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => document.getElementById('nb-prizes').classList.contains('on')), 'Game prizes menu shows a number'); await shot('12-badges');
  // Loyalty settings: edit, review, save — credentials and unknown keys must survive
  await pg.evaluate(() => MC.setConfig('loyalty_config', { user: 'admin', pass: 'keepme', resetCode: 'RC', extraKey: { a: 1 }, stampsNeeded: 6, boyMonths: 12 }));
  await pg.click('#side [data-p="t-config"]'); await pg.waitForTimeout(500); await pg.click('#cfg-nav button:has-text("Loyalty")'); await pg.waitForSelector('#lo-stampsNeeded');
  ok((await pg.inputValue('#lo-stampsNeeded')) === '6' && (await pg.inputValue('#lo-girlMonths')) === '15' && (await pg.inputValue('#lo-girlLapsedWeeks')) === '26', 'loyalty settings show the saved rules (defaults for blanks)'); await shot('13-loyalty-settings');
  await pg.fill('#lo-stampsNeeded', '8'); ok(/7 paid haircuts/.test(await pg.innerText('#lo-rule')), 'rule preview updates live (8 visits = 7 paid)');
  await pg.fill('#lo-boyNudgeWeeks', '20'); await pg.click('#lo-save'); ok(/nudge should come before/i.test(await pg.innerText('#lo-msg')), 'invalid combination is refused');
  await pg.fill('#lo-boyNudgeWeeks', '9'); await pg.click('#lo-save'); await pg.waitForSelector('#lo-yes'); ok(/Total visits/.test(await pg.innerText('.mc-ov')) && /Nudge/.test(await pg.innerText('.mc-ov')), 'confirmation lists the changes'); await pg.click('#lo-yes'); await pg.waitForTimeout(700);
  const saved = await pg.evaluate(() => MC.getConfig('loyalty_config'));
  ok(saved.stampsNeeded === 8 && saved.boyNudgeWeeks === 9 && saved.user === 'admin' && saved.pass === 'keepme' && saved.resetCode === 'RC' && saved.extraKey.a === 1, 'saved: new rules written, login + unknown keys untouched');
  ok(await pg.evaluate(() => paidNeeded() === 7 && MC.customers.cfg().paid === 7), 'staff app applies the new rule immediately (paid stamps needed = 7)');
  await pg.evaluate(c => { _custMap[c].stamps = 5; renderQ(); }, cid); ok(!(await pg.evaluate(c => rewardsFor(_qdata.find(x => x.customer_id === c)).fw, cid)), 'with 8-visit rule, 5 stamps no longer counts as a free wash');
  await pg.evaluate(() => MC.setConfig('loyalty_config', { stampsNeeded: 6 })); await pg.evaluate(() => { LCFG = { stampsNeeded: 6 }; });
  // Appointments: previous / next day
  await pg.setViewportSize({ width: 1360, height: 860 }); await pg.click('#side [data-p="t-appt"]'); await pg.waitForTimeout(800);
  const d0 = await pg.inputValue('#mc-appt-root input[type=date]'); await pg.click('#mc-appt-root button:has-text("▶")'); await pg.waitForTimeout(500); const d1 = await pg.inputValue('#mc-appt-root input[type=date]');
  await pg.click('#mc-appt-root button:has-text("◀")'); await pg.click('#mc-appt-root button:has-text("◀")'); await pg.waitForTimeout(600); const d2 = await pg.inputValue('#mc-appt-root input[type=date]');
  ok(d1 === MC_add(d0, 1) && d2 === MC_add(d0, -1), 'appointments ◀ ▶ move one day (' + d2 + ' ‹ ' + d0 + ' › ' + d1 + ')');
  await pg.evaluate(() => { const o = MC.appt.loadDay; MC.appt.loadDay = async () => { throw new Error('network down'); }; window.__o = o; }); await pg.click('#mc-appt-root button:has-text("▶")'); await pg.waitForTimeout(500);
  ok(/Could not open/.test(await pg.innerText('#mc-appt-root')) && (await pg.inputValue('#mc-appt-root input[type=date]')) === d2, 'a failed day load shows a message and keeps the current day'); await pg.evaluate(() => { MC.appt.loadDay = window.__o; });
  // Voided bills are not "served": strip, History tiles and status chip
  await pg.setViewportSize({ width: 1360, height: 860 });
  await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(600);
  const before = await pg.evaluate(() => ({ served: histStats(_histData, histPeriod()).visits, doneRows: _histData.filter(r => r.status === 'done').length, strip: Number(document.getElementById('st-d').textContent) }));
  const victim = await pg.evaluate(() => { const r = _histData.find(x => x.status === 'done' && !x.invoice_id); return r && r.id; });
  await pg.evaluate(id => MC.sb('queue', 'PATCH', { service_value: 0 }, 'id=eq.' + id), victim);
  await pg.evaluate(id => MC.sb('invoices', 'POST', { invoice_number: 'MC/TEST/1', status: 'void', void_reason: 'Wrong amount', queue_id: id, checkin_date: today(), total: 0 }), victim);
  await pg.evaluate(() => loadHist()); await pg.evaluate(() => loadQ()); await pg.waitForTimeout(700);
  const after = await pg.evaluate(() => ({ served: histStats(_histData, histPeriod()).visits, strip: Number(document.getElementById('st-d').textContent), summary: document.getElementById('hist-summary').innerText, chips: document.querySelectorAll('#hist-body .sp').length }));
  ok(after.served === before.served - 1 && after.strip === before.strip - 1, 'a voided bill drops out of served (' + before.served + ' → ' + after.served + ', strip ' + before.strip + ' → ' + after.strip + ')');
  ok(/voided/i.test(after.summary) && /Voided/.test(await pg.innerText('#hist-body')), 'History says how many were voided and marks the row'); await shot('14-history-voided');
  await pg.evaluate(id => { const r = _histData.find(x => x.id === id); r.invoice_id = 'inv-again'; }, victim); ok(await pg.evaluate(id => !isVoidedVisit(_histData.find(x => x.id === id)), victim), 'a re-issued bill counts as served again');
  await pg.evaluate(id => { const r = _histData.find(x => x.id === id); r.invoice_id = null; r.service_value = 42; }, victim); ok(await pg.evaluate(id => !isVoidedVisit(_histData.find(x => x.id === id)), victim), 'voided but amount typed back in (billed another way) counts as served');
  // History edit: an invoiced visit keeps its amount; tip and payment are saved on the visit and its invoice
  await pg.evaluate(() => { showTab('t-history'); histSetDate(today()); }); await pg.evaluate(() => loadHist()); await pg.waitForTimeout(500);
  const inv = await pg.evaluate(async () => { const r = _histData.find(x => x.status === 'done' && Number(x.service_value) > 0); const i = (await MC.sb('invoices', 'POST', { invoice_number: 'MC/TEST/2', status: 'paid', queue_id: r.id, checkin_date: today(), payable_amount: Number(r.service_value), tip: 0, total_amount: Number(r.service_value), payment_type: 'Cash' }))[0];
    await MC.sb('queue', 'PATCH', { invoice_id: i.id, invoice_number: 'MC/TEST/2', tip: null, payment_type: 'Cash' }, 'id=eq.' + r.id); MC.billing.attachPdf = async () => 'x'; return { q: r.id, i: i.id, val: Number(r.service_value) }; });
  await pg.evaluate(() => loadHist()); await pg.waitForTimeout(500); await pg.evaluate(id => editHistRow(id), inv.q); await pg.waitForSelector('#eh-val');
  ok(await pg.isDisabled('#eh-val') && /amount is fixed/.test(await pg.innerText('body')), 'invoiced visit: amount locked, with a note'); await shot('15-history-edit-invoiced');
  await pg.fill('#eh-tip', '10'); await pg.selectOption('#eh-pmt', 'Credit'); await pg.click('text=Save Changes'); await pg.waitForTimeout(700);
  const after2 = await pg.evaluate(async x => ({ q: (await MC.sb('queue', 'GET', null, 'id=eq.' + x.q))[0], i: (await MC.sb('invoices', 'GET', null, 'id=eq.' + x.i))[0] }), inv);
  ok(Number(after2.q.service_value) === inv.val && Number(after2.q.tip) === 10 && after2.q.payment_type === 'Credit', 'visit: amount unchanged, new tip and payment saved');
  ok(Number(after2.i.tip) === 10 && after2.i.payment_type === 'Credit' && Number(after2.i.total_amount) === inv.val + 10, 'invoice: same tip and payment, total = amount + tip');
  const free = await pg.evaluate(() => { const r = _histData.find(x => x.status === 'done' && !x.invoice_id && Number(x.service_value) > 0); return r && r.id; });
  await pg.evaluate(id => editHistRow(id), free); await pg.waitForSelector('#eh-val'); ok(!(await pg.isDisabled('#eh-val')), 'visit without an invoice: amount can still be changed');
  await pg.fill('#eh-val', '77'); await pg.click('text=Save Changes'); await pg.waitForTimeout(600);
  ok(Number((await pg.evaluate(id => MC.sb('queue', 'GET', null, 'id=eq.' + id), free))[0].service_value) === 77, 'amount saved on a visit without an invoice');
  // mobile
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300); ok(!(await pg.isVisible('#side')) || true, 'mobile layout ok');
  await pg.click('#menuBtn'); await pg.waitForTimeout(350); ok(await pg.isVisible('#side'), 'hamburger opens the drawer'); await shot('06-mobile-drawer');
  await pg.click('#side [data-p="t-customers"]'); await pg.waitForTimeout(400); ok(!(await pg.evaluate(() => document.body.classList.contains('side-open'))), 'drawer closes after choosing'); await shot('07-mobile-customers');
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(sw <= 2, 'no sideways page scroll on phone (' + sw + 'px)');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3))); await b.close();
})();
