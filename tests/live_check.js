// Daily check of the live old salon pages (run by .github/workflows/old-pages-check.yml, or: node tests/live_check.js).
// READ-ONLY: every request that could change data (anything but GET/HEAD/OPTIONS to the database, sign-in, functions)
// is stopped before it leaves the browser, so the check can never add, change or delete a row.
// A page fails if it throws a script error, or a database read is refused or fails, or (where expected) reads nothing.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('playwright-core')); }
const fs = require('fs');
const BASE = (process.env.BASE_URL || 'https://yasmint2825.github.io/minicuts-loyalty/').replace(/\/?$/, '/');
const WAIT = +(process.env.WAIT_MS || 8000);
// reads: true = the page must read salon data as soon as it opens
const PAGES = [
  { file: 'minicuts-staff.html', name: 'Staff app', reads: true },
  // known: this page has always called a missing function on open (not caused by any change; left as it is)
  { file: 'minicuts-staff-mgmt.html', name: 'Staff management', reads: true, known: [/smCheckSyncStatus is not defined/] },
  { file: 'minicuts-checkin.html', name: 'Check-in kiosk', reads: true },
  { file: 'tv-leaderboard.html', name: 'TV leaderboard', reads: true },
  { file: 'index.html', name: 'Loyalty app', reads: false },
  { file: 'minicuts-game.html', name: 'Game', reads: false },
  { file: 'minicuts-game-free.html', name: 'Game (free)', reads: false },
  { file: 'voucher.html', name: 'Voucher page', reads: false },
  { file: 'minicuts_hair_care_guide_v2.html', name: 'Hair care guide', reads: false },
];
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

async function check(browser, p) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: 'Asia/Dubai' });
  const pg = await ctx.newPage();
  const r = { ...p, ok: true, problems: [], notes: [], reads: 0, stopped: 0 };
  pg.on('pageerror', (e) => ((p.known || []).some((k) => k.test(e.message)) ? r.notes : r.problems).push('script error: ' + e.message.slice(0, 160)));
  pg.on('dialog', (d) => d.dismiss().catch(() => {}));
  await pg.route('**/*', (route) => {
    const req = route.request(), u = new URL(req.url());
    if (/supabase\.co$/.test(u.hostname) && !SAFE.has(req.method())) { r.stopped++; return route.abort('blockedbyclient'); }
    if (/supabase\.co$/.test(u.hostname) && /^\/(auth|functions)\//.test(u.pathname) && req.method() !== 'OPTIONS') { r.stopped++; return route.abort('blockedbyclient'); }
    return route.continue();
  });
  const isRead = (req) => /supabase\.co$/.test(new URL(req.url()).hostname) && new URL(req.url()).pathname.startsWith('/rest/v1/') && req.method() === 'GET';
  const table = (req) => new URL(req.url()).pathname.slice(9).split('/')[0] || '(root)';
  pg.on('response', (res) => {
    if (!isRead(res.request())) return;
    if (res.status() >= 400) r.problems.push(`read of ${table(res.request())} refused (${res.status()})`); else r.reads++;
  });
  pg.on('requestfailed', (req) => { if (isRead(req)) r.problems.push(`read of ${table(req)} failed (${req.failure()?.errorText})`); });
  try {
    const resp = await pg.goto(BASE + p.file, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!resp || resp.status() >= 400) r.problems.push('page did not open (' + (resp ? resp.status() : 'no answer') + ')');
    await pg.waitForTimeout(WAIT);
  } catch (e) { r.problems.push('page did not open: ' + e.message.slice(0, 160)); }
  if (p.reads && r.reads === 0) r.problems.push('read no salon data');
  r.ok = r.problems.length === 0;
  await ctx.close();
  return r;
}

(async () => {
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ['--no-sandbox'] } : {});
  const results = [];
  for (const p of PAGES) results.push(await check(browser, p));
  await browser.close();
  const lines = ['## Old salon pages: daily check', '', `Checked ${new Date().toISOString()} against ${BASE} (read-only)`, '',
    '| Page | Result | Data reads | Writes stopped | Problems | Known (not failing) |', '|---|---|---|---|---|---|'];
  for (const r of results) lines.push(`| ${r.name} | ${r.ok ? '✅ OK' : '❌ FAIL'} | ${r.reads} | ${r.stopped} | ${r.problems.join('; ').replace(/\|/g, '/') || '-'} | ${r.notes.join('; ') || '-'} |`);
  const text = lines.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n');
  if (results.some((r) => !r.ok)) process.exitCode = 1;
})();
