/* ============================================================================
 * mc-loyalty.js — Loyalty rules inside the staff app's Settings ("🎯 Loyalty").
 *
 * Edits the SAME `loyalty_config` row (staff_config table) that the Loyalty app reads and writes, so the
 * stamp rules, passport validity, reminder timings and WhatsApp wording stay one source of truth.
 *
 * Safety:
 *  - Only the fields shown here are written. Everything else in the row (staff login, reset code, any other key,
 *    and anything a newer Loyalty version adds) is re-read just before saving and kept exactly as it is.
 *  - Values are range-checked; nothing is written until the person confirms a before → after list.
 *  - After saving, this app applies the new rules immediately (stamps needed, validity, free-wash and expiry logic).
 *  - Login credentials are NOT shown or edited here — they stay in the Loyalty app.
 * Pure helpers (read, validate, merge, diff, expiry) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const L = MC.loyalty = MC.loyalty || {};

  /* defaults = the Loyalty app's own defaults, so an empty row behaves exactly like today */
  L.DEFAULTS = {
    stampsNeeded: 6, boyMonths: 12, girlMonths: 15,
    boyNudgeWeeks: 8, girlNudgeWeeks: 15, boyLapsedWeeks: 12, girlLapsedWeeks: 26, boyExpiryWarnDays: 30, girlExpiryWarnDays: 45,
    boyWAExpiry: 'Hi! 🐼 Just a reminder that {name}\'s MiniCuts loyalty passport is expiring soon. Don\'t let those stamps go to waste! Book a haircut today 💈',
    girlWAExpiry: 'Hi! 🐼 {name}\'s MiniCuts loyalty passport expires soon. She\'s earned those stamps — book before they expire! 💇‍♀️',
    boyWANudge: 'Hi! 🐼 Just checking in — {name} is due for a haircut at MiniCuts DSO! His stamps are waiting. Book anytime this week ✂️',
    girlWANudge: 'Hi! 🐼 Just checking in — {name} is due for a visit at MiniCuts DSO! Her stamps are waiting. Book anytime 💇‍♀️',
    boyWALapsed: 'Hey! 🐼 We really miss {name} at MiniCuts! It\'s been a while — pop in for a fresh cut and keep those stamps going! ✂️😊',
    girlWALapsed: 'Hey! 🐼 We really miss {name} at MiniCuts! It\'s been a while — come back for a lovely visit, her stamps are waiting! 💇‍♀️😊',
    boyWAReady: '🎉 Great news! {name} has earned a FREE Hair Wash 🚿 at MiniCuts! Bring him in anytime to redeem. See you soon! 🐼✂️',
    girlWAReady: '🎉 Great news! {name} has earned a FREE Hair Wash 🚿 at MiniCuts! Bring her in anytime to redeem. See you soon! 🐼💇‍♀️',
    boyWABirthday: '🎂 Happy Birthday to {name}! Wishing him a wonderful day from all of us at MiniCuts 🐼 Come in for a special birthday haircut!',
    girlWABirthday: '🎂 Happy Birthday to {name}! Wishing her a wonderful day from all of us at MiniCuts 🐼 Come in for a special birthday haircut!',
    afterServiceMsg: 'Hi {parent}!\n\nThank you for visiting MiniCuts - we loved having {name} with us today!\n\nStamps: {stamps} collected - just {needed} more for a free hair wash!\n{game_points}\n\nCheck your loyalty passport:\n{passport_link}\n\nIf you enjoyed your visit, a Google review means the world to us:\nhttps://share.google/xpTR5fVOVbt4pwg8X\n\nSee you soon!\nMiniCuts DSO'
  };
  /* numeric rules: key, label, unit, min, max */
  L.NUMS = {
    stampsNeeded: ['Total visits for the free hair wash', 'visits', 1, 20],
    boyMonths: ['Boy passport validity', 'months', 1, 36], girlMonths: ['Girl passport validity', 'months', 1, 36],
    boyNudgeWeeks: ['Nudge after', 'weeks', 1, 104], girlNudgeWeeks: ['Nudge after', 'weeks', 1, 104],
    boyLapsedWeeks: ['Lapsed after', 'weeks', 1, 104], girlLapsedWeeks: ['Lapsed after', 'weeks', 1, 104],
    boyExpiryWarnDays: ['Expiry warning', 'days before', 1, 180], girlExpiryWarnDays: ['Expiry warning', 'days before', 1, 180]
  };
  L.TPLS = [['WAReady', 'Free hair wash ready 🚿'], ['WAExpiry', 'Passport expiring soon'], ['WANudge', 'Gentle reminder (nudge)'], ['WALapsed', 'Win-back (lapsed)'], ['WABirthday', 'Birthday 🎂']];
  L.MANAGED = Object.keys(L.NUMS).concat(['boy', 'girl'].reduce((a, g) => a.concat(L.TPLS.map(t => g + t[0])), []), ['afterServiceMsg']);

  /* effective values: saved value if it is usable, otherwise the default (same fallback the apps use) */
  L.read = function (raw) {
    raw = raw && typeof raw === 'object' ? raw : {}; const out = {};
    Object.keys(L.NUMS).forEach(k => { const n = Number(raw[k]); out[k] = n > 0 ? n : L.DEFAULTS[k]; });
    L.MANAGED.filter(k => !L.NUMS[k]).forEach(k => { out[k] = typeof raw[k] === 'string' && raw[k].trim() ? raw[k] : L.DEFAULTS[k]; });
    return out;
  };
  /* returns a list of problems (empty = fine) */
  L.validate = function (v) {
    const bad = [];
    Object.keys(L.NUMS).forEach(k => {
      const n = Number(v[k]), d = L.NUMS[k], who = /^boy/.test(k) ? 'Boys' : /^girl/.test(k) ? 'Girls' : '';
      if (!Number.isFinite(n) || n !== Math.round(n) || n < d[2] || n > d[3]) bad.push((who ? who + ' · ' : '') + d[0] + ' must be a whole number from ' + d[2] + ' to ' + d[3]);
    });
    ['boy', 'girl'].forEach(g => {
      if (Number(v[g + 'NudgeWeeks']) >= Number(v[g + 'LapsedWeeks'])) bad.push((g === 'boy' ? 'Boys' : 'Girls') + ' · the nudge should come before "lapsed" (nudge ' + v[g + 'NudgeWeeks'] + ' wks, lapsed ' + v[g + 'LapsedWeeks'] + ' wks)');
      L.TPLS.forEach(t => { if (!String(v[g + t[0]] || '').trim()) bad.push((g === 'boy' ? 'Boys' : 'Girls') + ' · message "' + t[1] + '" cannot be empty'); });
    });
    if (!String(v.afterServiceMsg || '').trim()) bad.push('After-service message cannot be empty');
    return bad;
  };
  /* keeps every key in `existing`; replaces only the ones this screen manages */
  L.merge = function (existing, v) {
    const out = Object.assign({}, existing && typeof existing === 'object' ? existing : {});
    L.MANAGED.forEach(k => { out[k] = L.NUMS[k] ? Number(v[k]) : String(v[k]); });
    return out;
  };
  /* before → after list for the confirmation dialog */
  L.diff = function (before, after) {
    const lab = k => L.NUMS[k] ? ((/^boy/.test(k) ? 'Boys · ' : /^girl/.test(k) ? 'Girls · ' : '') + L.NUMS[k][0]) : k === 'afterServiceMsg' ? 'After-service message' : ((/^boy/.test(k) ? 'Boys · ' : 'Girls · ') + (L.TPLS.find(t => k.slice(k.startsWith('boy') ? 3 : 4) === t[0]) || [0, k])[1]);
    return L.MANAGED.filter(k => String(before[k]) !== String(after[k])).map(k => ({ key: k, label: lab(k), from: before[k], to: after[k], text: !L.NUMS[k] }));
  };
  /* passport expiry as the apps compute it: first stamp date + validity months (boys / girls differ) */
  L.expiryFor = function (gender, firstStampYmd, v) {
    const months = gender === 'girl' ? v.girlMonths : v.boyMonths, d = new Date(firstStampYmd + 'T12:00:00'); d.setMonth(d.getMonth() + months);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* ── screen ───────────────────────────────────────────────────────────── */
  const e = s => (MC.esc ? MC.esc(s) : String(s));
  const $ = id => document.getElementById(id);
  L.st = { saved: null, raw: null };
  const numRow = (k, who) => '<div class="lo-r"><div><b>' + L.NUMS[k][0] + '</b><span>' + L.NUMS[k][1] + '</span></div><input class="fi lo-n" type="number" inputmode="numeric" id="lo-' + k + '" min="' + L.NUMS[k][2] + '" max="' + L.NUMS[k][3] + '"></div>';
  const style = '.lo-r{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #F1F5F9;}.lo-r b{display:block;font-size:13px;}.lo-r span{font-size:11.5px;color:var(--muted);}.lo-n{width:84px;text-align:center;font-weight:800;}.lo-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;}.lo-h{font:800 12px var(--fb);margin:4px 0 4px;}.lo-pv{background:#F8FBFF;border:1px solid var(--border);border-radius:10px;padding:9px 12px;font-size:12.5px;color:#334155;margin-top:10px;line-height:1.5;}.lo-lv{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px;}.lo-lv div{background:#F8FBFF;border:1px solid var(--border);border-radius:10px;padding:8px 10px;font-size:12px;}.lo-lv b{display:block;font-size:12.5px;}details.lo-d{border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-top:12px;}details.lo-d summary{cursor:pointer;font-weight:800;font-size:13px;}.lo-t{width:100%;font-size:12.5px;line-height:1.5;resize:vertical;margin-top:4px;}.lo-df{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;font-size:12px;padding:6px 0;border-bottom:1px solid #F1F5F9;align-items:start;}.lo-df i{font-style:normal;color:var(--muted);}';

  L.render = async function () {
    const host = $('mc-settings-loyalty'); if (!host) return;
    if (!$('lo-style')) { const s = document.createElement('style'); s.id = 'lo-style'; s.textContent = style; document.head.appendChild(s); }
    host.innerHTML = '<div class="card"><div class="card-title">🎯 Loyalty rules</div><div style="color:var(--muted);font-size:13px;padding:10px 0;">Loading the current rules…</div></div>';
    let raw = null; try { raw = await MC.getConfig('loyalty_config'); } catch (err) { host.innerHTML = '<div class="card"><div class="card-title">⚠️ Loyalty rules could not load</div><p style="font-size:12.5px;color:var(--muted);">' + e(err.message) + '</p></div>'; return; }
    L.st.raw = raw || {}; L.st.saved = L.read(raw);
    const gt = g => L.TPLS.map(t => '<label class="fl" style="margin-top:8px;">' + t[1] + '</label><textarea class="fi lo-t" rows="2" id="lo-' + g + t[0] + '"></textarea>').join('');
    host.innerHTML = '<div class="card"><div class="card-title">🎯 Loyalty rules</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:6px 0 4px;">These are the same rules the Loyalty app uses — change them here or there, they stay in sync. Login details are not shown here.</p>' +
      '<div class="lo-h" style="margin-top:14px;">Stamps &amp; free hair wash</div>' + numRow('stampsNeeded') +
      '<div class="lo-pv" id="lo-rule"></div>' +
      '<div class="lo-g" style="margin-top:14px;"><div><div class="lo-h" style="color:var(--b);">👦 Boys</div>' + numRow('boyMonths') + numRow('boyNudgeWeeks') + numRow('boyLapsedWeeks') + numRow('boyExpiryWarnDays') + '</div>' +
      '<div><div class="lo-h" style="color:#EC4899;">👧 Girls</div>' + numRow('girlMonths') + numRow('girlNudgeWeeks') + numRow('girlLapsedWeeks') + numRow('girlExpiryWarnDays') + '</div></div>' +
      '<div class="lo-pv" id="lo-exp"></div>' +
      '<div class="lo-h" style="margin-top:16px;">🎁 Game prize levels</div><div style="font-size:12px;color:var(--muted);">Set inside the MiniCuts game itself — shown here for reference. A level is “open” once a child reaches its points and the prize has not been handed over.</div>' +
      '<div class="lo-lv">' + (typeof GAME_LEVELS !== 'undefined' ? GAME_LEVELS : []).map(l => '<div>' + l.icon + ' <b>Level ' + l.level + ' · ' + e(l.badge) + '</b>' + l.pts + ' points</div>').join('') + '</div>' +
      '<details class="lo-d"><summary>💬 Loyalty WhatsApp wording</summary><div style="font-size:11.5px;color:var(--muted);margin-top:6px;">Use {name} for the child’s name. These texts are used by the reminders in the Loyalty app.</div><div class="lo-g"><div><div class="lo-h" style="color:var(--b);margin-top:10px;">👦 Boys</div>' + gt('boy') + '</div><div><div class="lo-h" style="color:#EC4899;margin-top:10px;">👧 Girls</div>' + gt('girl') + '</div></div></details>' +
      '<details class="lo-d"><summary>📨 After-service message</summary><div style="font-size:11.5px;color:var(--muted);margin-top:6px;">Placeholders: {parent} {name} {stamps} {needed} {game_points} {passport_link}</div><textarea class="fi lo-t" rows="8" id="lo-afterServiceMsg"></textarea></details>' +
      '<div id="lo-msg" class="sm" style="display:none;margin-top:12px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;"><button class="btn btn-y" id="lo-save" style="flex:1;min-width:180px;">Review &amp; save</button><button class="btn btn-ghost" id="lo-reset">Discard changes</button></div></div>';
    L.fill(L.st.saved);
    host.querySelectorAll('.lo-n').forEach(i => i.addEventListener('input', L.preview));
    $('lo-save').onclick = L.review; $('lo-reset').onclick = () => { L.fill(L.st.saved); L.msg(''); };
  };
  L.fill = function (v) { L.MANAGED.forEach(k => { const el = $('lo-' + k); if (el) el.value = v[k]; }); L.preview(); };
  L.collect = function () { const v = {}; L.MANAGED.forEach(k => { const el = $('lo-' + k); v[k] = el ? (L.NUMS[k] ? el.value.trim() : el.value) : L.st.saved[k]; }); Object.keys(L.NUMS).forEach(k => { v[k] = v[k] === '' ? NaN : Number(v[k]); }); return v; };
  L.preview = function () {
    const v = L.collect(), n = v.stampsNeeded, today = MC.today ? MC.today() : new Date().toISOString().slice(0, 10);
    if ($('lo-rule')) $('lo-rule').innerHTML = Number.isFinite(n) && n >= 2 ? '<b>' + (n - 1) + ' paid haircuts</b>, then visit <b>' + n + '</b> earns a <b>free hair wash 🚿</b>. The queue marks a child as “Free wash” once they hold ' + (n - 1) + ' stamps.' : 'Enter the number of visits (1 to 20).';
    if ($('lo-exp') && Number.isFinite(v.boyMonths) && Number.isFinite(v.girlMonths)) $('lo-exp').innerHTML = 'Example: a passport whose first stamp is today (' + MC.fmtDate(today) + ') expires on <b>' + MC.fmtDate(L.expiryFor('boy', today, v)) + '</b> for a boy and <b>' + MC.fmtDate(L.expiryFor('girl', today, v)) + '</b> for a girl. Changing validity applies to stamps given from now on; existing passports keep their dates.';
  };
  L.msg = function (t, cls) { const m = $('lo-msg'); if (!m) return; m.style.display = t ? 'block' : 'none'; m.textContent = t; m.className = 'sm ' + (cls || ''); };
  L.review = function () {
    const v = L.collect(), bad = L.validate(v); if (bad.length) return L.msg(bad.join(' · '), 'err');
    const ch = L.diff(L.st.saved, v); if (!ch.length) return L.msg('Nothing changed.', 'err');
    const rows = ch.map(c => '<div class="lo-df"><div><b>' + e(c.label) + '</b></div><i>' + (c.text ? 'text' : e(c.from)) + '</i><div>' + (c.text ? 'changed' : '<b>' + e(c.to) + '</b>') + '</div></div>').join('');
    const ov = MC.modal('<div style="font:800 18px var(--fh);color:var(--bd);margin-bottom:6px;">Save loyalty rules?</div><div style="font-size:12.5px;color:var(--muted);margin-bottom:10px;">This changes the rules for the queue, the customer passport and the Loyalty app — everything uses the same settings. Nothing else in the saved configuration is touched.</div>' + rows + '<div style="display:flex;gap:8px;margin-top:14px;"><button class="btn btn-ghost" id="lo-no">Cancel</button><button class="btn btn-y" id="lo-yes" style="flex:1;">Yes, save</button></div>', { width: 440 });
    ov.querySelector('#lo-no').onclick = () => ov.close();
    ov.querySelector('#lo-yes').onclick = async () => { ov.querySelector('#lo-yes').disabled = true; ov.querySelector('#lo-yes').textContent = 'Saving…'; try { await L.save(v); ov.close(); } catch (err) { ov.close(); L.msg('Could not save: ' + err.message, 'err'); } };
  };
  L.save = async function (v) {
    const bad = L.validate(v); if (bad.length) throw new Error(bad[0]);
    const cur = (await MC.getConfig('loyalty_config')) || {};            // re-read right before writing: keeps credentials + anything changed elsewhere
    const next = L.merge(cur, v);
    await MC.setConfig('loyalty_config', next);
    try { if (typeof LCFG !== 'undefined') LCFG = Object.assign({}, next); } catch (x) { /* read-only global */ }
    L.st.raw = next; L.st.saved = L.read(next);
    if (MC.customers && MC.customers.st) MC.customers.st.loadedAt = 0;
    if (typeof refreshRewardBadges === 'function') refreshRewardBadges(true);
    if (typeof toast === 'function') toast('Loyalty rules saved — applied everywhere', 'ok');
    L.fill(L.st.saved); L.msg('Saved ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '. The queue, Free wash list and customer screens now use these rules.', 'ok');
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = L;
})(typeof window !== 'undefined' ? window : globalThis);
