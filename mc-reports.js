/* ============================================================================
 * mc-reports.js — standard reports (PIN protected): Sales & payments, Stylists, Services,
 * Invoice/tax register, Customer acquisition, Appointments.   Every report has CSV export.
 * Pure aggregators are exported for Node tests.
 * ========================================================================== */
(function (root) {
  'use strict';
  const MC = root.MC = root.MC || {};
  const R = MC.reports = MC.reports || {};
  const PIN = '8065';   // same PIN the app already uses for management screens

  /* ── pure aggregation ─────────────────────────────────────────────────── */
  const num = v => Number(v) || 0;
  R.groupSum = function (rows, keyFn, valFns) {
    const m = {};
    rows.forEach(r => {
      const k = keyFn(r) || '—';
      const o = m[k] = m[k] || { key: k, count: 0 };
      o.count++;
      Object.keys(valFns).forEach(n => { o[n] = (o[n] || 0) + num(valFns[n](r)); });
    });
    return Object.keys(m).map(k => m[k]);
  };
  /* Attach price breakdown to each done visit. Invoice (if any) is the source of truth for tax;
   * visits without an invoice (older rows) count as: base = value, no discount, no tax. */
  R.enrich = function (rows, invByQueue) {
    return rows.map(r => {
      const i = invByQueue && invByQueue[r.id];
      const val = num(r.service_value);
      if (i) {
        const list = num(i.list_price != null ? i.list_price : i.base_amount), disc = num(i.discount_amount);
        return Object.assign({}, r, { _list: list, _pct: num(i.discount_pct), _disc: disc, _net: num(i.base_amount), _tax: num(i.tax_amount), _total: i.payable_amount != null ? num(i.payable_amount) : val });
      }
      const list = r.list_price != null && num(r.list_price) > 0 ? num(r.list_price) : val;
      const pct = num(r.discount_pct), disc = r.list_price != null && num(r.list_price) > 0 ? Math.max(0, list - val) : 0;
      return Object.assign({}, r, { _list: list, _pct: pct, _disc: disc, _net: val, _tax: 0, _total: val });
    });
  };
  const V = { list: r => r._list, disc: r => r._disc, net: r => r._net, tax: r => r._tax, total: r => r._total, tips: r => r.tip };
  const pctOf = o => o.list ? o.disc / o.list * 100 : 0;
  R.salesByDay = rows => R.groupSum(rows, r => r.checkin_date, Object.assign({}, V, { cash: r => r.payment_type === 'Cash' ? num(r._total) + num(r.tip) : 0, card: r => r.payment_type === 'Credit' ? num(r._total) + num(r.tip) : 0 })).sort((a, b) => a.key < b.key ? -1 : 1);
  R.byStylist = rows => R.groupSum(rows, r => r.stylist, V).sort((a, b) => b.total - a.total);
  R.byService = rows => R.groupSum(rows, r => r.service, V).sort((a, b) => b.total - a.total);
  /* new vs returning in the period: new = customer's first-ever queue visit falls inside [from,to] */
  R.acquisition = function (rows, firstSeen, from, to) {
    const out = {};
    rows.forEach(r => {
      const src = r.heard_via || r._src || 'Unknown';
      const o = out[src] = out[src] || { key: src, newCust: new Set(), retCust: new Set(), newRev: 0, retRev: 0 };
      const id = r.customer_id || r.mobile || r.id, first = firstSeen[id];
      const isNew = first && first >= from && first <= to;
      (isNew ? o.newCust : o.retCust).add(id);
      if (isNew) o.newRev += num(r.service_value); else o.retRev += num(r.service_value);
    });
    return Object.values(out).map(o => ({ key: o.key, newCount: o.newCust.size, retCount: o.retCust.size, newRev: o.newRev, retRev: o.retRev, total: o.newRev + o.retRev })).sort((a, b) => b.total - a.total);
  };

  /* ── UI ───────────────────────────────────────────────────────────────── */
  R.unlock = pin => { if (String(pin) === PIN) { R.st.unlocked = true; return true; } return false; };
  R.st = { unlocked: false, from: null, to: null, tab: 'sales' };
  const fmt = n => MC.r2(n).toFixed(2);
  const table = (heads, rows, foot) => '<div style="overflow:auto;"><table class="tbl" style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr>' + heads.map(h => '<th style="text-align:left;padding:8px;border-bottom:2px solid var(--border);">' + MC.esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
    (rows.length ? rows.map(r => '<tr>' + r.map(c => '<td style="padding:7px 8px;border-bottom:1px solid var(--border);">' + MC.esc(c) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + heads.length + '" style="padding:16px;color:var(--muted);">No data for this period.</td></tr>') +
    (foot ? '<tr style="font-weight:900;background:#F0FDF4;">' + foot.map(c => '<td style="padding:8px;">' + MC.esc(c) + '</td>').join('') + '</tr>' : '') + '</tbody></table></div>';

  R.init = function () {
    const el = document.getElementById('mc-reports-root'); if (!el) return;
    if (!R.st.unlocked) {
      el.innerHTML = '<div class="card" style="max-width:340px;"><div class="card-title">🔒 Reports</div><input id="mr-pin" class="fi" type="password" inputmode="numeric" placeholder="PIN" style="margin:10px 0;"/><button class="btn btn-y btn-full" id="mr-go">Unlock</button><div id="mr-err" class="sm err"></div></div>';
      const go = () => { if (el.querySelector('#mr-pin').value === PIN) { R.st.unlocked = true; R.init(); } else el.querySelector('#mr-err').textContent = 'Wrong PIN'; };
      el.querySelector('#mr-go').onclick = go; el.querySelector('#mr-pin').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      return;
    }
    if (!R.st.from) { const n = new Date(); R.st.from = MC.monthRange(n.getFullYear(), n.getMonth()).from; R.st.to = MC.today(); }
    const tabs = [['sales', '💰 Sales & payments'], ['detail', '🧾 Visit detail'], ['stylist', '✂️ Stylists'], ['service', '🧴 Services'], ['tax', '🏛 Tax report (VAT/GST)'], ['acq', '📣 Acquisition'], ['appt', '📅 Appointments']];
    const presets = '<button class="btn btn-ghost btn-sm" data-p="today">Today</button><button class="btn btn-ghost btn-sm" data-p="week">7 days</button><button class="btn btn-ghost btn-sm" data-p="month">This month</button><button class="btn btn-ghost btn-sm" data-p="last">Last month</button>';
    el.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">' + presets +
      '<input type="date" class="fi" id="mr-from" style="width:auto;" value="' + R.st.from + '"/><span>→</span><input type="date" class="fi" id="mr-to" style="width:auto;" value="' + R.st.to + '"/>' +
      '<button class="btn btn-y btn-sm" id="mr-run">Run</button><button class="btn btn-ghost btn-sm" id="mr-csv">⬇ CSV</button></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + tabs.map(t => '<button class="btn btn-sm ' + (R.st.tab === t[0] ? 'btn-b' : 'btn-ghost') + '" data-t="' + t[0] + '">' + t[1] + '</button>').join('') + '</div><div id="mr-out" style="color:var(--muted);">Loading…</div>';
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { R.st.tab = b.dataset.t; R.init(); });
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const n = new Date(), p = b.dataset.p;
      if (p === 'today') { R.st.from = R.st.to = MC.today(); }
      if (p === 'week') { R.st.from = MC.addDays(MC.today(), -6); R.st.to = MC.today(); }
      if (p === 'month') { R.st.from = MC.monthRange(n.getFullYear(), n.getMonth()).from; R.st.to = MC.today(); }
      if (p === 'last') { const m = n.getMonth() === 0 ? 11 : n.getMonth() - 1, y = n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear(); const rr = MC.monthRange(y, m); R.st.from = rr.from; R.st.to = rr.to; }
      R.init();
    });
    el.querySelector('#mr-run').onclick = () => { R.st.from = el.querySelector('#mr-from').value; R.st.to = el.querySelector('#mr-to').value; R.init(); };
    el.querySelector('#mr-csv').onclick = () => R.csv && MC.download('minicuts-' + R.st.tab + '-' + R.st.from + '_' + R.st.to + '.csv', R.csv);
    R.csv = null;
    R.run(el.querySelector('#mr-out')).catch(e => { el.querySelector('#mr-out').innerHTML = '<div style="color:var(--err);">' + MC.esc(e.message) + '</div>'; });
  };

  R.run = async function (out) {
    const { from, to, tab } = R.st, q = 'checkin_date=gte.' + from + '&checkin_date=lte.' + to;
    const done = async () => {
      const rows = await MC.sbAll('queue', 'select=*&status=eq.done&' + q);
      let inv = [];
      try { inv = await MC.sbAll('invoices', 'select=queue_id,list_price,discount_pct,discount_amount,base_amount,tax_amount,payable_amount&status=neq.void&queue_id=not.is.null&' + q); } catch (e) { inv = []; }   // before migration: no invoices yet
      const m = {}; inv.forEach(i => { m[i.queue_id] = i; });
      return R.enrich(rows, m);
    };
    const set = (heads, rows, foot, note) => { R.csv = MC.csv(heads, rows); out.innerHTML = (note ? '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">' + note + '</div>' : '') + table(heads, rows, foot); };
    const note = 'Base price = list price before discount. Net value = after discount, before tax. Total = net + tax (what the customer pays, tips excluded). Visits without an invoice show tax 0.';
    const cols = x => [fmt(x.list), fmt(x.disc), fmt(pctOf(x)) + '%', fmt(x.net), fmt(x.tax), fmt(x.total)];
    const tot = d => { const t = {}; ['list', 'disc', 'net', 'tax', 'total', 'tips', 'cash', 'card', 'count'].forEach(k => t[k] = d.reduce((a, x) => a + (x[k] || 0), 0)); return t; };
    if (tab === 'sales') {
      const d = R.salesByDay(await done()), t = tot(d);
      set(['Date', 'Visits', 'Base price', 'Discount', 'Disc %', 'Net value', 'Tax', 'Total', 'Tips', 'Cash', 'Card'], d.map(x => [MC.fmtDate(x.key), x.count].concat(cols(x), [fmt(x.tips), fmt(x.cash), fmt(x.card)])),
        ['Total', t.count].concat(cols(t), [fmt(t.tips), fmt(t.cash), fmt(t.card)]), note + ' Cash/Card include tips.');
    } else if (tab === 'detail') {
      const d = (await done()).sort((a, b) => a.checkin_date < b.checkin_date ? -1 : a.checkin_date > b.checkin_date ? 1 : 0);
      const t = { list: 0, disc: 0, net: 0, tax: 0, total: 0, tips: 0, count: d.length }; d.forEach(r => { t.list += r._list; t.disc += r._disc; t.net += r._net; t.tax += r._tax; t.total += r._total; t.tips += num(r.tip); });
      set(['Date', 'Invoice', 'Customer', 'Service', 'Stylist', 'Base price', 'Disc %', 'Discount', 'Net value', 'Tax', 'Total', 'Tip', 'Payment'],
        d.map(r => [MC.fmtDate(r.checkin_date), r.invoice_number || '', r.customer_name || r.name || '', r.service, r.stylist, fmt(r._list), fmt(r._pct) + '%', fmt(r._disc), fmt(r._net), fmt(r._tax), fmt(r._total), fmt(r.tip), r.payment_type]),
        ['Total', '', '', '', '', fmt(t.list), '', fmt(t.disc), fmt(t.net), fmt(t.tax), fmt(t.total), fmt(t.tips), ''], note);
    } else if (tab === 'stylist') {
      const d = R.byStylist(await done()), t = tot(d);
      set(['Stylist', 'Visits', 'Base price', 'Discount', 'Disc %', 'Net value', 'Tax', 'Total', 'Avg ticket', 'Tips'], d.map(x => [x.key, x.count].concat(cols(x), [fmt(x.count ? x.total / x.count : 0), fmt(x.tips)])),
        ['Total', t.count].concat(cols(t), [fmt(t.count ? t.total / t.count : 0), fmt(t.tips)]), note);
    } else if (tab === 'service') {
      const d = R.byService(await done()), t = tot(d);
      set(['Service', 'Count', 'Base price', 'Discount', 'Disc %', 'Net value', 'Tax', 'Total'], d.map(x => [x.key, x.count].concat(cols(x))), ['Total', t.count].concat(cols(t)), note);
    } else if (tab === 'tax') {
      /* Tax-authority view: one line per invoice, voids listed but excluded from totals.
       * Taxable = value after discount and before tax; Tax = VAT/GST charged; Total = what the customer paid for the service (tips are not part of the supply). */
      const inv = await MC.sbAll('invoices', 'select=*&order=checkin_date.asc,created_at.asc&' + q);
      const ok = inv.filter(i => i.status !== 'void'), voided = inv.filter(i => i.status === 'void');
      const isIN = ok.some(i => i.country === 'IN') || (MC.billing && MC.billing.S && MC.billing.S.country === 'IN');
      const S = (MC.billing && MC.billing.S) || {}, label = isIN ? 'GST' : 'VAT', idl = isIN ? 'GSTIN' : 'TRN';
      const sum = (arr, k) => arr.reduce((a, i) => a + num(i[k]), 0);
      const heads = ['Invoice', 'Date', 'Customer', 'Service', 'Base price', 'Disc %', 'Discount', 'Taxable value', label + ' %'].concat(isIN ? ['CGST', 'SGST'] : [label], ['Total', 'Payment', 'Status']);
      const line = i => [i.invoice_number, i.checkin_date, i.customer_name, i.service, fmt(i.list_price != null ? i.list_price : i.base_amount), fmt(i.discount_pct) + '%', fmt(i.discount_amount), fmt(i.base_amount), fmt(i.tax_rate)].concat(isIN ? [fmt(i.cgst), fmt(i.sgst)] : [fmt(i.tax_amount)], [fmt(i.payable_amount != null ? i.payable_amount : num(i.base_amount) + num(i.tax_amount)), i.payment_type, i.status === 'void' ? 'VOID' : 'Issued']);
      const tot = ['Total (excl. void)', '', '', '', fmt(sum(ok, 'list_price')), '', fmt(sum(ok, 'discount_amount')), fmt(sum(ok, 'base_amount')), ''].concat(isIN ? [fmt(sum(ok, 'cgst')), fmt(sum(ok, 'sgst'))] : [fmt(sum(ok, 'tax_amount'))], [fmt(ok.reduce((a, i) => a + (i.payable_amount != null ? num(i.payable_amount) : num(i.base_amount) + num(i.tax_amount)), 0)), '', ok.length + ' invoices']);
      /* reconcile with sales: completed visits in the period that have no invoice are NOT in this register */
      let gap = '';
      try {
        const done = await MC.sbAll('queue', 'select=id,service_value,invoice_id&status=eq.done&' + q);
        const un = done.filter(r => !r.invoice_id && num(r.service_value) > 0);
        if (un.length) gap = '<div style="background:#FFF7ED;border-radius:8px;padding:8px 10px;margin-bottom:8px;color:#9A3412;"><b>⚠ ' + un.length + ' completed visit(s) worth ' + fmt(un.reduce((a, r) => a + num(r.service_value), 0)) + ' have no invoice</b> and are not in this register (visits before invoicing started, or checked out the old way).</div>';
      } catch (e) {}
      const hdr = '<div style="margin-bottom:8px;"><b>' + MC.esc(S.bname || 'MiNiCUTS') + '</b> · ' + idl + ': <b>' + MC.esc(S.taxId || 'not set') + '</b> · Period ' + MC.fmtDate(from) + ' – ' + MC.fmtDate(to) + ' · Tax basis: prices ' + (S.basis === 'exclusive' ? 'exclude' : 'include') + ' ' + label + '</div>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">' + [['Taxable value', sum(ok, 'base_amount')], [label + ' collected', sum(ok, 'tax_amount')], ['Discounts given', sum(ok, 'discount_amount')], ['Voided invoices', voided.length]].map(x => '<div style="background:#F0FDF4;border-radius:8px;padding:8px 12px;"><div style="font-size:11px;color:var(--muted);">' + x[0] + '</div><div style="font-weight:900;font-size:16px;">' + (typeof x[1] === 'number' && x[0] !== 'Voided invoices' ? fmt(x[1]) : x[1]) + '</div></div>').join('') + '</div>' + gap;
      set(heads, inv.map(line), tot, 'Voided invoices stay listed (numbers are never reused) but are excluded from totals. Tips are not part of the taxable supply.');
      out.insertAdjacentHTML('afterbegin', hdr);
    } else if (tab === 'acq') {
      const rows = await done();
      const ids = [...new Set(rows.map(r => r.customer_id).filter(Boolean))];
      const first = {};
      if (ids.length) {
        const all = await MC.sbAll('queue', 'select=customer_id,checkin_date&customer_id=not.is.null&checkin_date=lte.' + to + '&order=checkin_date.asc');
        all.forEach(r => { if (!first[r.customer_id] || r.checkin_date < first[r.customer_id]) first[r.customer_id] = r.checkin_date; });
      }
      const d = R.acquisition(rows, first, from, to);
      set(['Source', 'New customers', 'Returning', 'Revenue (new)', 'Revenue (returning)', 'Revenue total'], d.map(x => [x.key, x.newCount, x.retCount, fmt(x.newRev), fmt(x.retRev), fmt(x.total)]),
        null, 'New = first visit recorded in the live queue falls inside the period. Visits before 9 Jun 2026 sit in historical_transactions; the Acquisition dashboard in the Loyalty app merges both.');
    } else if (tab === 'appt') {
      const ap = await MC.sbAll('appointments', 'select=*&appt_date=gte.' + from + '&appt_date=lte.' + to + '&order=appt_date.asc,start_time.asc');
      const st = k => ap.filter(a => a.status === k).length;
      set(['Date', 'Time', 'Customer', 'Service', 'Stylist', 'Status'], ap.map(a => [a.appt_date, a.start_time.slice(0, 5), a.customer_name, a.service, a.stylist, a.status]),
        ['Booked ' + ap.length, 'Arrived ' + st('arrived'), 'No-show ' + st('no_show'), 'Cancelled ' + st('cancelled'), '', '']);
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
