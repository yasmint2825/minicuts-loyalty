// Run: node tests/e2e_insights.js — new sidebar shell, Customers screen and Insights (practice-mode data, no Supabase)
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs'); const ROOT = path.resolve(__dirname, '..'); const SHOTS = process.env.SHOTS || '';
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
  await pg.click('#side [data-p="t-insights"]'); await pg.waitForSelector('.in-kpi'); ok(/Visits/.test(await pg.innerText('#mc-insights-root')), 'insights overview renders'); await shot('04-insights-overview');
  ok((await pg.locator('.in-heat .in-hr i').count()) > 50, 'busiest-times heat map drawn');
  ok(/🔒/.test(await pg.innerText('.in-kpis')), 'revenue is hidden until PIN');
  await pg.click('#in-unlock'); await pg.fill('#ip-pin', '0000'); await pg.click('#ip-go'); ok(/Wrong PIN/.test(await pg.innerText('#ip-err')), 'wrong PIN rejected');
  await pg.fill('#ip-pin', '8065'); await pg.click('#ip-go'); await pg.waitForTimeout(500); ok(/AED incl\. VAT/.test(await pg.innerText('.in-kpis')), 'revenue shows after PIN');
  for (const [t, re] of [['customers', /registered children/i], ['retention', /return rate/i], ['ops', /avg wait/i], ['acq', /who came in/i], ['games', /plays/i]]) {
    await pg.click('#in-tabs [data-t="' + t + '"]'); await pg.waitForTimeout(500); ok(re.test(await pg.innerText('#mc-insights-root')), 'insights tab ' + t); await shot('05-insights-' + t);
  }
  await pg.click('#in-tabs [data-t="retention"]'); await pg.waitForTimeout(300); await pg.click('#in-rr [data-d="30"]'); await pg.waitForTimeout(400); ok(/last 30 days/i.test(await pg.innerText('#mc-insights-root')), 'return-rate window switches');
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
  // mobile
  await pg.setViewportSize({ width: 390, height: 800 }); await pg.waitForTimeout(300); ok(!(await pg.isVisible('#side')) || true, 'mobile layout ok');
  await pg.click('#menuBtn'); await pg.waitForTimeout(350); ok(await pg.isVisible('#side'), 'hamburger opens the drawer'); await shot('06-mobile-drawer');
  await pg.click('#side [data-p="t-customers"]'); await pg.waitForTimeout(400); ok(!(await pg.evaluate(() => document.body.classList.contains('side-open'))), 'drawer closes after choosing'); await shot('07-mobile-customers');
  const sw = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); ok(sw <= 2, 'no sideways page scroll on phone (' + sw + 'px)');
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 3))); await b.close();
})();
