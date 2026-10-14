// Run: node tests/loyalty.test.js

/* ── mc-loyalty.js: loyalty rules (read / validate / merge / diff / expiry) ── */
let n = 0;
(function () {
  const L = require('../mc-loyalty.js'); const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL ' + m, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1; } else { console.log('PASS ' + m); n++; } };
  const v0 = L.read({});
  eq([v0.stampsNeeded, v0.boyMonths, v0.girlMonths, v0.girlLapsedWeeks], [6, 12, 15, 26], 'loyalty: empty row falls back to the Loyalty app defaults');
  eq(L.read({ stampsNeeded: 8, boyMonths: 'x', girlNudgeWeeks: 0 }).boyMonths, 12, 'loyalty: unusable saved value falls back to the default');
  eq(L.validate(v0), [], 'loyalty: defaults are valid');
  eq(L.validate(Object.assign({}, v0, { stampsNeeded: 0 })).length, 1, 'loyalty: stamps needed below 1 rejected');
  eq(L.validate(Object.assign({}, v0, { boyMonths: 40 })).length, 1, 'loyalty: validity above 36 months rejected');
  eq(L.validate(Object.assign({}, v0, { boyNudgeWeeks: 12, boyLapsedWeeks: 12 })).length, 1, 'loyalty: nudge must come before lapsed');
  eq(L.validate(Object.assign({}, v0, { girlWAReady: '  ' })).length, 1, 'loyalty: empty message rejected');
  eq(L.validate(Object.assign({}, v0, { girlMonths: 7.5 })).length, 1, 'loyalty: decimals rejected');
  const existing = { user: 'admin', pass: 'secret', resetCode: 'X', somethingNew: [1, 2], stampsNeeded: 6, boyMonths: 12 };
  const merged = L.merge(existing, Object.assign({}, v0, { stampsNeeded: 8 }));
  eq([merged.user, merged.pass, merged.resetCode, merged.somethingNew, merged.stampsNeeded], ['admin', 'secret', 'X', [1, 2], 8], 'loyalty: merge keeps credentials and unknown keys, changes only managed fields');
  eq(L.diff(v0, Object.assign({}, v0, { stampsNeeded: 8, girlMonths: 18 })).map(d => d.key), ['stampsNeeded', 'girlMonths'], 'loyalty: diff lists exactly the changed fields');
  eq(L.expiryFor('boy', '2026-10-14', v0), '2027-10-14', 'loyalty: boy passport expires 12 months after first stamp');
  eq(L.expiryFor('girl', '2026-10-14', v0), '2028-01-14', 'loyalty: girl passport expires 15 months after first stamp');
  eq(L.expiryFor('boy', '2026-10-14', Object.assign({}, v0, { boyMonths: 6 })), '2027-04-14', 'loyalty: validity change flows into expiry');
})();

console.log(n + ' passed');
