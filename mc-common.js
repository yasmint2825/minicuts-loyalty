/* ============================================================================
 * mc-common.js — shared helpers for the Billing, Appointments and Reports modules
 * Loaded by minicuts-staff.html (classic script, no build step).
 * Pure functions (calcInvoice, fyFor, invoiceNumber, …) are also exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};

  /* ── tiny utils ─────────────────────────────────────────────────────────── */
  MC.version = '2026-10-14.10 (tax report)';
  MC.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  MC.r2 = n => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
  MC.money = (n, cur) => (cur || 'AED') + ' ' + MC.r2(n).toFixed(2);
  MC.pad = (n, w) => String(n).padStart(w || 2, '0');
  /* local-date string, never toISOString() (UTC shift bug in Dubai before 04:00) */
  MC.ymd = d => { d = d || new Date(); return d.getFullYear() + '-' + MC.pad(d.getMonth() + 1) + '-' + MC.pad(d.getDate()); };
  MC.today = () => MC.ymd(new Date());
  MC.parseYmd = s => new Date(String(s).slice(0, 10) + 'T12:00:00');      // noon = safe from tz shifts
  MC.addDays = (s, n) => { const d = MC.parseYmd(s); d.setDate(d.getDate() + n); return MC.ymd(d); };
  MC.fmtDate = s => s ? MC.parseYmd(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  MC.monthRange = (y, m) => ({ from: y + '-' + MC.pad(m + 1) + '-01', to: y + '-' + MC.pad(m + 1) + '-' + MC.pad(new Date(y, m + 1, 0).getDate()) });
  /* last 9 digits — same rule as index.html acqNormalizePhone so numbers match across systems */
  MC.last9 = ph => String(ph || '').replace(/\D/g, '').replace(/^971/, '').replace(/^0/, '').slice(-9);
  /* "HH:MM" <-> minutes */
  MC.toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  MC.fromMin = n => MC.pad(Math.floor(n / 60)) + ':' + MC.pad(n % 60);

  MC.csv = function (headers, rows) {
    const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [headers.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\n');
  };
  MC.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /* ── Supabase REST (uses SB_URL / SB_KEY declared by the host page) ─────── */
  MC.conf = () => ({ url: (typeof SB_URL !== 'undefined' ? SB_URL : root.SB_URL), key: (typeof SB_KEY !== 'undefined' ? SB_KEY : root.SB_KEY) });
  MC.sb = async function (path, method, body, params, prefer) {
    const c = MC.conf();
    const h = { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key, Prefer: prefer || 'return=representation' };
    const o = { method: method || 'GET', headers: h };
    if (body != null) o.body = JSON.stringify(body);
    const r = await fetch(c.url + '/rest/v1/' + path + (params ? '?' + params : ''), o);
    const t = await r.text();
    if (!r.ok) { const e = new Error(t.slice(0, 300)); e.status = r.status; e.body = t; throw e; }
    return t ? JSON.parse(t) : [];
  };
  /* paged GET — gets past PostgREST's 1000-row cap */
  MC.sbAll = async function (path, params, max) {
    let out = [], off = 0;
    for (let g = 0; g < (max || 60); g++) {
      const b = await MC.sb(path, 'GET', null, (params ? params + '&' : '') + 'limit=1000&offset=' + off);
      out = out.concat(b || []);
      if (!b || b.length < 1000) break;
      off += 1000;
    }
    return out;
  };
  /* staff_config key/value (value stored as JSON string, same as the rest of the app) */
  MC.getConfig = async function (key) {
    const rows = await MC.sb('staff_config', 'GET', null, 'key=eq.' + encodeURIComponent(key) + '&select=value&limit=1');
    if (!rows.length) return null;
    const v = rows[0].value;
    try { return typeof v === 'string' ? JSON.parse(v) : v; } catch (e) { return null; }
  };
  MC.setConfig = async function (key, obj) {
    const payload = { value: JSON.stringify(obj), updated_at: new Date().toISOString() };
    const upd = await MC.sb('staff_config', 'PATCH', payload, 'key=eq.' + encodeURIComponent(key));
    if (upd && upd.length) return;
    await MC.sb('staff_config', 'POST', Object.assign({ key }, payload));
  };

  /* ── modal (same look as the existing editHistRow overlay) ──────────────── */
  MC.modal = function (html, opts) {
    opts = opts || {};
    const ov = document.createElement('div');
    ov.className = 'mc-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;';
    ov.innerHTML = '<div class="mc-box" style="background:#fff;border-radius:18px;padding:22px;max-width:' + (opts.width || 460) + 'px;width:100%;max-height:92vh;overflow:auto;">' + html + '</div>';
    ov.close = () => ov.remove();
    if (!opts.sticky) ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    return ov;
  };
  MC.lbl = t => '<label style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px;">' + t + '</label>';

  /* ── pure business logic ────────────────────────────────────────────────── */
  /* Money: price on the list, % discount, tax either inside the price ('inclusive') or added on top ('exclusive').
   * service_value saved on the queue row = payable (what the customer pays for the service, tax included, tip excluded) —
   * identical meaning to what staff typed before, so cash-drawer reconciliation and existing dashboards keep working. */
  MC.calcInvoice = function (o) {
    const list = MC.r2(o.listPrice);
    const pct = Math.min(100, Math.max(0, Number(o.discountPct) || 0));
    const discAmt = MC.r2(list * pct / 100);
    const net = MC.r2(list - discAmt);
    const rate = o.taxRegistered === false ? 0 : (Number(o.taxRate) || 0);
    let taxable = net, tax = 0, payable = net;
    if (rate > 0) {
      if (o.basis === 'exclusive') { taxable = net; tax = MC.r2(net * rate / 100); payable = MC.r2(net + tax); }
      else { payable = net; taxable = MC.r2(net / (1 + rate / 100)); tax = MC.r2(net - taxable); }
    }
    let cgst = 0, sgst = 0, igst = 0;
    if (o.country === 'IN' && tax > 0) { cgst = MC.r2(tax / 2); sgst = MC.r2(tax - cgst); }
    const tip = MC.r2(o.tip);
    return { list, discountPct: pct, discountAmount: discAmt, net, taxable, tax, cgst, sgst, igst, payable, tip, grand: MC.r2(payable + tip), rate };
  };
  /* Starting point for checkout from a grid row.
   * Teams enter the amount the customer actually pays in the grid and note the discount in the remark ("5%").
   * So a grid value with a % in the remark means: value = AFTER discount -> work back to the list price.
   * Without a % in the remark the value is taken as the full price. A row already checked out keeps its saved list/discount. */
  MC.seedFromRow = function (r, catalogPrice) {
    const val = Number(r.service_value) || 0;
    if (r.list_price != null && r.list_price !== '' && Number(r.list_price) > 0)
      return { list: Number(r.list_price), pct: Number(r.discount_pct) || 0, note: '' };
    const m = /(\d+(?:\.\d+)?)\s*%/.exec(String(r.remark || ''));
    const pct = m ? Math.min(100, Number(m[1])) : 0;
    if (val > 0 && pct > 0 && pct < 100)
      return { list: MC.r2(val / (1 - pct / 100)), pct, note: 'Amount in the grid (' + MC.r2(val).toFixed(2) + ') is after the ' + pct + '% in the remark, so the full price is worked back to ' + MC.r2(val / (1 - pct / 100)).toFixed(2) + '. Check it.' };
    if (val > 0) return { list: val, pct: 0, note: '' };
    return { list: Number(catalogPrice) || 0, pct: 0, note: '' };
  };
  /* Financial year label. India: Apr–Mar -> '2627'. UAE: calendar year -> '2026'. */
  MC.fyFor = function (ymd, country) {
    const y = +String(ymd).slice(0, 4), m = +String(ymd).slice(5, 7);
    if (country === 'IN') { const a = m >= 4 ? y : y - 1; return String(a).slice(2) + String(a + 1).slice(2); }
    return String(y);
  };
  MC.cleanPrefix = (p, country) => String(p || 'MC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, country === 'IN' ? 5 : 8) || 'MC';
  /* India: number must be <=16 chars, consecutive, unique per FY (CGST Rule 46). 'MC/2627/00001' = 13 chars. */
  MC.invoiceNumber = (prefix, fy, seq, country) => MC.cleanPrefix(prefix, country) + '/' + fy + '/' + MC.pad(seq, 5);
  MC.validTaxId = function (country, id) {
    id = String(id || '').trim().toUpperCase();
    if (!id) return { ok: true, empty: true };
    if (country === 'IN') return { ok: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(id), id };
    return { ok: /^[0-9]{15}$/.test(id), id };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MC;
})(typeof window !== 'undefined' ? window : globalThis);
