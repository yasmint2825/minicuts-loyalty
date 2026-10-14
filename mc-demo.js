/* ============================================================================
 * mc-demo.js — PRACTICE MODE. Only active when the page address contains  ?demo=1
 * Replaces every call to Supabase with a small database that lives in THIS browser (localStorage),
 * so the whole flow (check-in, queue, checkout, invoices, void, appointments, reports, WhatsApp)
 * can be tried without touching the real system. Nothing is sent to Supabase or WhatsApp.
 * Without ?demo=1 this file does nothing at all.
 * ========================================================================== */
(function () {
  'use strict';
  if (!/[?&]demo=1(&|$)/.test(location.search)) return;
  const KEY = 'mc_demo_db_v1';
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = ymd(new Date());
  const seed = () => ({
    customers: [
      { id: 'c1', name: 'Aisha', mobile: '971501234567', parent: 'Fatima', gender: 'girl', dob: '2020-03-04', location: 'Dubai Silicon Oasis (DSO)', heard_via: 'Google', stamps: 3, tc_accepted: true },
      { id: 'c2', name: 'Omar', mobile: '971501234567', parent: 'Fatima', gender: 'boy', dob: '2018-06-10', location: 'Dubai Silicon Oasis (DSO)', heard_via: 'Google', stamps: 1, tc_accepted: true },
      { id: 'c3', name: 'Yusuf', mobile: '971559876543', parent: null, gender: 'boy', dob: null, location: null, heard_via: null, stamps: 0, tc_accepted: false },
      { id: 'c4', name: 'Mia', mobile: '971521112233', parent: 'Sara', gender: 'girl', dob: '2021-01-15', location: 'Mirdif', heard_via: 'Instagram', stamps: 5, tc_accepted: true }
    ],
    queue: [
      { id: 'q1', customer_id: 'c1', customer_name: 'Aisha', mobile: '971501234567', service: 'Haircut', token_number: 1, checkin_date: today, checkin_time: new Date().toISOString(), status: 'waiting', is_guest: false },
      { id: 'q2', customer_id: 'c4', customer_name: 'Mia', mobile: '971521112233', service: 'Haircut', token_number: 2, checkin_date: today, checkin_time: new Date().toISOString(), status: 'called', stylist: 'George', is_guest: false }
    ],
    staff: [{ id: 'st1', name: 'Lester', role: 'Stylist', off_days: [] }, { id: 'st2', name: 'George', role: 'Stylist', off_days: [] }],
    salon_services: [
      { id: 's1', name: 'Boys Haircut', gender: 'Boy', price: 50, duration: 30, status: 'active' },
      { id: 's2', name: 'Girls Haircut', gender: 'Girl', price: 60, duration: 30, status: 'active' },
      { id: 's3', name: 'Girls Styling', gender: 'Girl', price: 80, duration: 45, status: 'active' },
      { id: 's4', name: 'Hair Wash', gender: '', price: 25, duration: 15, status: 'active' }
    ],
    staff_config: [{ key: 'co_settings', value: JSON.stringify({ bname: 'MiNiCUTS FZCO (DEMO)', trn: '100123456700003', taxrate: 5, tax_incl: 'inclusive', prefix: 'MC', addr: 'Dubai Silicon Oasis', waTemplateName: 'booking_completed_invoice' }) }],
    invoices: [], appointments: [], staff_leaves: [], staff_roster: []
  });
  const load = () => { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch (e) {} const d = seed(); save(d); return d; };
  const save = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} };
  let DB = load();

  const like = (val, pat) => new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i').test(String(val == null ? '' : val));
  const filt = (rows, qs) => {
    qs.forEach((v, k) => {
      if (['select', 'order', 'limit', 'offset'].includes(k)) return;
      let m;
      if (k === 'or' && (m = /^\((.*)\)$/.exec(v))) { const c = m[1].split(',').map(x => /^(\w+)\.ilike\.(.*)$/.exec(x)); if (c.every(Boolean)) rows = rows.filter(r => c.some(x => like(r[x[1]], decodeURIComponent(x[2])))); return; }
      if ((m = /^eq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) === m[1]);
      else if ((m = /^neq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) !== m[1]);
      else if ((m = /^in\.\((.*)\)$/.exec(v))) rows = rows.filter(r => m[1].split(',').includes(String(r[k])));
      else if ((m = /^gte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) >= m[1]);
      else if ((m = /^lte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) <= m[1]);
      else if ((m = /^ilike\.(.*)$/.exec(v))) rows = rows.filter(r => like(r[k], m[1]));
      else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
      else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
    });
    return rows;
  };
  const uid = () => 'd' + Math.random().toString(16).slice(2, 10);
  const resp = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json' } });

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    if (!/\.supabase\.co\//.test(url)) return realFetch(input, init);
    init = init || {};
    const method = (init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    const u = new URL(url), path = u.pathname;
    if (path.startsWith('/storage/')) return resp({ Key: 'demo' });                           // PDF upload: accepted, not stored
    if (path.startsWith('/functions/')) {                                                       // WhatsApp / Zen: pretend it worked
      let b = {}; try { b = JSON.parse(init.body || '{}'); } catch (e) {}
      console.info('[DEMO] WhatsApp not really sent:', path.split('/').pop(), b);
      return resp({ ok: true, demo: true });
    }
    const t = (path.split('/rest/v1/')[1] || '').split('/')[0];
    if (!t) return resp([]);
    const rows = DB[t] || (DB[t] = []);
    const minimal = /return=minimal/.test((init.headers && (init.headers.Prefer || init.headers.prefer)) || '');
    if (method === 'GET') {
      let r = filt(rows, u.searchParams); const o = u.searchParams.get('order');
      if (o) { const [f, d] = o.split(',')[0].split('.'); r = [...r].sort((a, c) => (a[f] > c[f] ? 1 : a[f] < c[f] ? -1 : 0) * (d === 'desc' ? -1 : 1)); }
      const l = +u.searchParams.get('limit'); return resp(l ? r.slice(0, l) : r);
    }
    let body = {}; try { body = JSON.parse(init.body || '{}'); } catch (e) {}
    if (method === 'POST') {
      const arr = [].concat(body).map(x => Object.assign({ id: uid(), created_at: new Date().toISOString() }, x));
      if (t === 'invoices' && arr.some(x => DB.invoices.some(i => i.fy && i.fy === x.fy && i.seq === x.seq))) return resp({ code: '23505', message: 'duplicate key value violates unique constraint' }, 409);
      rows.push(...arr); save(DB); return minimal ? new Response('', { status: 201 }) : resp(arr, 201);
    }
    if (method === 'PATCH') { const r = filt(rows, u.searchParams); r.forEach(x => Object.assign(x, body)); save(DB); return minimal ? new Response('', { status: 204 }) : resp(r); }
    if (method === 'DELETE') { const del = filt(rows, u.searchParams); DB[t] = rows.filter(x => !del.includes(x)); save(DB); return minimal ? new Response('', { status: 204 }) : resp(del); }
    return resp([]);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#B91C1C;color:#fff;font:700 13px system-ui,sans-serif;padding:7px 12px;display:flex;gap:12px;align-items:center;justify-content:center;';
    bar.innerHTML = '🧪 PRACTICE MODE — practice data only. Nothing is saved to the real system and no WhatsApp is sent. <button id="mc-demo-reset" style="background:#fff;color:#B91C1C;border:0;border-radius:8px;padding:4px 10px;font-weight:800;cursor:pointer;">Reset practice data</button>';
    document.body.appendChild(bar);
    bar.querySelector('#mc-demo-reset').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
    document.title = '[PRACTICE] ' + document.title;
  });
  console.info('[DEMO] practice mode on — all Supabase calls are answered locally.');
})();
