/* ============================================================================
 * mc-appointments.js — Appointment booking + staff calendar
 * Slot length comes from Salon Setup (salon_services.duration). Availability =
 * salon hours ∩ stylist shift − days off − approved leave − roster events − existing bookings.
 * Pure functions (A.slots, A.freeStylists, …) are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const A = MC.appt = MC.appt || {};

  A.DEFAULT_CFG = {
    slot: 15, buffer: 0, leadMin: 30, windowDays: 30,
    /* index 0 = Sunday … 6 = Saturday. Weekends are walk-in only (matches the Zen opening-hours note). */
    days: [0, 1, 2, 3, 4, 5, 6].map(d => ({ open: '10:00', close: '20:00', appts: !(d === 0 || d === 6) })),
    shifts: {}                       // optional per-stylist override: { "Lester": { "1": ["12:00","20:00"] } }
  };
  A.normCfg = function (c) {
    c = c || {};
    const d = A.DEFAULT_CFG;
    const days = d.days.map((x, i) => Object.assign({}, x, (c.days || [])[i] || {}));
    return { slot: Math.max(5, +c.slot || d.slot), buffer: Math.max(0, +c.buffer || 0), leadMin: c.leadMin != null ? Math.max(0, +c.leadMin) : d.leadMin,
      windowDays: Math.max(1, +c.windowDays || d.windowDays), days, shifts: c.shifts || {} };
  };

  /* ── pure logic ───────────────────────────────────────────────────────── */
  A.dow = ymd => MC.parseYmd(ymd).getDay();
  /* working window [startMin,endMin] for one stylist on a date, or null if not bookable */
  A.window = function (cfg, stylist, ymd, leaves, roster) {
    const dow = A.dow(ymd), day = cfg.days[dow];
    if (!day || !day.appts) return null;
    if ((stylist.off_days || []).map(Number).includes(dow)) return null;
    if ((leaves || []).some(l => l.staff_id === stylist.id && l.status !== 'rejected' && l.status !== 'cancelled' && ymd >= l.from_date && ymd <= l.to_date)) return null;
    if ((roster || []).some(e => (e.staff_id === stylist.id || !e.staff_id) && ymd >= e.from_date && ymd <= (e.to_date || e.from_date) && ['vacation', 'public_holiday', 'compoff'].includes(e.type))) return null;
    let s = MC.toMin(day.open), e = MC.toMin(day.close);
    const ov = (cfg.shifts[stylist.name] || {})[dow];
    if (ov && ov.length === 2) { s = Math.max(s, MC.toMin(ov[0])); e = Math.min(e, MC.toMin(ov[1])); }
    return s != null && e != null && e > s ? [s, e] : null;
  };
  A.busy = (appts, name, ymd) => (appts || []).filter(a => a.stylist === name && a.appt_date === ymd && (a.status === 'booked' || a.status === 'arrived'))
    .map(a => [MC.toMin(a.start_time), MC.toMin(a.end_time)]);
  A.overlaps = (busy, s, e) => busy.some(b => s < b[1] && e > b[0]);

  /* free start times for one stylist */
  A.stylistSlots = function (o) {
    const w = A.window(o.cfg, o.stylist, o.date, o.leaves, o.roster);
    if (!w) return [];
    const busy = A.busy(o.appts, o.stylist.name, o.date).filter(b => !(o.ignoreId && b.id === o.ignoreId));
    const out = [];
    const minStart = o.nowMin != null ? o.nowMin + o.cfg.leadMin : -1;
    for (let t = w[0]; t + o.durationMin <= w[1]; t += o.cfg.slot) {
      if (t < minStart) continue;
      if (!A.overlaps(busy, t, t + o.durationMin)) out.push(t);
    }
    return out;
  };
  /* all slots across stylists: [{start:'10:15', stylists:['Lester','George']}] */
  A.slots = function (o) {
    const map = {};
    (o.stylists || []).forEach(st => {
      if (o.only && o.only !== st.name) return;
      A.stylistSlots(Object.assign({}, o, { stylist: st })).forEach(t => { (map[t] = map[t] || []).push(st.name); });
    });
    return Object.keys(map).map(Number).sort((a, b) => a - b).map(t => ({ start: MC.fromMin(t), stylists: map[t] }));
  };

  /* ── data ─────────────────────────────────────────────────────────────── */
  A.state = { cfg: null, staff: [], leaves: [], roster: [], services: [], appts: [], date: null, loaded: false };
  A.loadCfg = async function () { A.state.cfg = A.normCfg(await MC.getConfig('booking_config').catch(() => null)); return A.state.cfg; };
  A.loadStaff = async function () {
    const g = (t, q) => MC.sb(t, 'GET', null, q).catch(e => { console.warn(t, e.message); return []; });
    const [st, lv, ro, sv] = await Promise.all([
      g('staff', 'select=*&limit=500'), g('staff_leaves', 'select=*&limit=2000'), g('staff_roster', 'select=*&limit=2000'),
      g('salon_services', 'select=id,name,gender,price,duration,status&order=gender.asc,name.asc&limit=1000')
    ]);
    const rolesOk = x => !x.role || /stylist|barber|hair/i.test(x.role);
    A.state.staff = st.filter(x => rolesOk(x) && x.status !== 'inactive' && x.active !== false)
      .map(x => Object.assign({}, x, { off_days: Array.isArray(x.off_days) ? x.off_days : (typeof x.off_days === 'string' ? JSON.parse(x.off_days || '[]') : []) }));
    A.state.leaves = lv; A.state.roster = ro;
    const seen = {};
    A.state.services = sv.filter(s => String(s.status || 'active').toLowerCase() !== 'inactive').filter(s => {
      const k = String(s.name || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + String(s.gender || '').trim().toLowerCase() + '|' + Number(s.price);
      if (seen[k]) return false; seen[k] = 1; return true;
    });
  };
  A.loadDay = async function (ymd) {
    A.state.appts = await MC.sb('appointments', 'GET', null, 'appt_date=eq.' + ymd + '&order=start_time.asc&limit=500');
  };
  A.svcDuration = s => (+s.duration > 0 ? +s.duration : 30);

  /* ── calendar page ────────────────────────────────────────────────────── */
  A.init = async function () {
    const el = document.getElementById('mc-appt-root'); if (!el) return;
    if (!A.state.date) A.state.date = MC.today();
    el.innerHTML = '<div style="padding:24px;color:var(--muted);">Loading…</div>';
    try {
      if (!A.state.cfg) await A.loadCfg();
      await A.loadStaff();
      await A.loadDay(A.state.date);
      A.render();
    } catch (e) {
      el.innerHTML = '<div class="card"><b>Appointments not ready.</b><div style="font-size:13px;color:var(--muted);margin-top:6px;">' + MC.esc(/appointments|42P01|PGRST/.test(e.message) ? 'Run sql/001_billing_and_appointments.sql in Supabase, then reload the schema.' : e.message) + '</div></div>';
    }
  };
  /* Previous / next / pick a date. If the day fails to load, the page says so (and keeps the old day) instead of looking dead. */
  A.go = async function (d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d || ''))) return;
    const prev = A.state.date, prevAppts = A.state.appts;
    try { A.state.date = d; await A.loadDay(d); A.render(); }
    catch (e) {
      console.error('Appointments: could not open ' + d, e);
      A.state.date = prev; A.state.appts = prevAppts;
      try { A.render(); } catch (x) { /* keep the error banner below */ }
      const el = document.getElementById('mc-appt-root');
      if (el) el.insertAdjacentHTML('afterbegin', '<div class="card" style="background:#FEF2F2;border-color:#FCA5A5;color:#991B1B;font-size:13px;margin-bottom:10px;">Could not open ' + MC.esc(MC.fmtDate(d)) + ': ' + MC.esc(e.message || e) + '</div>');
    }
  };

  A.render = function () {
    const S = A.state, cfg = S.cfg, el = document.getElementById('mc-appt-root');
    const dow = A.dow(S.date), day = cfg.days[dow];
    const head = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<button class="btn btn-ghost btn-sm" onclick="MC.appt.go(MC.addDays(MC.appt.state.date,-1))">◀</button>' +
      '<input type="date" class="fi" style="width:auto;" value="' + S.date + '" onchange="MC.appt.go(this.value)"/>' +
      '<button class="btn btn-ghost btn-sm" onclick="MC.appt.go(MC.addDays(MC.appt.state.date,1))">▶</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="MC.appt.go(MC.today())">Today</button>' +
      '<div style="font-weight:800;color:var(--bd);">' + MC.parseYmd(S.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) + '</div>' +
      '<div style="flex:1"></div><button class="btn btn-y" onclick="MC.appt.openNew()">➕ New Appointment</button></div>';
    if (!day.appts) {
      el.innerHTML = head + '<div class="card" style="color:var(--muted);">Walk-in only on ' + MC.parseYmd(S.date).toLocaleDateString('en-GB', { weekday: 'long' }) + 's. Change this under Settings ▸ Appointments. Existing bookings for the day are listed below.</div>' + A.listHtml();
      return;
    }
    const open = MC.toMin(day.open), close = MC.toMin(day.close), step = cfg.slot;
    const cols = S.staff.map(st => ({ st, w: A.window(cfg, st, S.date, S.leaves, S.roster) }));
    if (!cols.length) { el.innerHTML = head + '<div class="card">No stylists found in Staff Mgmt.</div>'; return; }
    const covered = {}; // "name|min" -> true for rows swallowed by a rowspan
    let rows = '';
    for (let t = open; t < close; t += step) {
      rows += '<tr><td style="font-size:11px;color:var(--muted);white-space:nowrap;padding:2px 8px;vertical-align:top;">' + MC.fromMin(t) + '</td>';
      cols.forEach(c => {
        if (covered[c.st.name + '|' + t]) return;
        const a = S.appts.find(x => x.stylist === c.st.name && x.status !== 'cancelled' && MC.toMin(x.start_time) >= t && MC.toMin(x.start_time) < t + step);
        if (a) {
          const span = Math.max(1, Math.ceil((MC.toMin(a.end_time) - MC.toMin(a.start_time)) / step));
          for (let k = 1; k < span; k++) covered[c.st.name + '|' + (t + k * step)] = true;
          const col = { booked: '#DBEAFE', arrived: '#DCFCE7', no_show: '#FEE2E2' }[a.status] || '#EEE';
          rows += '<td rowspan="' + span + '" style="background:' + col + ';border:1px solid #fff;border-radius:8px;padding:5px 7px;font-size:12px;cursor:pointer;vertical-align:top;" onclick="MC.appt.openAppt(\'' + a.id + '\')"><b>' + MC.esc(a.customer_name) + '</b><br>' + MC.esc(a.service) + '<br><span style="color:var(--muted);">' + a.start_time.slice(0, 5) + '–' + a.end_time.slice(0, 5) + (a.status !== 'booked' ? ' · ' + a.status.replace('_', ' ') : '') + '</span></td>';
        } else if (c.w && t >= c.w[0] && t < c.w[1]) {
          rows += '<td style="border:1px dashed #E5E7EB;cursor:pointer;text-align:center;color:#CBD5E1;font-size:12px;" onclick="MC.appt.openNew(\'' + c.st.name.replace(/'/g, "\\'") + '\',\'' + MC.fromMin(t) + '\')">+</td>';
        } else rows += '<td style="background:#F1F5F9;"></td>';
      });
      rows += '</tr>';
    }
    el.innerHTML = head + '<div style="overflow:auto;"><table style="border-collapse:separate;border-spacing:2px;width:100%;min-width:' + (60 + cols.length * 130) + 'px;"><thead><tr><th></th>' +
      cols.map(c => '<th style="font-size:13px;padding:6px;background:' + (c.w ? '#EEF6FF' : '#F1F5F9') + ';border-radius:8px;">' + MC.esc(c.st.name) + (c.w ? '' : '<div style="font-size:10px;color:var(--muted);font-weight:600;">off</div>') + '</th>').join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  };
  A.listHtml = function () {
    const l = A.state.appts.filter(a => a.status !== 'cancelled');
    return l.length ? '<div class="card" style="margin-top:10px;">' + l.map(a => '<div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="MC.appt.openAppt(\'' + a.id + '\')">' + a.start_time.slice(0, 5) + ' · <b>' + MC.esc(a.customer_name) + '</b> · ' + MC.esc(a.service) + ' · ' + MC.esc(a.stylist) + '</div>').join('') + '</div>' : '';
  };

  /* ── new appointment ──────────────────────────────────────────────────── */
  A.openNew = function (stylist, time, prefill) {
    const S = A.state;
    const svcOpts = S.services.map(s => '<option value="' + MC.esc(s.id) + '">' + MC.esc(s.name) + (s.gender ? ' (' + MC.esc(s.gender) + ')' : '') + ' · ' + A.svcDuration(s) + ' min</option>').join('');
    const ov = MC.modal(
      '<div style="font-family:var(--fh);font-size:19px;font-weight:800;color:var(--bd);margin-bottom:12px;">➕ New Appointment</div><div style="display:grid;gap:11px;">' +
      '<div id="ma-cust"><div id="ma-find">' + MC.lbl('Customer') + '<input id="ma-q" class="fi" type="search" autocomplete="off" placeholder="🔍 Search by mobile number or child’s name"/><div id="ma-res" style="margin-top:6px;max-height:190px;overflow:auto;"></div></div>' +
      '<div id="ma-sel" style="display:none;"></div>' +
      '<div id="ma-new" style="display:none;border:1.5px dashed var(--border);border-radius:12px;padding:10px;margin-top:6px;"><div style="font-weight:800;margin-bottom:8px;">➕ New customer <span style="font-weight:600;color:var(--muted);font-size:12px;">— please take the details now</span></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"><div>' + MC.lbl('Mobile') + '<input id="mn-mob" class="fi" type="tel" placeholder="05x xxx xxxx"/></div><div>' + MC.lbl('Child name') + '<input id="mn-name" class="fi" type="text"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><div>' + MC.lbl('Boy / Girl') + '<div style="display:flex;gap:6px;"><button type="button" class="btn btn-sm btn-ghost" data-mg="boy">Boy</button><button type="button" class="btn btn-sm btn-ghost" data-mg="girl">Girl</button></div></div><div>' + MC.lbl('Parent (optional)') + '<input id="mn-par" class="fi" type="text"/></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><div>' + MC.lbl('Birthday 🎂') + '<input id="mn-dob" class="fi" type="date" max="' + MC.today() + '"/></div><div>' + MC.lbl('Area 📍') + '<select id="mn-loc" class="fi"><option value="">Select area…</option>' + MC.AREAS.map(a => '<option>' + MC.esc(a) + '</option>').join('') + '</select></div></div>' +
      '<div style="margin-top:8px;">' + MC.lbl('How did they hear about us?') + '<div style="display:flex;gap:6px;flex-wrap:wrap;">' + MC.HEARD.map(h => '<button type="button" class="btn btn-sm btn-ghost" data-mh="' + MC.esc(h) + '">' + MC.esc(h) + '</button>').join('') + '</div></div>' +
      '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:12.5px;font-weight:700;"><input type="checkbox" id="mn-tc" style="width:18px;height:18px;flex-shrink:0;"/><span>Parent has accepted the <a href="#" id="mn-tcview" style="color:var(--b);">T&amp;C</a></span></label>' +
      '<label style="display:flex;gap:6px;align-items:center;margin-top:8px;font-size:12px;color:var(--muted);"><input type="checkbox" id="mn-skip"/> Caller does not know yet — ask on arrival instead</label>' +
      '<div id="mn-msg" style="display:none;margin-top:8px;font-size:12.5px;font-weight:700;color:#DC2626;"></div><div style="display:flex;gap:8px;margin-top:10px;"><button type="button" class="btn btn-ghost btn-sm" id="mn-cancel">Back</button><button type="button" class="btn btn-y btn-sm" id="mn-save" style="flex:1;">Save customer</button></div></div></div>' +
      '<div>' + MC.lbl('Service') + '<select id="ma-svc" class="fi"></select></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div>' + MC.lbl('Date') + '<input id="ma-date" class="fi" type="date" value="' + S.date + '"/></div><div>' + MC.lbl('Stylist') + '<select id="ma-sty" class="fi"><option value="">Any available</option>' + S.staff.map(s => '<option>' + MC.esc(s.name) + '</option>').join('') + '</select></div></div>' +
      '<div>' + MC.lbl('Time') + '<div id="ma-slots" style="display:flex;flex-wrap:wrap;gap:6px;max-height:150px;overflow:auto;"></div></div>' +
      '<div>' + MC.lbl('Note (optional)') + '<input id="ma-note" class="fi" type="text"/></div></div>' +
      '<div id="ma-msg" style="display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:700;background:#FEE2E2;color:#DC2626;"></div>' +
      '<div style="display:flex;gap:9px;margin-top:14px;"><button class="btn btn-ghost" id="ma-cancel" style="padding:10px 16px;">Cancel</button><button class="btn btn-y" id="ma-save" style="flex:1;padding:12px;font-size:15px;">Book</button></div>', { width: 480 });
    const $ = id => ov.querySelector('#' + id);
    let pick = null, cache = [], reqId = 0;
    if (stylist) $('ma-sty').value = stylist;
    const refreshSlots = async () => {
      const d = $('ma-date').value, svc = S.services.find(x => String(x.id) === $('ma-svc').value);
      if (!d || !svc) return;
      const my = ++reqId;
      const day = await MC.sb('appointments', 'GET', null, 'appt_date=eq.' + d + '&limit=500').catch(() => []);
      if (my !== reqId) return;     // a newer selection is already being computed
      const isToday = d === MC.today(), now = new Date();
      cache = A.slots({ date: d, durationMin: A.svcDuration(svc) + S.cfg.buffer, cfg: S.cfg, stylists: S.staff, leaves: S.leaves, roster: S.roster, appts: day,
        only: $('ma-sty').value || null, nowMin: isToday ? now.getHours() * 60 + now.getMinutes() : null });
      if (pick && !cache.find(c => c.start === pick)) pick = null;
      if (time && !pick && cache.find(c => c.start === time)) { pick = time; time = null; }
      $('ma-slots').innerHTML = cache.length ? cache.map(c => '<button type="button" class="btn btn-sm ' + (c.start === pick ? 'btn-y' : 'btn-ghost') + '" data-t="' + c.start + '">' + c.start + '</button>').join('')
        : '<span style="color:var(--muted);font-size:13px;">' + (S.cfg.days[A.dow(d)].appts ? 'No free slots this day.' : 'Walk-in only on this day.') + '</span>';
      $('ma-slots').querySelectorAll('button').forEach(b => b.onclick = () => { pick = b.dataset.t; refreshSlotsPaint(); });
    };
    const refreshSlotsPaint = () => $('ma-slots').querySelectorAll('button').forEach(b => { const on = b.dataset.t === pick; b.classList.toggle('btn-y', on); b.classList.toggle('btn-ghost', !on); });
    ['ma-date', 'ma-svc', 'ma-sty'].forEach(id => $(id).addEventListener('change', refreshSlots));
    /* ── customer: search existing, or add new quickly ── */
    let cust = null, sreq = 0, newGender = null, newHeard = null, stimer = null;
    const clean = t => String(t || '').replace(/[,()*%\\]/g, ' ').trim();
    const norm = t => { t = String(t || '').trim().toLowerCase(); return t.startsWith('boy') ? 'boy' : t.startsWith('girl') ? 'girl' : ''; };
    const gOf = c => norm(c && c.gender);
    const renderSvc = () => {
      const g = gOf(cust), list = S.services.filter(x => !g || !norm(x.gender) || norm(x.gender) === g);
      const keep = $('ma-svc').value;
      $('ma-svc').innerHTML = (list.length ? list : S.services).map(x => '<option value="' + MC.esc(x.id) + '">' + MC.esc(x.name) + (x.gender ? ' (' + MC.esc(x.gender) + ')' : '') + ' · ' + A.svcDuration(x) + ' min</option>').join('');
      if (keep && $('ma-svc').querySelector('option[value="' + CSS.escape(keep) + '"]')) $('ma-svc').value = keep;
      refreshSlots();
    };
    const showSel = () => {
      const gaps = cust ? MC.allGaps(cust) : [];
      $('ma-find').style.display = cust ? 'none' : 'block'; $('ma-new').style.display = 'none';
      $('ma-sel').style.display = cust ? 'block' : 'none';
      if (cust) $('ma-sel').innerHTML = '<div style="display:flex;align-items:center;gap:8px;background:#F0FDF4;border-radius:10px;padding:8px 10px;"><div style="flex:1;"><b>' + MC.esc(cust.name) + '</b> <span style="color:var(--muted);">(' + (gOf(cust) || '?') + ')</span><div style="font-size:12px;color:var(--muted);">📱 ' + MC.esc(cust.mobile) + (cust.parent ? ' · ' + MC.esc(cust.parent) : '') + '</div>' +
        (gaps.length ? '<div style="font-size:11.5px;color:#B45309;">⚠ Missing: ' + gaps.map(x => MC.GAP_LABEL[x]).join(', ') + ' — will be asked on arrival</div>' : '') + '</div><button type="button" class="btn btn-ghost btn-sm" id="ma-change">Change</button></div>';
      if (cust) $('ma-change').onclick = () => { cust = null; showSel(); renderSvc(); $('ma-q').focus(); };
      if (cust && gaps.length) { const fb = document.createElement('button'); fb.type = 'button'; fb.className = 'btn btn-y btn-sm'; fb.textContent = '📝 Fill now'; fb.style.marginTop = '6px';
        fb.onclick = async () => { await MC.profileDialog([cust], { allowSkip: true, tc: true, sub: 'Complete ' + cust.name + '’s profile' }); showSel(); };
        $('ma-sel').firstChild.firstChild.appendChild(fb); }
      renderSvc();
    };
    const pickCust = c => { cust = c; $('ma-res').innerHTML = ''; showSel(); };
    const openNewForm = (mob, name, par, famRows) => {
      $('ma-find').style.display = 'none'; $('ma-new').style.display = 'block';
      $('mn-mob').value = mob || ''; $('mn-name').value = name || ''; $('mn-par').value = par || ''; newGender = null; newHeard = null; $('mn-dob').value = ''; $('mn-loc').value = ''; $('mn-skip').checked = false; $('mn-tc').checked = false; $('mn-msg').style.display = 'none';
      ov.querySelectorAll('[data-mh]').forEach(b => { b.classList.add('btn-ghost'); b.classList.remove('btn-y'); });
      ov.querySelectorAll('[data-mg]').forEach(b => { b.classList.add('btn-ghost'); b.classList.remove('btn-y'); });
      /* a sibling's area / source is reused, the rest is typed in */
      const sl = (famRows || []).find(c => c.location), sh = (famRows || []).find(c => c.heard_via);
      if (sl) $('mn-loc').value = sl.location;
      if ((famRows || []).some(c => c.tc_accepted === true)) $('mn-tc').checked = true;
      if (sh) { newHeard = sh.heard_via; ov.querySelectorAll('[data-mh]').forEach(b => { const on = b.dataset.mh === newHeard; b.classList.toggle('btn-y', on); b.classList.toggle('btn-ghost', !on); }); }
      ($('mn-mob').value ? $('mn-name') : $('mn-mob')).focus();
    };
    const search = async () => {
      const raw = clean($('ma-q').value), my = ++sreq, res = $('ma-res');
      if (raw.length < 2) { res.innerHTML = ''; return; }
      const digits = raw.replace(/\D/g, ''), isNum = digits.length >= 3 && digits.length >= raw.replace(/\s/g, '').length - 1;
      const where = isNum ? 'mobile=ilike.*' + (digits.length > 9 ? digits.slice(-9) : digits.replace(/^0+/, '')) + '*' : 'or=(name.ilike.*' + encodeURIComponent(raw) + '*,parent.ilike.*' + encodeURIComponent(raw) + '*)';
      res.innerHTML = '<div style="color:var(--muted);font-size:13px;">Searching…</div>';
      let rows = [];
      try { rows = await MC.sb('customers', 'GET', null, 'select=id,name,mobile,parent,gender,dob,location,heard_via,tc_accepted&' + where + '&order=name&limit=40'); } catch (e) { if (my === sreq) res.innerHTML = '<div style="color:#DC2626;font-size:13px;">Search failed: ' + MC.esc(e.message) + '</div>'; return; }
      if (my !== sreq) return;
      const fam = {}; rows.forEach(r => { (fam[MC.last9(r.mobile)] = fam[MC.last9(r.mobile)] || []).push(r); });
      const keys = Object.keys(fam);
      res.innerHTML = keys.map(k => { const f = fam[k]; return '<div style="border:1.5px solid var(--border);border-radius:10px;padding:8px;margin-bottom:6px;"><div style="font-size:12px;color:var(--muted);margin-bottom:5px;">📱 ' + MC.esc(f[0].mobile) + (f[0].parent ? ' · ' + MC.esc(f[0].parent) : '') + '</div><div style="display:flex;flex-wrap:wrap;gap:6px;">' +
          f.map(c => '<button type="button" class="btn btn-sm btn-b" data-cid="' + c.id + '">' + (gOf(c) === 'girl' ? '👧' : '👦') + ' ' + MC.esc(c.name) + '</button>').join('') +
          '<button type="button" class="btn btn-sm btn-ghost" data-addto="' + k + '">＋ another child</button></div></div>'; }).join('') +
        '<button type="button" class="btn btn-ghost btn-sm btn-full" id="ma-addnew">➕ ' + (keys.length ? 'Not listed? Add as new customer' : 'No match — add new customer') + '</button>';
      res.querySelectorAll('[data-cid]').forEach(b => b.onclick = () => pickCust(rows.find(r => r.id === b.dataset.cid)));
      res.querySelectorAll('[data-addto]').forEach(b => b.onclick = () => { const f = fam[b.dataset.addto]; openNewForm(f[0].mobile, '', f[0].parent, f); });
      res.querySelector('#ma-addnew').onclick = () => openNewForm(isNum ? raw : '', isNum ? '' : raw, '');
    };
    $('ma-q').addEventListener('input', () => { clearTimeout(stimer); stimer = setTimeout(search, 250); });
    ov.querySelectorAll('[data-mh]').forEach(b => b.onclick = () => { newHeard = b.dataset.mh; ov.querySelectorAll('[data-mh]').forEach(x => { const on = x === b; x.classList.toggle('btn-y', on); x.classList.toggle('btn-ghost', !on); }); });
    ov.querySelectorAll('[data-mg]').forEach(b => b.onclick = () => { newGender = b.dataset.mg; ov.querySelectorAll('[data-mg]').forEach(x => { const on = x === b; x.classList.toggle('btn-y', on); x.classList.toggle('btn-ghost', !on); }); });
    $('mn-tcview').onclick = e => { e.preventDefault(); MC.showTC(); };
    $('mn-cancel').onclick = () => { $('ma-new').style.display = 'none'; $('ma-find').style.display = 'block'; };
    $('mn-save').onclick = async () => {
      const m = $('mn-msg'), fail = t => { m.textContent = t; m.style.display = 'block'; };
      const l9 = MC.last9($('mn-mob').value), name = $('mn-name').value.trim().replace(/\s+/g, ' ');
      if (l9.length !== 9) return fail('Enter a valid UAE mobile number (9 digits after 0, e.g. 050 123 4567).');
      if (!name) return fail('Enter the child’s name.');
      if (!newGender) return fail('Choose boy or girl.');
      const skip = $('mn-skip').checked, dobV = $('mn-dob').value, locV = $('mn-loc').value;
      if (dobV && dobV > MC.today()) return fail('Birthday cannot be in the future.');
      if (!skip && !dobV) return fail('Enter the birthday — or tick “ask on arrival”.');
      if (!skip && !locV) return fail('Select the area — or tick “ask on arrival”.');
      if (!skip && !newHeard) return fail('Tap how they heard about us — or tick “ask on arrival”.');
      if (!skip && !$('mn-tc').checked) return fail('Tick the T&C box once the parent has accepted — or tick “ask on arrival”.');
      $('mn-save').disabled = true;
      try {
        const fam = await MC.sb('customers', 'GET', null, 'select=id,name,mobile,parent,gender,dob,location,heard_via,tc_accepted&mobile=ilike.*' + l9 + '&limit=50');
        const dup = fam.find(c => c.name.trim().toLowerCase() === name.toLowerCase());
        if (dup) { toast(name + ' is already registered under this number — selected'); return pickCust(dup); }
        const sib = fam.find(c => c.location) || {}, sibH = fam.find(c => c.heard_via) || {}, sibP = fam.find(c => c.parent) || {};
        const row = { name, mobile: '971' + l9, parent: $('mn-par').value.trim() || sibP.parent || null, gender: newGender, dob: dobV || null, location: locV || sib.location || null, heard_via: newHeard || sibH.heard_via || null, tc_accepted: !skip && $('mn-tc').checked, tc_accepted_at: !skip && $('mn-tc').checked ? new Date().toISOString() : null,
          stamps: 0, redemptions: 0, game_points: 0, game_spins: 0 };
        const r = await MC.sb('customers', 'POST', row, null, 'return=representation');
        const made = Array.isArray(r) ? r[0] : r; if (!made || !made.id) throw new Error('Customer was not created');
        toast('Customer added'); pickCust(made);
      } catch (e) { fail(e.message); } finally { $('mn-save').disabled = false; }
    };
    $('ma-cancel').onclick = () => ov.close();
    $('ma-save').onclick = async () => {
      const msg = $('ma-msg'), fail = t => { msg.textContent = t; msg.style.display = 'block'; };
      const svc = S.services.find(x => String(x.id) === $('ma-svc').value);
      if (!cust) return fail('Search and select the customer, or add a new one.');
      if (!svc) return fail('Pick a service.');
      const name = cust.name, mob = cust.mobile;
      if (!pick) return fail('Pick a time.');
      const slot = cache.find(c => c.start === pick); if (!slot) return fail('That time is no longer free.');
      const sty = $('ma-sty').value || slot.stylists[0];
      if (!slot.stylists.includes(sty)) return fail(sty + ' is not free at ' + pick + '.');
      const dur = A.svcDuration(svc) + S.cfg.buffer;
      const btn = $('ma-save'); btn.disabled = true; btn.textContent = 'Booking…';
      try {
        /* re-check against the live table so two tablets cannot double-book */
        const fresh = await MC.sb('appointments', 'GET', null, 'appt_date=eq.' + $('ma-date').value + '&stylist=eq.' + encodeURIComponent(sty) + '&status=in.(booked,arrived)&limit=200');
        const s0 = MC.toMin(pick);
        if (A.overlaps(fresh.map(a => [MC.toMin(a.start_time), MC.toMin(a.end_time)]), s0, s0 + dur)) throw new Error('Someone just booked that slot — pick another.');
        await MC.sb('appointments', 'POST', { customer_id: cust.id, customer_name: name, mobile: mob, service_id: String(svc.id), service: svc.name, duration_min: dur,
          stylist: sty, appt_date: $('ma-date').value, start_time: pick, end_time: MC.fromMin(s0 + dur), notes: $('ma-note').value.trim() || null, source: 'staff', status: 'booked' }, null, 'return=minimal');
        ov.close(); toast('Appointment booked'); await A.go($('ma-date').value);
      } catch (e) { btn.disabled = false; btn.textContent = 'Book'; fail(e.message); }
    };
    if (prefill && prefill.id) { cust = prefill; showSel(); } else renderSvc();
    setTimeout(() => { if (!cust) $('ma-q').focus(); }, 50);
  };

  /* ── manage one appointment ───────────────────────────────────────────── */
  A.openAppt = function (id) {
    const a = A.state.appts.find(x => x.id === id); if (!a) return;
    const ov = MC.modal(
      '<div style="font-family:var(--fh);font-size:18px;font-weight:800;color:var(--bd);">' + MC.esc(a.customer_name) + '</div>' +
      '<div style="font-size:13px;color:var(--muted);margin:3px 0 12px;">' + MC.esc(a.service) + ' · ' + MC.esc(a.stylist) + '<br>' + MC.fmtDate(a.appt_date) + ' ' + a.start_time.slice(0, 5) + '–' + a.end_time.slice(0, 5) + ' · ' + MC.esc(a.mobile || '') + (a.notes ? '<br>📝 ' + MC.esc(a.notes) : '') + '</div>' +
      '<div style="display:grid;gap:8px;">' +
      (a.status === 'booked' ? '<button class="btn btn-g btn-full" id="mp-in" style="padding:12px;">✅ Customer arrived — add to queue</button>' : '') +
      (a.status === 'booked' ? '<div style="display:flex;gap:8px;"><button class="btn btn-ghost" id="mp-ns" style="flex:1;">No-show</button><button class="btn btn-ghost" id="mp-cx" style="flex:1;color:var(--err);">Cancel</button></div>' : '') +
      '<button class="btn btn-ghost" id="mp-close">Close</button></div>', { width: 380 });
    const set = async (patch, okMsg) => { try { await MC.sb('appointments', 'PATCH', Object.assign({ updated_at: new Date().toISOString() }, patch), 'id=eq.' + id, 'return=minimal'); ov.close(); toast(okMsg); A.go(A.state.date); } catch (e) { toast(e.message, 'err'); } };
    const $ = x => ov.querySelector('#' + x);
    $('mp-close').onclick = () => ov.close();
    if ($('mp-ns')) $('mp-ns').onclick = () => set({ status: 'no_show' }, 'Marked no-show');
    if ($('mp-cx')) $('mp-cx').onclick = () => set({ status: 'cancelled' }, 'Appointment cancelled');
    /* show what is still missing on the profile before the customer arrives, with a button to take it now */
    if (a.customer_id && a.status === 'booked') {
      const warn = document.createElement('div'); warn.style.cssText = 'font-size:12.5px;color:#B45309;background:#FFFBEB;border-radius:8px;padding:8px 10px;margin-bottom:8px;display:none;';
      const paint = kid => { const g = MC.allGaps(kid); if (!g.length) { warn.style.display = 'none'; return; }
        warn.style.display = 'block'; warn.innerHTML = '⚠ Profile missing: ' + g.map(x => MC.esc(MC.GAP_LABEL[x])).join(', ') + '<br><button type="button" class="btn btn-y btn-sm" id="mp-fill" style="margin-top:6px;">📝 Complete profile now (incl. T&amp;C)</button>';
        warn.querySelector('#mp-fill').onclick = async () => { await MC.profileDialog([kid], { allowSkip: true, tc: true, sub: 'Complete ' + kid.name + '’s profile' }); paint(kid); }; };
      ov.querySelector('.mc-box').insertBefore(warn, ov.querySelector('.mc-box').children[2] || null);
      MC.sb('customers', 'GET', null, 'select=id,name,gender,dob,location,heard_via,tc_accepted&id=eq.' + a.customer_id).then(r => { if (r[0] && ov.isConnected) paint(r[0]); }).catch(() => {});
    }
    if ($('mp-in')) $('mp-in').onclick = async () => {
      $('mp-in').disabled = true;
      try {
        const t = MC.today();
        /* 1. make sure the profile is complete BEFORE a token is issued (sibling details are reused silently) */
        if (a.customer_id) {
          const fam = await MC.sb('customers', 'GET', null, 'select=id,name,mobile,gender,dob,location,heard_via,tc_accepted&mobile=ilike.*' + MC.last9(a.mobile) + '&limit=50');
          const kid = fam.find(c => c.id === a.customer_id);
          if (kid) {
            const sibL = (fam.find(c => c.location) || {}).location, sibH = (fam.find(c => c.heard_via) || {}).heard_via, quiet = {};
            if (!kid.location && sibL) quiet.location = sibL; if (!kid.heard_via && sibH) quiet.heard_via = sibH;
            if (kid.tc_accepted !== true && fam.some(c => c.tc_accepted === true)) { quiet.tc_accepted = true; quiet.tc_accepted_at = new Date().toISOString(); }
            if (Object.keys(quiet).length) { await MC.sb('customers', 'PATCH', quiet, 'id=eq.' + kid.id, 'return=minimal'); Object.assign(kid, quiet); }
            if (MC.allGaps(kid).length) {
              const how = await MC.profileDialog([kid], { allowSkip: true, tc: true });
              if (how === 'skipped') toast('Profile left incomplete', 'err');
            }
          }
        }
        /* 2. never create a second token: they may already have checked in on the kiosk */
        let q = null;
        if (a.customer_id) { const ex0 = await MC.sb('queue', 'GET', null, 'select=id,token_number&customer_id=eq.' + a.customer_id + '&checkin_date=eq.' + t + '&status=in.(waiting,called)&limit=1'); q = ex0[0] || null; }
        if (q) { await MC.sb('queue', 'PATCH', { stylist: a.stylist, remark: 'Appointment ' + a.start_time.slice(0, 5) }, 'id=eq.' + q.id, 'return=minimal'); }
        else {
          const ex = await MC.sb('queue', 'GET', null, 'select=token_number&checkin_date=eq.' + t + '&order=token_number.desc&limit=1');
          const tok = (ex.length ? Number(ex[0].token_number) || 0 : 0) + 1;
          q = (await MC.sb('queue', 'POST', { customer_id: a.customer_id || null, customer_name: a.customer_name, mobile: a.mobile || null, service: a.service, token_number: tok,
            checkin_date: t, checkin_time: new Date().toISOString(), status: 'waiting', is_guest: !a.customer_id, stylist: a.stylist, remark: 'Appointment ' + a.start_time.slice(0, 5) }))[0];
        }
        await MC.sb('appointments', 'PATCH', { status: 'arrived', queue_id: q.id, updated_at: new Date().toISOString() }, 'id=eq.' + id, 'return=minimal');
        ov.close(); toast('Added to queue as Token ' + MC.pad(q.token_number)); A.go(A.state.date);
        if (typeof loadQ === 'function') loadQ();
      } catch (e) { $('mp-in').disabled = false; toast(e.message, 'err'); }
    };
  };

  /* ── settings card ────────────────────────────────────────────────────── */
  A.renderSettings = async function () {
    const el = document.getElementById('mc-settings-appt'); if (!el) return;
    await A.loadCfg();
    const c = A.state.cfg, names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    el.innerHTML = '<div class="card"><div class="card-title">📅 Appointments</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:6px 0 12px;">Service length comes from <b>Salon Setup ▸ Duration</b>. Days off and leave come from Staff Mgmt.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px;"><div>' + MC.lbl('Slot step (min)') + '<input class="fi" id="mca-slot" type="number" min="5" step="5" value="' + c.slot + '"/></div>' +
      '<div>' + MC.lbl('Buffer (min)') + '<input class="fi" id="mca-buf" type="number" min="0" step="5" value="' + c.buffer + '"/></div>' +
      '<div>' + MC.lbl('Notice (min)') + '<input class="fi" id="mca-lead" type="number" min="0" step="5" value="' + c.leadMin + '"/></div></div>' +
      '<table style="width:100%;font-size:13px;">' + c.days.map((d, i) => '<tr><td style="font-weight:800;width:40px;">' + names[i] + '</td><td><input type="checkbox" id="mca-on' + i + '" ' + (d.appts ? 'checked' : '') + '/> bookable</td><td><input type="time" class="fi" id="mca-o' + i + '" value="' + d.open + '" style="width:auto;"/></td><td><input type="time" class="fi" id="mca-c' + i + '" value="' + d.close + '" style="width:auto;"/></td></tr>').join('') + '</table>' +
      '<div id="mca-msg" class="sm" style="margin-top:8px;"></div><button class="btn btn-y btn-full" id="mca-save" style="margin-top:6px;">Save Appointment Settings ✅</button></div>';
    el.querySelector('#mca-save').onclick = async () => {
      const g = id => el.querySelector('#' + id), m = g('mca-msg');
      const days = c.days.map((_, i) => ({ appts: g('mca-on' + i).checked, open: g('mca-o' + i).value || '10:00', close: g('mca-c' + i).value || '20:00' }));
      if (days.some(d => MC.toMin(d.close) <= MC.toMin(d.open))) { m.className = 'sm err'; m.textContent = 'Closing time must be after opening time.'; return; }
      try { await MC.setConfig('booking_config', { slot: +g('mca-slot').value || 15, buffer: +g('mca-buf').value || 0, leadMin: +g('mca-lead').value || 0, windowDays: c.windowDays, days, shifts: c.shifts }); A.state.cfg = null; m.className = 'sm ok'; m.textContent = 'Saved.'; }
      catch (e) { m.className = 'sm err'; m.textContent = 'Save failed: ' + e.message; }
    };
    // ── Staff working hours card ─────────────────────────────────────────
    el.insertAdjacentHTML('beforeend', '<div id="sf-card-wrap"><div class="card" style="margin-top:16px;"><div class="card-title">👥 Staff Working Hours</div><div style="font-size:13px;color:var(--muted);padding:8px 0;">Loading stylists…</div></div></div>');
    try {
      const raw = await MC.sb('staff', 'GET', null, 'select=*&order=name.asc&limit=500');
      const ok = x => (!x.role || /stylist|barber|hair/i.test(x.role)) && x.status !== 'inactive' && x.active !== false;
      const sfList = (raw || []).filter(ok).map(x => Object.assign({}, x, {
        off_days: Array.isArray(x.off_days) ? x.off_days.map(Number)
          : (typeof x.off_days === 'string' ? JSON.parse(x.off_days || '[]').map(Number) : [])
      }));
      A._sfState = { staff: sfList, cfg: c, names };
      const wrap = document.getElementById('sf-card-wrap');
      if (wrap) wrap.outerHTML = A._sfCardHtml(sfList, c, names);
    } catch (e) {
      const wrap = document.getElementById('sf-card-wrap');
      if (wrap) wrap.innerHTML = '<div class="card" style="margin-top:16px;"><div class="card-title">👥 Staff Working Hours</div><div style="font-size:13px;color:var(--err,#dc2626);">Could not load staff: ' + MC.esc(String(e.message || e)) + '</div></div>';
    }
  };

  /* ── staff shift helpers ──────────────────────────────────────────────── */
  A._sfState = {};

  A._sfCardHtml = function (staff, c, names) {
    if (!staff.length) return '<div id="sf-card-wrap"><div class="card" style="margin-top:16px;"><div class="card-title">👥 Staff Working Hours</div><p style="font-size:13px;color:var(--muted);">No active stylists found. Add stylists in Staff Mgmt first.</p></div></div>';
    const rows = staff.map(s => '<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">' +
      '<div style="font-size:13px;font-weight:700;min-width:90px;">' + MC.esc(s.name) + '</div>' +
      '<div style="font-size:11.5px;color:var(--muted);flex:1;">' + A._sfSummary(s, c, names) + '</div>' +
      '<button class="btn btn-sm btn-ghost" onclick="MC.appt._openShiftEditor(\'' + MC.esc(String(s.id)) + '\')">Edit ✏️</button></div>').join('');
    return '<div id="sf-card-wrap"><div class="card" style="margin-top:16px;">' +
      '<div class="card-title">👥 Staff Working Hours</div>' +
      '<p style="font-size:12px;color:var(--muted);margin:4px 0 10px;">Set each stylist\'s daily start and end times. Appointments are only offered within these windows.</p>' +
      rows + '</div></div>';
  };

  A._sfSummary = function (staff, c, names) {
    const shifts = (c.shifts || {})[staff.name] || {};
    const parts = [];
    for (let d = 0; d < 7; d++) {
      if (!c.days[d] || !c.days[d].appts) continue;
      if ((staff.off_days || []).includes(d)) { parts.push(names[d] + ': Off'); continue; }
      const ov = shifts[d] || shifts[String(d)];
      parts.push(names[d] + ' ' + ((ov && ov[0]) || c.days[d].open) + '–' + ((ov && ov[1]) || c.days[d].close));
    }
    return parts.length ? parts.join(' · ') : '<em>No bookable days configured</em>';
  };

  A._openShiftEditor = function (staffId) {
    const s = (A._sfState.staff || []).find(x => String(x.id) === String(staffId));
    if (!s) return;
    const c = A._sfState.cfg, names = A._sfState.names;
    const shifts = (c.shifts || {})[s.name] || {};
    const dayRows = names.map(function (nm, d) {
      if (!c.days[d] || !c.days[d].appts) {
        return '<tr><td style="font-weight:700;width:40px;font-size:12.5px;color:var(--muted);padding:6px 4px;">' + nm + '</td>' +
          '<td colspan="3" style="font-size:12px;color:var(--muted);font-style:italic;padding:6px 0;">Walk-in only (no appointments)</td></tr>';
      }
      const isOff = (s.off_days || []).includes(d);
      const ov = shifts[d] || shifts[String(d)];
      const sv = (ov && ov[0]) || c.days[d].open, ev = (ov && ov[1]) || c.days[d].close;
      return '<tr style="border-bottom:1px solid var(--border);">' +
        '<td style="font-weight:700;width:40px;font-size:12.5px;padding:8px 4px 8px 0;">' + nm + '</td>' +
        '<td style="padding:8px 8px 8px 0;"><label style="display:flex;align-items:center;gap:5px;cursor:pointer;font-size:12.5px;white-space:nowrap;">' +
        '<input type="checkbox" id="sfed-w' + d + '"' + (!isOff ? ' checked' : '') + '> Working</label></td>' +
        '<td style="padding:8px 4px;"><input class="fi" id="sfed-s' + d + '" type="time" value="' + sv + '" style="width:auto;font-size:12px;"' + (isOff ? ' disabled' : '') + '></td>' +
        '<td style="padding:8px 0 8px 4px;"><input class="fi" id="sfed-e' + d + '" type="time" value="' + ev + '" style="width:auto;font-size:12px;"' + (isOff ? ' disabled' : '') + '></td></tr>';
    }).join('');
    const old = document.getElementById('sfed-overlay'); if (old) old.remove();
    const ov = document.createElement('div');
    ov.id = 'sfed-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px;';
    ov.innerHTML = '<div style="background:var(--bg,#fff);border-radius:14px;padding:22px 20px;width:100%;max-width:420px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.3);">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<span style="font-size:15px;font-weight:800;">✂️ ' + MC.esc(s.name) + '</span>' +
      '<button class="btn btn-sm btn-ghost" id="sfed-close">✕</button></div>' +
      '<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Set daily working hours. Appointments are only offered within these windows.</p>' +
      '<table style="width:100%;border-collapse:collapse;">' + dayRows + '</table>' +
      '<div id="sfed-err" style="font-size:12.5px;color:var(--err,#dc2626);min-height:18px;margin-top:8px;"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end;">' +
      '<button class="btn btn-ghost btn-sm" id="sfed-cancel">Cancel</button>' +
      '<button class="btn btn-y btn-sm" id="sfed-savebtn">Save Schedule ✅</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('#sfed-close').onclick = function () { ov.remove(); };
    ov.querySelector('#sfed-cancel').onclick = function () { ov.remove(); };
    ov.querySelector('#sfed-savebtn').onclick = function () { A._saveStaffShift(staffId, ov); };
    for (var i = 0; i < 7; i++) {
      (function (day) {
        var wEl = ov.querySelector('#sfed-w' + day);
        if (!wEl) return;
        wEl.addEventListener('change', function () {
          var on = wEl.checked;
          ['sfed-s', 'sfed-e'].forEach(function (p) { var inp = ov.querySelector('#' + p + day); if (inp) inp.disabled = !on; });
        });
      })(i);
    }
  };

  A._saveStaffShift = async function (staffId, ov) {
    const s = (A._sfState.staff || []).find(x => String(x.id) === String(staffId));
    if (!s) return;
    const c = A._sfState.cfg;
    const btn = ov.querySelector('#sfed-savebtn'), err = ov.querySelector('#sfed-err');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    if (err) err.textContent = '';
    try {
      const newOffDays = [], newShifts = {};
      for (let d = 0; d < 7; d++) {
        const wEl = ov.querySelector('#sfed-w' + d); if (!wEl) continue; // salon closed day
        const working = wEl.checked;
        const start = (ov.querySelector('#sfed-s' + d) || {}).value || c.days[d].open;
        const end   = (ov.querySelector('#sfed-e' + d) || {}).value || c.days[d].close;
        if (!working) {
          newOffDays.push(d);
        } else if (start !== c.days[d].open || end !== c.days[d].close) {
          if (MC.toMin(start) >= MC.toMin(end)) {
            if (err) err.textContent = 'End time must be after start on ' + A._sfState.names[d] + '.';
            if (btn) { btn.disabled = false; btn.textContent = 'Save Schedule ✅'; }
            return;
          }
          newShifts[String(d)] = [start, end];
        }
      }
      // 1. Update staff off_days
      await MC.sb('staff', 'PATCH', { off_days: newOffDays }, 'id=eq.' + staffId);
      // 2. Update booking_config shifts
      const allShifts = Object.assign({}, c.shifts || {});
      if (Object.keys(newShifts).length) allShifts[s.name] = newShifts; else delete allShifts[s.name];
      await MC.setConfig('booking_config', Object.assign({}, c, { shifts: allShifts }));
      // Update local state so the card redraws correctly
      s.off_days = newOffDays;
      c.shifts = allShifts;
      A.state.cfg = null; // force reload on next calendar open
      ov.remove();
      const wrap = document.getElementById('sf-card-wrap');
      if (wrap) wrap.outerHTML = A._sfCardHtml(A._sfState.staff, c, A._sfState.names);
    } catch (e) {
      if (err) err.textContent = 'Save failed: ' + String(e.message || e);
      if (btn) { btn.disabled = false; btn.textContent = 'Save Schedule ✅'; }
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
