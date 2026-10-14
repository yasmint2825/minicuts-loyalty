/* ============================================================================
 * mc-billing.js — Checkout (with % discount) -> Invoice -> PDF -> WhatsApp utility message
 * Hooks into minicuts-staff.html:  History rows and done Queue rows get a 💳 Checkout / 🧾 Invoice button.
 * Settings card "🧾 Invoice & Tax" is rendered into #mc-settings-billing.
 * ========================================================================== */
(function () {
  'use strict';
  const MC = window.MC;
  const B = MC.billing = { S: null, services: [], loaded: false };

  const COUNTRIES = {
    AE: { name: 'UAE', taxLabel: 'VAT', idLabel: 'TRN (Tax Registration No.)', currency: 'AED', rate: 5 },
    IN: { name: 'India', taxLabel: 'GST', idLabel: 'GSTIN', currency: 'INR', rate: 5 }
  };
  B.COUNTRIES = COUNTRIES;
  const DEFAULTS = { country: 'AE', bname: 'MiNiCUTS FZCO', addr: '', phone: '', taxId: '', rate: 5, basis: 'inclusive', prefix: 'MC',
    footer: 'Thank you for visiting MiNiCUTS!', sac: '999721', stateName: '', stateCode: '', currency: 'AED', waTemplateName: 'mc_invoice_utility' };

  /* Reads the settings record the app already stores (staff_config.co_settings: bname/addr/trn/prefix/footer/taxrate/tax_incl)
   * and adds the new fields next to it, so older saved data keeps working. */
  B.normalize = function (raw) {
    raw = raw || {};
    const country = raw.country === 'IN' ? 'IN' : 'AE';
    const S = Object.assign({}, DEFAULTS, {
      country,
      bname: raw.bname || DEFAULTS.bname, addr: raw.addr || '', phone: raw.phone || '',
      taxId: String(raw.taxId != null ? raw.taxId : (raw.trn || '')).trim().toUpperCase(),
      rate: raw.rate != null ? Number(raw.rate) : (raw.taxrate != null ? Number(raw.taxrate) : COUNTRIES[country].rate),
      basis: (raw.basis || raw.tax_incl) === 'exclusive' ? 'exclusive' : 'inclusive',
      prefix: MC.cleanPrefix(raw.prefix || 'MC', country),
      footer: raw.footer != null ? raw.footer : DEFAULTS.footer,
      sac: raw.sac || '999721', stateName: raw.stateName || '', stateCode: raw.stateCode || '',
      currency: raw.currency || COUNTRIES[country].currency,
      waTemplateName: raw.waTemplateName || DEFAULTS.waTemplateName
    });
    S.taxLabel = COUNTRIES[country].taxLabel;
    S.taxRegistered = !!S.taxId;
    return S;
  };

  B.load = async function (force) {
    if (B.loaded && !force) return B.S;
    let raw = null;
    try { raw = await MC.getConfig('co_settings'); } catch (e) { console.warn('co_settings load failed', e.message); }
    if (!raw) {                                   // fall back to Salon Setup > VAT (salon_vat row)
      try { const v = (await MC.sb('salon_vat', 'GET', null, 'select=*&limit=1'))[0]; if (v) raw = { bname: v.biz, trn: v.reg, taxrate: v.rate }; } catch (e) {}
    }
    B.S = B.normalize(raw);
    try {
      const sv = await MC.sb('salon_services', 'GET', null, 'select=id,name,code,cat,gender,price,duration,status&order=gender.asc,name.asc&limit=1000');
      const seen = {};
      B.services = (sv || []).filter(s => String(s.status || 'active').toLowerCase() !== 'inactive').filter(s => {
        const k = String(s.name || '').trim().toLowerCase().replace(/\s+/g, ' ') + '|' + String(s.gender || '').trim().toLowerCase() + '|' + Number(s.price);
        if (seen[k]) return false; seen[k] = 1; return true;     // same name+type+price = duplicate row in Salon Setup
      });
    } catch (e) { console.warn('salon_services load failed', e.message); B.services = []; }
    B.loaded = true;
    return B.S;
  };

  /* ── helpers ──────────────────────────────────────────────────────────── */
  const rowById = id => ((typeof _histData !== 'undefined' ? _histData : []) || []).find(x => x.id === id) || ((typeof _qdata !== 'undefined' ? _qdata : []) || []).find(x => x.id === id);
  const refresh = () => { try { if (typeof renderHist === 'function') renderHist(); } catch (e) {} try { if (typeof renderQ === 'function') renderQ(); } catch (e) {} };
  const waNum = m => (typeof toWANum === 'function' ? toWANum(m) : String(m || '').replace(/\D/g, ''));
  const hasPhone = m => !!m && !String(m).startsWith('GUEST') && String(m).replace(/\D/g, '').length > 6;
  const stylistsOf = r => [r.stylist, r.stylist2].filter(Boolean).join(' & ');

  /* ── buttons injected into History / Queue rows ───────────────────────── */
  B.rowButton = function (r) {
    if (!r || r.status === 'cancelled') return '';
    if (r.invoice_id) {
      return '<button class="btn btn-sm" style="background:#EEF6FF;color:#1565C0;font-size:11px;white-space:nowrap;" title="' + MC.esc(r.invoice_number || '') + '" onclick="MC.billing.viewInvoiceForRow(\'' + r.id + '\')">🧾 Invoice</button>';
    }
    return '<button class="btn btn-sm btn-y" style="font-size:11px;white-space:nowrap;" onclick="MC.billing.openCheckout(\'' + r.id + '\')">💳 Checkout</button>';
  };

  /* ── CHECKOUT MODAL ───────────────────────────────────────────────────── */
  B.openCheckout = async function (queueId) {
    const r = rowById(queueId);
    if (!r) { toast('Row not found — reload the list', 'err'); return; }
    if (r.invoice_id) return B.viewInvoiceForRow(queueId);
    await B.load();
    const S = B.S;
    
    const byName = B.services.find(s => String(s.name).toLowerCase() === String(r.service || '').toLowerCase());
    const startPrice = r.list_price != null && r.list_price !== '' ? r.list_price : (r.service_value || (byName ? byName.price : '') || '');

    const chips = [0, 5, 10, 15, 20, 25, 50].map(p => '<button type="button" class="btn btn-ghost btn-sm mc-chip" data-p="' + p + '" style="padding:6px 10px;">' + (p ? p + '%' : 'None') + '</button>').join('');
    const ov = MC.modal(
      '<div style="font-family:var(--fh);font-size:19px;font-weight:800;color:var(--bd);">💳 Checkout</div>' +
      '<div style="font-size:13px;color:var(--muted);margin:2px 0 14px;">' + MC.esc(r.customer_name || 'Guest') + ' · Token ' + MC.pad(r.token_number || 0) + (stylistsOf(r) ? ' · ' + MC.esc(stylistsOf(r)) : '') + '</div>' +
      '<div style="display:grid;gap:12px;">' +
        '<div>' + MC.lbl('Service') + '<div id="mcc-types" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>' +
          '<div style="position:relative;"><input id="mcc-svcname" class="fi" type="text" autocomplete="off" placeholder="Type to search, e.g. haircut, colour…" value="' + MC.esc(r.service || '') + '"/>' +
          '<div id="mcc-list" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:5;background:#fff;border:1px solid var(--border);border-radius:10px;max-height:230px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.18);"></div></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div>' + MC.lbl('Price (' + S.currency + ')') + '<input id="mcc-price" class="fi" type="number" min="0" step="any" value="' + MC.esc(startPrice) + '" placeholder="0"/></div>' +
          '<div>' + MC.lbl('Tip (' + S.currency + ')') + '<input id="mcc-tip" class="fi" type="number" min="0" step="any" value="' + MC.esc(r.tip || '') + '" placeholder="0"/></div>' +
        '</div>' +
        '<div>' + MC.lbl('Discount %') + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + chips +
          '<input id="mcc-disc" class="fi" type="number" min="0" max="100" step="any" value="' + MC.esc(r.discount_pct || 0) + '" style="width:80px;"/><span style="font-size:12px;color:var(--muted);">%</span></div></div>' +
        '<div>' + MC.lbl('Payment') + '<div style="display:flex;gap:8px;">' +
          '<button type="button" class="btn btn-ghost mc-pay" data-v="Cash" style="flex:1;padding:10px;">💵 Cash</button>' +
          '<button type="button" class="btn btn-ghost mc-pay" data-v="Credit" style="flex:1;padding:10px;">💳 Card</button></div></div>' +
        '<div id="mcc-sum" style="background:#F8FAFF;border:1px solid #DBEAFE;border-radius:12px;padding:12px 14px;font-size:13px;"></div>' +
      '</div>' +
      '<div id="mcc-msg" style="display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:700;background:#FEE2E2;color:#DC2626;"></div>' +
      '<div style="display:flex;gap:9px;margin-top:16px;">' +
        '<button type="button" class="btn btn-ghost" id="mcc-cancel" style="padding:11px 16px;">Cancel</button>' +
        '<button type="button" class="btn btn-y" id="mcc-issue" style="flex:1;padding:12px;font-size:15px;">🧾 Issue Invoice</button></div>',
      { width: 460 });

    const $ = id => ov.querySelector('#' + id);
    let pay = r.payment_type === 'Cash' || r.payment_type === 'Credit' ? r.payment_type : '';

    const read = () => ({
      listPrice: parseFloat($('mcc-price').value) || 0, discountPct: parseFloat($('mcc-disc').value) || 0,
      tip: parseFloat($('mcc-tip').value) || 0
    });
    const calc = () => { const v = read(); return MC.calcInvoice({ listPrice: v.listPrice, discountPct: v.discountPct, tip: v.tip, taxRate: S.rate, basis: S.basis, taxRegistered: S.taxRegistered, country: S.country }); };
    const line = (a, b, strong, color) => '<div style="display:flex;justify-content:space-between;' + (strong ? 'font-weight:800;font-size:15px;color:var(--bd);border-top:1px solid #DBEAFE;margin-top:6px;padding-top:6px;' : '') + (color ? 'color:' + color + ';' : '') + '"><span>' + a + '</span><span>' + b + '</span></div>';
    const paint = () => {
      const c = calc(), cur = S.currency;
      let h = line('Price', MC.money(c.list, cur));
      if (c.discountAmount) h += line('Discount (' + c.discountPct + '%)', '− ' + MC.money(c.discountAmount, cur), false, 'var(--err)');
      if (S.taxRegistered && c.tax > 0) {
        h += line('Taxable value', MC.money(c.taxable, cur), false, 'var(--muted)');
        if (S.country === 'IN') { h += line('CGST ' + (S.rate / 2) + '%', MC.money(c.cgst, cur), false, 'var(--muted)'); h += line('SGST ' + (S.rate / 2) + '%', MC.money(c.sgst, cur), false, 'var(--muted)'); }
        else h += line(S.taxLabel + ' ' + S.rate + '%' + (S.basis === 'inclusive' ? ' (included)' : ''), MC.money(c.tax, cur), false, 'var(--muted)');
      }
      h += line('Service total', MC.money(c.payable, cur));
      if (c.tip) h += line('Tip', MC.money(c.tip, cur), false, 'var(--ok)');
      h += line('Total to collect', MC.money(c.grand, cur), true);
      $('mcc-sum').innerHTML = h;
      ov.querySelectorAll('.mc-chip').forEach(b => { const on = +b.dataset.p === (parseFloat($('mcc-disc').value) || 0); b.style.background = on ? 'var(--b)' : 'transparent'; b.style.color = on ? '#fff' : 'var(--b)'; });
      ov.querySelectorAll('.mc-pay').forEach(b => { const on = b.dataset.v === pay; b.style.background = on ? 'var(--b)' : 'transparent'; b.style.color = on ? '#fff' : 'var(--b)'; });
    };
    /* type-ahead service picker with Boys / Girls / Both filter */
    const norm = x => String(x || '').trim().toLowerCase();
    const typeLabel = g => { g = norm(g); return g === 'boys' || g === 'boy' ? 'Boys' : g === 'girls' || g === 'girl' ? 'Girls' : g === 'both' || !g ? 'Both' : g[0].toUpperCase() + g.slice(1); };
    const types = ['All'].concat([...new Set(B.services.map(x => typeLabel(x.gender)))]);
    let typeSel = 'All';
    const paintTypes = () => { $('mcc-types').innerHTML = types.map(t => '<button type="button" class="btn btn-sm ' + (t === typeSel ? 'btn-b' : 'btn-ghost') + '" data-ty="' + MC.esc(t) + '" style="padding:4px 10px;">' + MC.esc(t) + '</button>').join(''); $('mcc-types').querySelectorAll('button').forEach(b => b.onclick = () => { typeSel = b.dataset.ty; paintTypes(); showList(true); }); };
    const showList = force => {
      const q = norm($('mcc-svcname').value).split(/\s+/).filter(Boolean);
      let items = B.services.filter(x => (typeSel === 'All' || typeLabel(x.gender) === typeSel) && q.every(w => norm(x.name).includes(w)));
      const exact = items.length === 1 && norm(items[0].name) === norm($('mcc-svcname').value);
      const box = $('mcc-list');
      if (!force && (exact || !q.length && document.activeElement !== $('mcc-svcname'))) { box.style.display = 'none'; return; }
      box.innerHTML = (items.slice(0, 40).map((x, i) => '<div data-i="' + B.services.indexOf(x) + '" style="padding:9px 12px;cursor:pointer;display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #F1F5F9;font-size:13.5px;"><span>' + MC.esc(x.name) + ' <span style="color:var(--muted);font-size:11px;">' + MC.esc(typeLabel(x.gender)) + '</span></span><b>' + MC.esc(x.price) + '</b></div>').join('') || '<div style="padding:10px 12px;color:var(--muted);font-size:13px;">No match — keep typing to use a custom service name.</div>') + (items.length > 40 ? '<div style="padding:6px 12px;color:var(--muted);font-size:11px;">Showing 40 of ' + items.length + ' — type more to narrow</div>' : '');
      box.style.display = 'block';
      box.querySelectorAll('[data-i]').forEach(d => d.addEventListener('mousedown', e => { e.preventDefault(); const x = B.services[+d.dataset.i]; $('mcc-svcname').value = x.name; $('mcc-price').value = x.price; box.style.display = 'none'; paint(); $('mcc-disc').focus(); }));
    };
    $('mcc-svcname').addEventListener('input', () => showList(true));
    $('mcc-svcname').addEventListener('focus', () => showList(true));
    $('mcc-svcname').addEventListener('blur', () => setTimeout(() => { $('mcc-list').style.display = 'none'; }, 120));
    paintTypes();
    ['mcc-price', 'mcc-tip', 'mcc-disc'].forEach(id => $(id).addEventListener('input', paint));
    ov.querySelectorAll('.mc-chip').forEach(b => b.addEventListener('click', () => { $('mcc-disc').value = b.dataset.p; paint(); }));
    ov.querySelectorAll('.mc-pay').forEach(b => b.addEventListener('click', () => { pay = b.dataset.v; paint(); }));
    $('mcc-cancel').addEventListener('click', () => ov.close());
    $('mcc-issue').addEventListener('click', async () => {
      const msg = $('mcc-msg'); msg.style.display = 'none';
      const svc = ($('mcc-svcname').value || '').trim();
      const v = read();
      const fail = t => { msg.textContent = t; msg.style.display = 'block'; };
      if (!svc) return fail('Pick or type the service.');
      if (!(v.listPrice > 0)) return fail('Enter the price.');
      if (v.discountPct < 0 || v.discountPct > 100) return fail('Discount must be 0–100%.');
      if (!pay) return fail('Choose Cash or Card.');
      const btn = $('mcc-issue'); btn.disabled = true; btn.textContent = 'Issuing…';
      try {
        const inv = await B.issue(r, { service: svc, payment: pay, listPrice: v.listPrice, discountPct: v.discountPct, tip: v.tip });
        ov.close();
        B.showInvoice(inv, { fresh: true });
      } catch (e) {
        btn.disabled = false; btn.textContent = '🧾 Issue Invoice';
        fail(/42501|row-level|policy|permission/i.test(e.message) ? 'Database not ready: run sql/001_billing_and_appointments.sql in Supabase first.' : 'Could not issue: ' + e.message);
      }
    });
    paint();
  };

  /* ── ISSUE ────────────────────────────────────────────────────────────── */
  B.issue = async function (r, f) {
    const S = B.S;
    const c = MC.calcInvoice({ listPrice: f.listPrice, discountPct: f.discountPct, tip: f.tip, taxRate: S.rate, basis: S.basis, taxRegistered: S.taxRegistered, country: S.country });
    const date = r.checkin_date || MC.today();
    const fy = MC.fyFor(MC.today(), S.country);
    const seller = { bname: S.bname, addr: S.addr, phone: S.phone, footer: S.footer, country: S.country, taxLabel: S.taxLabel };
    const base = {
      queue_id: r.id, customer_id: r.customer_id || null, customer_name: r.customer_name || null, mobile: hasPhone(r.mobile) ? r.mobile : null,
      service: f.service, stylist: r.stylist || null, stylist2: r.stylist2 || null,
      list_price: c.list, discount_pct: c.discountPct, discount_amount: c.discountAmount,
      base_amount: c.taxable, tax_rate: S.taxRegistered ? S.rate : 0, tax_amount: c.tax, cgst: c.cgst, sgst: c.sgst, igst: c.igst,
      payable_amount: c.payable, tip: c.tip, total_amount: c.grand, payment_type: f.payment, price_basis: S.basis,
      status: 'paid', checkin_date: date, country: S.country, currency: S.currency, tax_label: S.taxLabel,
      tax_id: S.taxRegistered ? S.taxId : null, sac: S.country === 'IN' ? S.sac : null,
      place_of_supply: S.country === 'IN' ? (S.stateName + (S.stateCode ? ' (' + S.stateCode + ')' : '')) : null,
      seller, fy
    };
    let inv = null, lastErr = null;
    for (let attempt = 0; attempt < 5 && !inv; attempt++) {
      const top = await MC.sb('invoices', 'GET', null, 'select=seq&fy=eq.' + encodeURIComponent(fy) + '&order=seq.desc&limit=1');
      const seq = ((top[0] && top[0].seq) || 0) + 1;
      try {
        inv = (await MC.sb('invoices', 'POST', Object.assign({ seq, invoice_number: MC.invoiceNumber(S.prefix, fy, seq, S.country) }, base)))[0];
      } catch (e) {
        lastErr = e;
        if (!(e.status === 409 || /23505|duplicate key/i.test(e.message))) throw e;   // only retry number clashes
      }
    }
    if (!inv) throw lastErr || new Error('Could not allocate an invoice number');

    /* queue row: keep existing dashboards correct (service_value = what the customer pays for the service) */
    const patch = { service: f.service, service_value: c.payable, list_price: c.list, discount_pct: c.discountPct, tip: c.tip || null,
      payment_type: f.payment, invoice_id: inv.id, invoice_number: inv.invoice_number };
    await MC.sb('queue', 'PATCH', patch, 'id=eq.' + r.id, 'return=minimal');
    Object.assign(r, patch);

    /* PDF — failure here must not lose the invoice */
    try { await B.attachPdf(inv); } catch (e) { console.warn('PDF/upload failed:', e.message); inv._pdfError = e.message; }
    refresh();
    return inv;
  };

  /* ── PDF ──────────────────────────────────────────────────────────────── */
  B.loadJsPdf = function () {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF library (offline?)'));
      document.head.appendChild(s);
    });
  };
  B.buildPdf = async function (inv) {
    await B.loadJsPdf();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a5' });
    const sel = inv.seller || {}, cur = inv.currency || 'AED', IN = inv.country === 'IN';
    const L = 12, R = 136; let y = 16;
    const txt = (t, x, yy, o) => doc.text(String(t == null ? '' : t), x, yy, o);
    const right = (t, yy) => txt(t, R, yy, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); txt(sel.bname || 'MiNiCUTS', L, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    doc.splitTextToSize(sel.addr || '', 90).forEach(l => { txt(l, L, y); y += 4; });
    if (sel.phone) { txt('Tel: ' + sel.phone, L, y); y += 4; }
    if (inv.tax_id) { txt((IN ? 'GSTIN: ' : 'TRN: ') + inv.tax_id, L, y); y += 4; }
    doc.setTextColor(0);
    const title = inv.tax_id ? 'TAX INVOICE' : (IN ? 'BILL OF SUPPLY' : 'INVOICE');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); right(title, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    right('No: ' + inv.invoice_number, 24);
    right('Date: ' + MC.fmtDate(inv.checkin_date), 29);
    if (inv.status === 'void') { doc.setTextColor(200, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); right('VOID', 36); doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); }
    y = Math.max(y, 38) + 3;
    doc.setDrawColor(200); doc.line(L, y, R, y); y += 6;
    doc.setFont('helvetica', 'bold'); txt('Billed to', L, y); doc.setFont('helvetica', 'normal'); y += 5;
    txt(inv.customer_name || 'Customer', L, y); y += 4.5;
    if (inv.mobile) { txt('Mobile: ' + inv.mobile, L, y); y += 4.5; }
    if (IN && inv.place_of_supply) { txt('Place of supply: ' + inv.place_of_supply, L, y); y += 4.5; }
    y += 2; doc.line(L, y, R, y); y += 6;
    doc.setFont('helvetica', 'bold'); txt('Description', L, y); right('Amount (' + cur + ')', y); y += 6;
    doc.setFont('helvetica', 'normal');
    txt(inv.service || 'Service', L, y); right(MC.r2(inv.list_price != null ? inv.list_price : inv.base_amount).toFixed(2), y); y += 4.5;
    doc.setFontSize(8); doc.setTextColor(110);
    const sub = [inv.stylist, inv.stylist2].filter(Boolean).join(' & ');
    if (sub || (IN && inv.sac)) { txt((sub ? 'Stylist: ' + sub : '') + (IN && inv.sac ? (sub ? '   ' : '') + 'SAC: ' + inv.sac : ''), L, y); y += 4.5; }
    doc.setFontSize(9); doc.setTextColor(0); y += 1;
    const row = (a, b, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); txt(a, L, y); right(b, y); y += 5; };
    if (+inv.discount_amount) row('Discount (' + (+inv.discount_pct) + '%)', '-' + MC.r2(inv.discount_amount).toFixed(2));
    if (+inv.tax_amount > 0) {
      row('Taxable value', MC.r2(inv.base_amount).toFixed(2));
      if (IN) { const h = (+inv.tax_rate) / 2; row('CGST ' + h + '%', MC.r2(inv.cgst).toFixed(2)); row('SGST ' + h + '%', MC.r2(inv.sgst).toFixed(2)); }
      else row((inv.tax_label || 'VAT') + ' ' + (+inv.tax_rate) + '%', MC.r2(inv.tax_amount).toFixed(2));
    }
    doc.setDrawColor(220); doc.line(L, y - 2, R, y - 2); y += 2;
    row('Service total', MC.r2(inv.payable_amount != null ? inv.payable_amount : (+inv.base_amount + +inv.tax_amount)).toFixed(2), true);
    if (+inv.tip) row('Tip (not subject to tax)', MC.r2(inv.tip).toFixed(2));
    doc.setFontSize(12); doc.setDrawColor(0); doc.line(L, y - 2, R, y - 2); y += 3;
    row('TOTAL PAID', cur + ' ' + MC.r2(inv.total_amount).toFixed(2), true);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); y += 1;
    txt('Payment: ' + (inv.payment_type === 'Credit' ? 'Card' : inv.payment_type || '—'), L, y); y += 4.5;
    if (IN) { txt('Reverse charge: No', L, y); y += 4.5; }
    if (inv.status === 'void' && inv.void_reason) { txt('Void reason: ' + inv.void_reason, L, y); y += 4.5; }
    y += 6; doc.setFontSize(8.5); doc.setTextColor(90);
    doc.splitTextToSize(sel.footer || '', R - L).forEach(l => { txt(l, L, y); y += 4; });
    doc.setFontSize(7.5); txt('This is a computer-generated invoice.', L, 200);
    return doc.output('blob');
  };
  B.uploadPdf = async function (blob) {
    const c = MC.conf();
    const path = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)) + '.pdf';
    const r = await fetch(c.url + '/storage/v1/object/invoices/' + path, { method: 'POST', headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/pdf' }, body: blob });
    if (!r.ok) throw new Error('PDF upload failed (' + r.status + '): ' + (await r.text()).slice(0, 160));
    return c.url + '/storage/v1/object/public/invoices/' + path;
  };
  B.attachPdf = async function (inv) {
    const blob = await B.buildPdf(inv);
    inv._blobUrl = URL.createObjectURL(blob);
    const url = await B.uploadPdf(blob);
    await MC.sb('invoices', 'PATCH', { pdf_url: url }, 'id=eq.' + inv.id, 'return=minimal');
    inv.pdf_url = url;
    return url;
  };

  /* ── INVOICE VIEW (after issue, or from the 🧾 button) ────────────────── */
  B.viewInvoiceForRow = async function (queueId) {
    const r = rowById(queueId);
    if (!r || !r.invoice_id) return;
    try {
      await B.load();
      const inv = (await MC.sb('invoices', 'GET', null, 'id=eq.' + r.invoice_id + '&limit=1'))[0];
      if (!inv) return toast('Invoice not found', 'err');
      B.showInvoice(inv, { row: r });
    } catch (e) { toast('Could not open invoice: ' + e.message, 'err'); }
  };
  B.showInvoice = function (inv, opts) {
    opts = opts || {};
    const cur = inv.currency || 'AED', void_ = inv.status === 'void';
    const phone = hasPhone(inv.mobile);
    const waState = inv.whatsapp_sent ? '<span style="color:var(--ok);font-weight:800;">✓ Sent on WhatsApp' + (inv.whatsapp_sent_at ? ' · ' + new Date(inv.whatsapp_sent_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</span>'
      : (inv.wa_status === 'failed' ? '<span style="color:var(--err);font-weight:700;">WhatsApp failed: ' + MC.esc((inv.wa_error || '').slice(0, 120)) + '</span>' : '<span style="color:var(--muted);">Not sent yet</span>');
    const ov = MC.modal(
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;"><div>' +
        '<div style="font-family:var(--fh);font-size:19px;font-weight:800;color:var(--bd);">' + (opts.fresh ? '✅ Invoice issued' : '🧾 Invoice') + (void_ ? ' <span style="color:var(--err);">· VOID</span>' : '') + '</div>' +
        '<div style="font-size:13px;color:var(--muted);">' + MC.esc(inv.invoice_number) + ' · ' + MC.fmtDate(inv.checkin_date) + '</div></div>' +
        '<div style="text-align:right;"><div style="font-family:var(--fh);font-size:22px;font-weight:900;color:var(--bd);">' + MC.money(inv.total_amount, cur) + '</div><div style="font-size:11px;color:var(--muted);">' + (inv.payment_type === 'Credit' ? 'Card' : MC.esc(inv.payment_type || '')) + '</div></div></div>' +
      '<div style="margin:12px 0;padding:10px 12px;background:#F8FAFF;border-radius:10px;font-size:13px;">' +
        '<div><strong>' + MC.esc(inv.customer_name || 'Customer') + '</strong>' + (phone ? ' · ' + MC.esc(inv.mobile) : ' · <span style="color:var(--muted);">no phone</span>') + '</div>' +
        '<div style="color:var(--muted);">' + MC.esc(inv.service) + (+inv.discount_pct ? ' · ' + (+inv.discount_pct) + '% discount' : '') + (+inv.tax_amount ? ' · ' + MC.esc(inv.tax_label || 'Tax') + ' ' + MC.money(inv.tax_amount, cur) : '') + '</div></div>' +
      (inv._pdfError ? '<div style="margin-bottom:10px;padding:8px 12px;border-radius:8px;background:#FEF3C7;color:#92400E;font-size:12.5px;font-weight:700;">Invoice saved, but the PDF could not be stored: ' + MC.esc(inv._pdfError) + ' — tap “Create PDF” to retry.</div>' : '') +
      '<div id="mci-wa" style="font-size:12.5px;margin-bottom:10px;">' + waState + '</div>' +
      '<div style="display:grid;gap:8px;">' +
        (void_ ? '' : '<button class="btn btn-g btn-full" id="mci-send" style="padding:12px;font-size:14px;" ' + (phone ? '' : 'disabled title="No phone number"') + '>📲 Send on WhatsApp</button>') +
        '<div style="display:flex;gap:8px;"><button class="btn btn-ghost" id="mci-pdf" style="flex:1;padding:10px;">' + (inv.pdf_url || inv._blobUrl ? '👁 View PDF' : '📄 Create PDF') + '</button>' +
        (phone && !void_ ? '<button class="btn btn-ghost" id="mci-manual" style="flex:1;padding:10px;" title="Opens WhatsApp with a ready message; you press send">💬 Open in WhatsApp</button>' : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:14px;">' + (void_ ? '' : '<button class="btn btn-ghost btn-sm" id="mci-void" style="color:var(--err);border-color:rgba(220,38,38,.3);">Void</button>') +
        '<button class="btn btn-y" id="mci-close" style="flex:1;padding:10px;">Done</button></div>', { width: 440 });
    const $ = id => ov.querySelector('#' + id);
    $('mci-close').onclick = () => ov.close();
    $('mci-pdf').onclick = async () => {
      try {
        if (!inv.pdf_url && !inv._blobUrl) { $('mci-pdf').textContent = 'Creating…'; await B.attachPdf(inv); $('mci-pdf').textContent = '👁 View PDF'; }
        window.open(inv.pdf_url || inv._blobUrl, '_blank');
      } catch (e) { toast('PDF: ' + e.message, 'err'); $('mci-pdf').textContent = '📄 Create PDF'; }
    };
    if ($('mci-send')) $('mci-send').onclick = async () => {
      $('mci-send').disabled = true; $('mci-send').textContent = 'Sending…';
      const res = await B.sendWA(inv);
      $('mci-send').disabled = false; $('mci-send').textContent = res.ok ? '📲 Send again' : '📲 Send on WhatsApp';
      $('mci-wa').innerHTML = res.ok ? '<span style="color:var(--ok);font-weight:800;">✓ Sent on WhatsApp</span>' : '<span style="color:var(--err);font-weight:700;">' + MC.esc(res.error) + '</span>';
      toast(res.ok ? 'Invoice sent on WhatsApp' : res.error, res.ok ? 'ok' : 'err');
    };
    if ($('mci-manual')) $('mci-manual').onclick = () => B.manualWA(inv);
    if ($('mci-void')) $('mci-void').onclick = () => { ov.close(); B.voidDialog(inv); };
  };

  /* ── WHATSAPP (utility template through the existing Zen `send-whatsapp` function) ── */
  /* Body variables: {{1}} name  {{2}} invoice no  {{3}} date  {{4}} amount  {{5}} PDF link
   * The deployed function supports text body/header parameters only, so the PDF goes in as a link in {{5}}. */
  B.sendWA = async function (inv) {
    const key = localStorage.getItem('mw_tenant_key') || '';
    if (!key) return { ok: false, error: 'WhatsApp is not connected on this device: paste the MiniCuts API key in Settings → Invoice & Tax.' };
    if (!inv.pdf_url) return { ok: false, error: 'No PDF link yet — tap “Create PDF” first.' };
    if (!hasPhone(inv.mobile)) return { ok: false, error: 'No phone number on this invoice.' };
    const c = MC.conf(), S = B.S || DEFAULTS;
    let res;
    try {
      const r = await fetch(c.url + '/functions/v1/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key, 'x-tenant-key': key },
        body: JSON.stringify({
          tenant_id: 'minicuts', mobile: inv.mobile, template_name: S.waTemplateName, template_lang: 'en',
          params: [String(inv.customer_name || 'there').split(' ')[0], inv.invoice_number, MC.fmtDate(inv.checkin_date), MC.money(inv.total_amount, inv.currency), inv.pdf_url],
          customer_id: inv.customer_id || undefined, customer_name: inv.customer_name || undefined, sent_by: 'staff-invoice'
        })
      });
      res = await r.json();
    } catch (e) { res = { ok: false, error: e.message }; }
    const ok = !!(res && res.ok);
    const patch = ok ? { whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString(), wa_status: 'sent', wa_error: null }
                     : { wa_status: 'failed', wa_error: String((res && res.error) || 'send failed').slice(0, 300) };
    try { await MC.sb('invoices', 'PATCH', patch, 'id=eq.' + inv.id, 'return=minimal'); } catch (e) {}
    Object.assign(inv, patch);
    return ok ? { ok: true } : { ok: false, error: patch.wa_error };
  };
  B.manualWA = function (inv) {
    const msg = 'Hi ' + String(inv.customer_name || 'there').split(' ')[0] + ', thank you for visiting ' + ((inv.seller && inv.seller.bname) || 'MiNiCUTS') + '. Your invoice ' + inv.invoice_number +
      ' for ' + MC.money(inv.total_amount, inv.currency) + ' is ready' + (inv.pdf_url ? ': ' + inv.pdf_url : '.');
    window.open('https://wa.me/' + waNum(inv.mobile) + '?text=' + encodeURIComponent(msg), '_blank');
  };

  /* ── VOID ─────────────────────────────────────────────────────────────── */
  B.voidDialog = function (inv) {
    const ov = MC.modal(
      '<div style="font-family:var(--fh);font-size:18px;font-weight:800;color:var(--err);">Void ' + MC.esc(inv.invoice_number) + '?</div>' +
      '<div style="font-size:12.5px;color:var(--muted);margin:4px 0 12px;">The number stays in the register as VOID (it is never reused). The visit goes back to “no invoice” so you can check out again.</div>' +
      MC.lbl('Reason') + '<select id="mcv-reason" class="fi"><option>Wrong amount</option><option>Wrong service</option><option>Wrong discount</option><option>Duplicate</option><option>Customer cancelled</option><option>Other</option></select>' +
      '<div style="display:flex;gap:8px;margin-top:14px;"><button class="btn btn-ghost" id="mcv-no" style="padding:10px 16px;">Keep</button><button class="btn btn-full" id="mcv-yes" style="background:var(--err);color:#fff;padding:11px;">Void invoice</button></div>', { width: 380 });
    ov.querySelector('#mcv-no').onclick = () => ov.close();
    ov.querySelector('#mcv-yes').onclick = async () => {
      const reason = ov.querySelector('#mcv-reason').value;
      try {
        await MC.sb('invoices', 'PATCH', { status: 'void', void_reason: reason, voided_at: new Date().toISOString() }, 'id=eq.' + inv.id, 'return=minimal');
        if (inv.queue_id) {
          const patch = { invoice_id: null, invoice_number: null, service_value: 0, tip: null, discount_pct: 0, list_price: null };
          await MC.sb('queue', 'PATCH', patch, 'id=eq.' + inv.queue_id, 'return=minimal');
          const r = rowById(inv.queue_id); if (r) Object.assign(r, patch);
        }
        ov.close(); refresh(); toast('Invoice voided');
      } catch (e) { toast('Void failed: ' + e.message, 'err'); }
    };
  };

  /* ── SETTINGS CARD ────────────────────────────────────────────────────── */
  B.renderSettings = async function () {
    const el = document.getElementById('mc-settings-billing'); if (!el) return;
    await B.load(true);
    const S = B.S, f = (id, label, val, extra) => '<div class="fg" style="margin-bottom:10px;">' + MC.lbl(label) + '<input class="fi" id="mcs-' + id + '" value="' + MC.esc(val) + '" ' + (extra || '') + '/></div>';
    el.innerHTML =
      '<div class="card"><div class="card-title">🧾 Invoice &amp; Tax</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:6px 0 14px;">Printed on every invoice PDF. Changing these affects new invoices only.</p>' +
      '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('Country') + '<select class="fi" id="mcs-country"><option value="AE">UAE (VAT / TRN)</option><option value="IN">India (GST / GSTIN)</option></select></div>' +
      f('bname', 'Business name', S.bname) + f('addr', 'Address', S.addr) + f('phone', 'Phone', S.phone) +
      '<div class="fg" style="margin-bottom:10px;"><label id="mcs-idlbl" style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px;"></label><input class="fi" id="mcs-taxId" value="' + MC.esc(S.taxId) + '"/><div id="mcs-idhint" style="font-size:11.5px;margin-top:3px;"></div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + f('rate', 'Tax rate %', S.rate, 'type="number" step="any" min="0" max="28"') +
        '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('Prices on your list are') + '<select class="fi" id="mcs-basis"><option value="inclusive">Tax included</option><option value="exclusive">Tax added on top</option></select></div></div>' +
      '<div id="mcs-india" style="display:none;"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' + f('sac', 'SAC code', S.sac) + f('stateName', 'State', S.stateName) + f('stateCode', 'State code', S.stateCode, 'maxlength="2" placeholder="27"') + '</div>' +
        '<div style="font-size:11.5px;color:var(--muted);background:#FFF7ED;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.5;">India: invoices show GSTIN, SAC, place of supply and a CGST/SGST split (walk-in salon services are supplied in-state). The number runs sequentially per financial year (Apr–Mar) and stays within 16 characters. Salons were taxed at 5% without input credit from 22 Sep 2025 and hairdressing uses SAC 999721 — please confirm the rate, scheme (regular or composition) and registration with your CA.</div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + f('prefix', 'Invoice prefix', S.prefix, 'maxlength="8"') + f('footer', 'Footer note', S.footer) + '</div>' +
      '<div style="margin:6px 0 10px;padding-top:10px;border-top:1px solid var(--border);font-family:var(--fh);font-weight:800;color:var(--bd);">📲 WhatsApp invoice</div>' +
      f('waTemplateName', 'Approved template name (Utility)', S.waTemplateName) +
      '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('MiniCuts API key (this device)') + '<input class="fi" type="password" id="mcs-key" placeholder="same key as in Loyalty ▸ Settings ▸ Platform connection" value="' + MC.esc(localStorage.getItem('mw_tenant_key') || '') + '"/></div>' +
      '<div id="mcs-msg" class="sm"></div><button class="btn btn-y btn-full" id="mcs-save">Save Invoice Settings ✅</button></div>';
    const $ = id => el.querySelector('#mcs-' + id);
    $('country').value = S.country; $('basis').value = S.basis;
    const sync = () => {
      const c = COUNTRIES[$('country').value];
      el.querySelector('#mcs-idlbl').textContent = c.idLabel + ' (leave empty if not registered)';
      el.querySelector('#mcs-india').style.display = $('country').value === 'IN' ? 'block' : 'none';
      const v = MC.validTaxId($('country').value, $('taxId').value), h = el.querySelector('#mcs-idhint');
      h.textContent = v.empty ? 'Empty = invoices are issued without tax.' : (v.ok ? '✓ format looks valid' : ($('country').value === 'IN' ? '✗ GSTIN must be 15 characters, e.g. 27ABCDE1234F1Z5' : '✗ TRN must be 15 digits'));
      h.style.color = v.empty ? 'var(--muted)' : (v.ok ? 'var(--ok)' : 'var(--err)');
    };
    $('country').addEventListener('change', () => { $('rate').value = COUNTRIES[$('country').value].rate; sync(); });
    $('taxId').addEventListener('input', sync); sync();
    $('save').onclick = async () => {
      const country = $('country').value, msg = el.querySelector('#mcs-msg');
      const v = MC.validTaxId(country, $('taxId').value);
      if (!v.ok) { msg.className = 'sm err'; msg.textContent = (country === 'IN' ? 'GSTIN' : 'TRN') + ' format is not valid.'; return; }
      const out = {
        country, bname: $('bname').value.trim(), addr: $('addr').value.trim(), phone: $('phone').value.trim(), taxId: $('taxId').value.trim().toUpperCase(),
        rate: parseFloat($('rate').value) || 0, basis: $('basis').value, prefix: MC.cleanPrefix($('prefix').value, country), footer: $('footer').value.trim(),
        sac: $('sac').value.trim(), stateName: $('stateName').value.trim(), stateCode: $('stateCode').value.trim(), currency: COUNTRIES[country].currency,
        waTemplateName: $('waTemplateName').value.trim() || DEFAULTS.waTemplateName
      };
      /* keep the legacy keys that earlier versions of the app wrote */
      Object.assign(out, { trn: out.taxId, taxrate: out.rate, tax_incl: out.basis });
      try {
        const old = (await MC.getConfig('co_settings')) || {};
        await MC.setConfig('co_settings', Object.assign({}, old, out));
        const key = $('key').value.trim(); if (key) localStorage.setItem('mw_tenant_key', key); else localStorage.removeItem('mw_tenant_key');
        B.loaded = false; await B.load(true);
        msg.className = 'sm ok'; msg.textContent = 'Saved.';
      } catch (e) { msg.className = 'sm err'; msg.textContent = 'Save failed: ' + e.message; }
    };
  };

  /* expose for the host page */
  window.mcRowButton = B.rowButton;
})();
