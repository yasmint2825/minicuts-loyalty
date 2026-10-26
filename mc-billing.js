/* ============================================================================
 * mc-billing.js — Checkout (with % or flat AED discount) -> Invoice -> PDF -> WhatsApp utility message
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
  const DEFAULT_DISCOUNTS = [5, 10, 15, 20, 25, 50];
  B.parseDiscounts = function (v) {
    const a = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,\s]+/)).map(Number).filter(n => n > 0 && n <= 100);
    const u = [...new Set(a)].sort((x, y) => x - y);
    return u.length ? u : DEFAULT_DISCOUNTS.slice();
  };
  const DEFAULTS = { country: 'AE', bname: 'MiNiCUTS FZCO', addr: '', phone: '', taxId: '', rate: 5, basis: 'inclusive', prefix: 'MC',
    footer: 'Thank you for visiting MiNiCUTS!', sac: '999721', stateName: '', stateCode: '', currency: 'AED', waTemplateName: 'booking_completed_invoice' };

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
      waTemplateName: (raw.waTemplateName && raw.waTemplateName !== 'mc_invoice_utility') ? raw.waTemplateName : DEFAULTS.waTemplateName,
      waTemplateLang: raw.waTemplateLang || 'en'
    });
    S.discounts = B.parseDiscounts(raw.discounts);
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
  /* SalonChain: with chain mode off MC.can() is always true, so nothing changes for today's salon */
  const can = p => !MC.can || MC.can(p);

  /* ── buttons injected into History / Queue rows ───────────────────────── */
  B.rowButton = function (r) {
    if (!r || r.status === 'cancelled') return '';
    if (r.invoice_id) {
      return '<button class="btn btn-sm" style="background:#EEF6FF;color:#1565C0;font-size:11px;white-space:nowrap;" title="' + MC.esc(r.invoice_number || '') + '" onclick="MC.billing.viewInvoiceForRow(\'' + r.id + '\')">🧾 Invoice</button>' +
        (can('invoice.void') ? '<button class="btn btn-sm" style="background:#FEF2F2;color:#DC2626;font-size:11px;white-space:nowrap;" onclick="MC.billing.voidForRow(\'' + r.id + '\')">✕ Void</button>' : '');
    }
    if (!can('checkout.create')) return '';
    return '<button class="btn btn-sm btn-y" style="font-size:11px;white-space:nowrap;" onclick="MC.billing.openCheckout(\'' + r.id + '\')">💳 Checkout</button>';
  };

  /* small lines under the amount in the grid: discount + tax note (the amount itself is always the full payable value incl. VAT) */
  B.cellNote = function (r) {
    if (!r) return '';
    const parts = [];
    if (Number(r.discount_pct) > 0) parts.push(r.discount_pct + '% off' + (r.list_price ? ' (full ' + r.list_price + ')' : ''));
    if (r.invoice_id && B.S && B.S.taxRegistered) parts.push('incl. ' + (B.S.taxLabel || 'VAT'));
    return parts.length ? '<div style="font-size:11px;font-weight:600;color:var(--muted);">' + MC.esc(parts.join(' · ')) + '</div>' : '';
  };
  B.voidForRow = async function (queueId) {
    const r = rowById(queueId); if (!r || !r.invoice_id) return;
    try {
      const inv = (await MC.sb('invoices', 'GET', null, 'id=eq.' + r.invoice_id + '&limit=1'))[0];
      if (!inv) return toast('Invoice not found', 'err');
      B.voidDialog(inv);
    } catch (e) { toast('Could not open invoice: ' + e.message, 'err'); }
  };

  /* ── Is the database ready? Until the migration has run, the grid keeps working exactly as before. ── */
  B.ready = false;
  B.frozenGrid = () => B.ready === true || /[?&]freeze=1/.test(location.search);
  B.probe = async function () {
    try {
      await MC.sb('invoices', 'GET', null, 'select=id,fy,seq,discount_pct,payable_amount,pdf_url&limit=1');
      await MC.sb('queue', 'GET', null, 'select=id,invoice_id,list_price,discount_pct&limit=1');
      await B.load(); B.ready = true; refresh();
    } catch (e) { B.ready = false; console.info('MiNiCUTS billing: database migration not applied yet — grid stays in classic mode.'); }
  };

  /* ✅ Stamp & Checkout: amount, discount, tip and payment are captured in ONE step, then the visit is stamped. */
  B.stampFlow = function (queueId) {
    const r = rowById(queueId); if (!r) return;
    const stamp = () => markDone(r.id, r.customer_id, r.customer_name, r.mobile);
    if (r.invoice_id && Number(r.service_value) > 0 && r.payment_type) { stamp(); return; }   // invoiced earlier, stamp was interrupted
    B.openCheckout(queueId, { stampAfter: stamp });
  };

  /* ── CHECKOUT MODAL ───────────────────────────────────────────────────── */
  B.openCheckout = async function (queueId, opts) {
    opts = opts || {};
    const r = rowById(queueId);
    if (!r) { toast('Row not found — reload the list', 'err'); return; }
    if (r.invoice_id) return B.viewInvoiceForRow(queueId);
    await B.load();
    const S = B.S;
    const byName = B.services.find(s => String(s.name).toLowerCase() === String(r.service || '').toLowerCase());
    const seed = MC.seedFromRow(r, byName ? byName.price : 0);
    let chosen = byName || null;                       // the service MUST come from the Salon Setup price list
    const seedPct = S.discounts.includes(seed.pct) ? seed.pct : 0;

    const allPctChips = [...new Set([0].concat(S.discounts).concat([100]))].sort((a, b) => a - b);
    const chips = allPctChips.map(p => '<button type="button" class="btn btn-ghost btn-sm mc-chip" data-p="' + p + '" style="padding:6px 10px;">' + (p === 0 ? 'None' : p === 100 ? '100% Free' : p + '%') + '</button>').join('');
    const ov = MC.modal(
      '<div style="font-family:var(--fh);font-size:19px;font-weight:800;color:var(--bd);">💳 Checkout <span style="font-size:10px;font-weight:600;color:var(--muted);">' + MC.esc(MC.version) + '</span></div>' +
      '<div style="font-size:13px;color:var(--muted);margin:2px 0 14px;">' + MC.esc(r.customer_name || 'Guest') + ' · Token ' + MC.pad(r.token_number || 0) + (stylistsOf(r) ? ' · ' + MC.esc(stylistsOf(r)) : '') + '</div>' +
      '<div style="display:grid;gap:12px;">' +
        '<div>' + MC.lbl('Service') + '<div id="mcc-types" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;"></div>' +
          '<div style="position:relative;"><input id="mcc-svcname" class="fi" type="text" autocomplete="off" placeholder="Type to search the price list, e.g. haircut, colour…" value="' + MC.esc(chosen ? chosen.name : '') + '"/>' +
          '<div id="mcc-list" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:5;background:#fff;border:1px solid var(--border);border-radius:10px;max-height:230px;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.18);"></div></div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
          '<div>' + MC.lbl('Price (' + S.currency + ') · from price list') + '<input id="mcc-price" class="fi" type="text" readonly tabindex="-1" value="' + MC.esc(chosen ? chosen.price : '') + '" placeholder="Pick a service" style="background:#F1F5F9;font-weight:800;color:var(--bd);"/></div>' +
          '<div>' + MC.lbl('Tip (' + S.currency + ')') + '<input id="mcc-tip" class="fi" type="number" min="0" step="any" value="' + MC.esc(r.tip || '') + '" placeholder="0"/></div>' +
        '</div>' +
        '<div>' + MC.lbl('Discount') +
          (can('discount.apply') ? (
            '<div style="display:flex;gap:6px;margin-bottom:6px;">' +
              '<button type="button" id="mcc-dm-pct" class="btn btn-b btn-sm" style="padding:4px 10px;">% Off</button>' +
              '<button type="button" id="mcc-dm-aed" class="btn btn-ghost btn-sm" style="padding:4px 10px;">AED Off</button>' +
            '</div>' +
            '<div id="mcc-disc-pct-wrap" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' + chips + '</div>' +
            '<div id="mcc-disc-aed-wrap" style="display:none;margin-top:4px;">' +
              '<input id="mcc-disc-aed-val" class="fi" type="number" min="0" step="0.01" placeholder="Enter AED amount off (e.g. 10)" style="max-width:220px;"/>' +
            '</div>'
          ) : '<span style="font-size:12px;color:var(--muted);">Your role cannot give discounts</span>') +
          '<input id="mcc-disc" type="hidden" value="' + MC.esc(seedPct) + '"/>' +
          '<input id="mcc-disc-flat" type="hidden" value="0"/>' +
        '</div>' +
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
    let discMode = 'pct'; // 'pct' or 'aed'

    const read = () => {
      const listPrice = parseFloat($('mcc-price').value) || 0;
      const tip = parseFloat($('mcc-tip').value) || 0;
      if (discMode === 'aed') {
        const flat = parseFloat($('mcc-disc-aed-val').value) || 0;
        return { listPrice, discountPct: 0, discountFlat: flat, tip };
      }
      return { listPrice, discountPct: parseFloat($('mcc-disc').value) || 0, discountFlat: 0, tip };
    };
    const calc = () => { const v = read(); return MC.calcInvoice({ listPrice: v.listPrice, discountPct: v.discountPct, discountFlat: v.discountFlat, tip: v.tip, taxRate: S.rate, basis: S.basis, taxRegistered: S.taxRegistered, country: S.country }); };
    const line = (a, b, strong, color) => '<div style="display:flex;justify-content:space-between;' + (strong ? 'font-weight:800;font-size:15px;color:var(--bd);border-top:1px solid #DBEAFE;margin-top:6px;padding-top:6px;' : '') + (color ? 'color:' + color + ';' : '') + '"><span>' + a + '</span><span>' + b + '</span></div>';
    const paint = () => {
      const c = calc(), cur = S.currency;
      let h = line('Price', MC.money(c.list, cur));
      if (c.discountAmount) {
        const discLabel = discMode === 'aed' ? 'Discount (AED ' + MC.money(c.discountAmount, cur) + ' off)' : 'Discount (' + c.discountPct + '%)';
        h += line(discLabel, '− ' + MC.money(c.discountAmount, cur), false, 'var(--err)');
      }
      if (S.taxRegistered && c.tax > 0) {
        h += line('Taxable value', MC.money(c.taxable, cur), false, 'var(--muted)');
        if (S.country === 'IN') { h += line('CGST ' + (S.rate / 2) + '%', MC.money(c.cgst, cur), false, 'var(--muted)'); h += line('SGST ' + (S.rate / 2) + '%', MC.money(c.sgst, cur), false, 'var(--muted)'); }
        else h += line(S.taxLabel + ' ' + S.rate + '%' + (S.basis === 'inclusive' ? ' (included)' : ''), MC.money(c.tax, cur), false, 'var(--muted)');
      }
      h += line('Service total', MC.money(c.payable, cur));
      if (c.tip) h += line('Tip', MC.money(c.tip, cur), false, 'var(--ok)');
      h += line('Total to collect', MC.money(c.grand, cur), true);
      $('mcc-sum').innerHTML = h;
      if (discMode === 'pct') ov.querySelectorAll('.mc-chip').forEach(b => { const on = +b.dataset.p === (parseFloat($('mcc-disc').value) || 0); b.style.background = on ? 'var(--b)' : 'transparent'; b.style.color = on ? '#fff' : 'var(--b)'; });
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
      box.querySelectorAll('[data-i]').forEach(d => d.addEventListener('mousedown', e => { e.preventDefault(); const x = B.services[+d.dataset.i]; chosen = x; $('mcc-svcname').value = x.name; $('mcc-price').value = x.price; box.style.display = 'none'; paint(); $('mcc-disc').focus(); }));
    };
    $('mcc-svcname').addEventListener('input', () => {
      const t = norm($('mcc-svcname').value), m = B.services.filter(x => norm(x.name) === t);
      chosen = m.length === 1 ? m[0] : null;                 // typing alone never sets a price
      $('mcc-price').value = chosen ? chosen.price : ''; paint(); showList(true);
    });
    $('mcc-svcname').addEventListener('focus', () => showList(true));
    $('mcc-svcname').addEventListener('blur', () => setTimeout(() => { $('mcc-list').style.display = 'none'; }, 120));
    paintTypes();
    $('mcc-tip').addEventListener('input', paint);
    ov.querySelectorAll('.mc-chip').forEach(b => b.addEventListener('click', () => { $('mcc-disc').value = b.dataset.p; paint(); }));
    ov.querySelectorAll('.mc-pay').forEach(b => b.addEventListener('click', () => { pay = b.dataset.v; paint(); }));
    /* Discount mode toggle */
    const dmPct = $('mcc-dm-pct'), dmAed = $('mcc-dm-aed');
    if (dmPct && dmAed) {
      const switchMode = mode => {
        discMode = mode;
        const isPct = mode === 'pct';
        dmPct.className = 'btn btn-sm ' + (isPct ? 'btn-b' : 'btn-ghost'); dmPct.style.padding = '4px 10px;';
        dmAed.className = 'btn btn-sm ' + (!isPct ? 'btn-b' : 'btn-ghost'); dmAed.style.padding = '4px 10px;';
        $('mcc-disc-pct-wrap').style.display = isPct ? 'flex' : 'none';
        $('mcc-disc-aed-wrap').style.display = isPct ? 'none' : 'block';
        if (isPct) { $('mcc-disc').value = 0; } else { $('mcc-disc-aed-val').value = ''; }
        paint();
      };
      dmPct.addEventListener('click', () => switchMode('pct'));
      dmAed.addEventListener('click', () => switchMode('aed'));
      const aedInput = $('mcc-disc-aed-val');
      if (aedInput) aedInput.addEventListener('input', paint);
    }
    $('mcc-cancel').addEventListener('click', () => ov.close());
    $('mcc-issue').addEventListener('click', async () => {
      const msg = $('mcc-msg'); msg.style.display = 'none';
      const v = read();
      const fail = t => { msg.textContent = t; msg.style.display = 'block'; };
      if (!chosen) return fail('Pick the service from the price list.');
      if (!(Number(chosen.price) > 0)) return fail('This service has no price in Salon Setup — add it there first.');
      if (discMode === 'pct' && v.discountPct !== 0 && !S.discounts.includes(v.discountPct) && v.discountPct !== 100) return fail('Discount not allowed.');
      if (discMode === 'aed' && (v.discountFlat < 0 || v.discountFlat > (parseFloat($('mcc-price').value) || 0))) return fail('AED discount must be between 0 and the service price.');
      if (!pay) return fail('Choose Cash or Card.');
      const btn = $('mcc-issue'); btn.disabled = true; btn.textContent = 'Issuing…';
      try {
        const inv = await B.issue(r, { service: chosen.name.trim(), payment: pay, listPrice: Number(chosen.price), discountPct: v.discountPct, discountFlat: v.discountFlat, tip: v.tip });
        ov.close();
        B.showInvoice(inv, { fresh: true, onDone: opts.stampAfter });
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
    const c = MC.calcInvoice({ listPrice: f.listPrice, discountPct: f.discountPct, discountFlat: f.discountFlat, tip: f.tip, taxRate: S.rate, basis: S.basis, taxRegistered: S.taxRegistered, country: S.country });
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
      '<div style="display:flex;gap:8px;margin-top:14px;">' + (void_ || !can('invoice.void') ? '' : '<button class="btn btn-ghost btn-sm" id="mci-void" style="color:var(--err);border-color:rgba(220,38,38,.3);">Void</button>') +
        '<button class="btn btn-y" id="mci-close" style="flex:1;padding:10px;">' + (opts.onDone ? 'Done — stamp visit ✅' : 'Done') + '</button></div>', { width: 440, sticky: !!opts.onDone });
    const $ = id => ov.querySelector('#' + id);
    $('mci-close').onclick = () => { ov.close(); if (opts.onDone) opts.onDone(); };
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
  /* Preferred route: ask Zen (through the mc-send-invoice function) to send — no key needed in the browser.
   * Returns null when that function is not deployed yet, so the caller can fall back to the key route. */
  B.viaZen = async function (payload) {
    const c = MC.conf();
    try {
      const r = await fetch(c.url + '/functions/v1/mc-send-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key }, body: JSON.stringify(payload) });
      if (r.status === 404) return null;
      const j = await r.json().catch(() => ({ ok: false, error: 'Unexpected reply (' + r.status + ')' }));
      return j;
    } catch (e) { return null; }
  };
  /* Template booking_completed_invoice:  Hi {{1}}, Your appointment at {{2}} on {{3}} is Completed. ... Here is your invoice: {{4}} ... The Team at {{5}} */
  B.brand = function (inv) {
    const n = (inv && inv.seller && inv.seller.bname) || (B.S && B.S.bname) || 'MiNiCUTS';
    return String(n).replace(/\s*\(.*\)\s*$/, '').replace(/\s+(FZCO|FZE|FZ-LLC|LLC|L\.L\.C\.?)$/i, '').trim() || 'MiNiCUTS';
  };
  B.waParams = function (inv) {
    const brand = B.brand(inv);
    return [String(inv.customer_name || 'there').split(' ')[0], brand, MC.fmtDate(inv.checkin_date), inv.pdf_url, brand];
  };
  B.sendWA = async function (inv, opts) {
    opts = opts || {};
    if (!opts.noZen && (inv.id || opts.test) && !(opts.test ? false : !inv.pdf_url)) {
      if (!hasPhone(inv.mobile)) return { ok: false, error: 'No phone number on this invoice.' };
      const z = await B.viaZen(opts.test ? { test_mobile: inv.mobile, template: opts.template, template_lang: opts.lang } : { invoice_id: inv.id });
      if (z) {
        const okz = !!z.ok;
        if (!opts.test) {
          const patch = okz ? { whatsapp_sent: true, whatsapp_sent_at: new Date().toISOString(), wa_status: 'sent', wa_error: null } : { wa_status: 'failed', wa_error: String(z.error || 'send failed').slice(0, 300) };
          try { await MC.sb('invoices', 'PATCH', patch, 'id=eq.' + inv.id, 'return=minimal'); } catch (e) {}
          Object.assign(inv, patch);
        }
        return okz ? { ok: true } : { ok: false, error: String(z.error || 'send failed').slice(0, 300) };
      }
    }
    const key = localStorage.getItem('mw_tenant_key') || '';
    if (!key) return { ok: false, error: 'WhatsApp sending is not set up yet: either deploy the Zen send function, or paste the MiniCuts API key in Settings → WhatsApp.' };
    if (!inv.pdf_url && !opts.test) return { ok: false, error: 'No PDF link yet — tap “Create PDF” first.' };
    if (!hasPhone(inv.mobile)) return { ok: false, error: 'No phone number on this invoice.' };
    const c = MC.conf(), S = B.S || DEFAULTS;
    let res;
    try {
      const r = await fetch(c.url + '/functions/v1/send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key, 'x-tenant-key': key },
        body: JSON.stringify({
          tenant_id: 'minicuts', mobile: inv.mobile, template_name: opts.template || S.waTemplateName, template_lang: opts.lang || S.waTemplateLang || 'en',
          params: B.waParams(inv),
          customer_id: inv.customer_id || undefined, customer_name: inv.customer_name || undefined, sent_by: opts.test ? 'staff-invoice-test' : 'staff-invoice'
        })
      });
      res = await r.json();
    } catch (e) { res = { ok: false, error: e.message }; }
    const ok = !!(res && res.ok);
    if (opts.test) return ok ? { ok: true } : { ok: false, error: String((res && (res.error || res.message)) || 'send failed').slice(0, 300) };
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
      '<div style="font-size:12.5px;color:var(--muted);margin:4px 0 12px;">The number stays in the register as VOID (it is never reused). The amount is cleared and the visit goes back to “no invoice” so you can check out again. The customer’s loyalty stamp is not changed.</div>' +
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
          if (typeof window.mcMarkVoided === 'function') window.mcMarkVoided(inv.queue_id);   // stop counting this visit as served until it is checked out again
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
      '<div style="font-family:var(--fh);font-weight:800;color:var(--bd);font-size:13px;margin-bottom:8px;">1 · Business details</div>' +
      '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('Country') + '<select class="fi" id="mcs-country"><option value="AE">UAE (VAT / TRN)</option><option value="IN">India (GST / GSTIN)</option></select></div>' +
      f('bname', 'Business name', S.bname) + f('addr', 'Address', S.addr) + f('phone', 'Phone', S.phone) +
      '<div class="fg" style="margin-bottom:10px;"><label id="mcs-idlbl" style="font-size:11px;font-weight:800;color:#6B7280;text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:5px;"></label><input class="fi" id="mcs-taxId" value="' + MC.esc(S.taxId) + '"/><div id="mcs-idhint" style="font-size:11.5px;margin-top:3px;"></div></div>' +
      '<div style="margin:14px 0 8px;padding-top:10px;border-top:1px solid var(--border);font-family:var(--fh);font-weight:800;color:var(--bd);font-size:13px;">2 · Tax</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + f('rate', 'Tax rate %', S.rate, 'type="number" step="any" min="0" max="28"') +
        '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('Prices on your list are') + '<select class="fi" id="mcs-basis"><option value="inclusive">Tax included</option><option value="exclusive">Tax added on top</option></select></div></div>' +
      '<div id="mcs-india" style="display:none;"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">' + f('sac', 'SAC code', S.sac) + f('stateName', 'State', S.stateName) + f('stateCode', 'State code', S.stateCode, 'maxlength="2" placeholder="27"') + '</div>' +
        '<div style="font-size:11.5px;color:var(--muted);background:#FFF7ED;border-radius:8px;padding:8px 10px;margin-bottom:10px;line-height:1.5;">India: invoices show GSTIN, SAC, place of supply and a CGST/SGST split (walk-in salon services are supplied in-state). The number runs sequentially per financial year (Apr–Mar) and stays within 16 characters. Salons were taxed at 5% without input credit from 22 Sep 2025 and hairdressing uses SAC 999721 — please confirm the rate, scheme (regular or composition) and registration with your CA.</div></div>' +
      '<div style="margin:14px 0 8px;padding-top:10px;border-top:1px solid var(--border);font-family:var(--fh);font-weight:800;color:var(--bd);font-size:13px;">3 · Invoice numbering &amp; checkout</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' + f('prefix', 'Invoice prefix', S.prefix, 'maxlength="8"') + f('footer', 'Footer note', S.footer) + '</div>' +
      f('discounts', 'Allowed discount % at checkout (comma separated)', S.discounts.join(', ')) +
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
        discounts: B.parseDiscounts($('discounts').value)
      };
      /* keep the legacy keys that earlier versions of the app wrote */
      Object.assign(out, { trn: out.taxId, taxrate: out.rate, tax_incl: out.basis });
      try {
        const old = (await MC.getConfig('co_settings')) || {};
        await MC.setConfig('co_settings', Object.assign({}, old, out));
        B.loaded = false; await B.load(true);
        msg.className = 'sm ok'; msg.textContent = 'Saved.';
      } catch (e) { msg.className = 'sm err'; msg.textContent = 'Save failed: ' + e.message; }
    };
  };


  /* ── Settings ▸ WhatsApp invoice (template, device key, test message) ── */
  B.renderWaSettings = async function () {
    const el = document.getElementById('mc-settings-wa'); if (!el) return;
    await B.load(); const S = B.S || DEFAULTS, $ = id => el.querySelector('#mcw-' + id);
    el.innerHTML = '<div class="card"><div class="card-title">📲 WhatsApp invoice</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:6px 0 12px;">Invoices go out through your approved <b>Utility</b> template with these 5 values in order: customer first name · salon name · visit date · invoice PDF link · salon name</p>' +
      '<div class="fg" style="margin-bottom:10px;">' + MC.lbl('Message template') +
        '<div style="display:flex;gap:8px;"><select class="fi" id="mcw-tplsel" style="flex:1;"><option value="">Loading your approved templates…</option></select><button class="btn btn-ghost" id="mcw-reload" title="Reload from WhatsApp">↻</button></div>' +
        '<input class="fi" id="mcw-tpl" value="' + MC.esc(S.waTemplateName) + '" style="margin-top:6px;display:none;" placeholder="template name"/><input type="hidden" id="mcw-lang" value="' + MC.esc(S.waTemplateLang || 'en') + '"/>' +
        '<div id="mcw-tplinfo" style="font-size:12px;color:var(--muted);margin-top:5px;line-height:1.5;"></div></div>' +
      '<div id="mcw-msg" class="sm"></div><div style="display:flex;gap:8px;"><button class="btn btn-y" id="mcw-save" style="flex:1;">Save WhatsApp Settings ✅</button><button class="btn btn-ghost" id="mcw-check">🔌 Check connection</button></div>' +
      '<div style="margin:16px 0 8px;padding-top:12px;border-top:1px solid var(--border);font-family:var(--fh);font-weight:800;color:var(--bd);font-size:13px;">🧪 Send a test message</div>' +
      '<p style="font-size:12.5px;color:var(--muted);margin:0 0 8px;">Sends the template above with sample values (invoice TEST/00000, a sample amount and a sample link) to the number you enter. No invoice is created and nothing is saved in the sales data.</p>' +
      '<div style="display:flex;gap:8px;"><input class="fi" id="mcw-to" inputmode="tel" placeholder="Your own WhatsApp number, e.g. 0501234567" style="flex:1;"/><button class="btn btn-b" id="mcw-test">Send test</button></div>' +
      '<div id="mcw-tmsg" class="sm" style="margin-top:6px;"></div></div>';
    /* Pick-list of templates Meta has approved for this WhatsApp account (read through Zen). Falls back to a typed name. */
    const sel = $('tplsel'), info = $('tplinfo'); let TPLS = [];
    const showInfo = () => {
      const v = sel.value, t = TPLS.find(x => x.name + '|' + x.language === v);
      if (!t) { info.textContent = ''; return; }
      $('tpl').value = t.name; $('lang').value = t.language;
      const okVars = t.vars === 5, okStatus = t.status === 'APPROVED';
      info.innerHTML = '<div style="background:#F9FAFB;border:1px solid var(--border);border-radius:8px;padding:8px 10px;white-space:pre-wrap;color:#374151;">' + MC.esc(t.body || '(no body text)') + '</div>' +
        '<div style="margin-top:4px;color:' + (okVars && okStatus ? 'var(--ok)' : '#B45309') + ';">' + (okStatus ? '✓ Approved' : '⚠ Status: ' + MC.esc(t.status)) + ' · ' + MC.esc(t.category || '') + ' · language ' + MC.esc(t.language) + ' · ' + t.vars + ' variable' + (t.vars === 1 ? '' : 's') +
        (okVars ? ' — matches the 5 values we send.' : ' — we send exactly 5 values (name, salon, date, link, salon), so this template will not work.') + (t.has_header ? ' ⚠ Has a header, which we do not fill.' : '') + '</div>';
    };
    const loadTpls = async () => {
      sel.style.display = ''; $('tpl').style.display = 'none';
      sel.innerHTML = '<option value="">Loading your approved templates…</option>';
      const z = await B.viaZen({ list_templates: true });
      if (z && z.ok && Array.isArray(z.templates)) {
        TPLS = z.templates.filter(t => t.status === 'APPROVED');
        const fit = TPLS.filter(t => t.vars === 5 && !t.has_header), rest = TPLS.filter(t => !(t.vars === 5 && !t.has_header));
        const o = t => '<option value="' + MC.esc(t.name + '|' + t.language) + '">' + MC.esc(t.name) + ' (' + MC.esc(t.language) + ')</option>';
        sel.innerHTML = '<option value="">— choose a template —</option>' + (fit.length ? '<optgroup label="Fits invoices (5 values)">' + fit.map(o).join('') + '</optgroup>' : '') + (rest.length ? '<optgroup label="Other approved templates">' + rest.map(o).join('') + '</optgroup>' : '');
        const cur = TPLS.find(t => t.name === $('tpl').value && t.language === $('lang').value) || TPLS.find(t => t.name === $('tpl').value);
        if (cur) sel.value = cur.name + '|' + cur.language;
        else info.innerHTML = '<span style="color:#B45309;">⚠ “' + MC.esc($('tpl').value) + '” is not in your approved list — pick one above.</span>';
        if (cur) showInfo();
      } else {
        sel.style.display = 'none'; $('tpl').style.display = 'block';
        info.innerHTML = '<span style="color:#B45309;">Could not load the list' + (z && z.error ? ' (' + MC.esc(String(z.error).slice(0, 120)) + ')' : '') + '. Type the exact template name and language.</span>';
      }
    };
    sel.onchange = showInfo; $('reload').onclick = loadTpls; loadTpls();
    $('save').onclick = async () => {
      const m = $('msg');
      try {
        const old = (await MC.getConfig('co_settings')) || {};
        await MC.setConfig('co_settings', Object.assign({}, old, { waTemplateName: $('tpl').value.trim() || DEFAULTS.waTemplateName, waTemplateLang: $('lang').value.trim() || 'en' }));
        B.loaded = false; await B.load(true); m.className = 'sm ok'; m.textContent = 'Saved. Now press Send test.';
      } catch (e) { m.className = 'sm err'; m.textContent = 'Save failed: ' + e.message; }
    };
    $('check').onclick = async () => {
      const m = $('msg'); m.className = 'sm'; m.textContent = 'Checking…';
      const zp = await B.viaZen({ ping: true });
      if (zp && zp.ok) { m.className = 'sm ok'; m.textContent = '✓ Connected through Zen. Use “Send test” below to confirm WhatsApp delivers.'; }
      else { m.className = 'sm err'; m.textContent = '✗ Could not reach the Zen send function' + (zp && zp.error ? ' (' + String(zp.error).slice(0, 120) + ')' : ' — it may not be deployed') + '.'; }
    };
    $('test').onclick = async () => {
      const m = $('tmsg'), to = $('to').value.trim();
      if (!hasPhone(to)) { m.className = 'sm err'; m.textContent = 'Enter a valid WhatsApp number first.'; return; }
      $('test').disabled = true; m.className = 'sm'; m.textContent = 'Sending…';
      const res = await B.sendWA({ mobile: to, customer_name: 'Test', invoice_number: 'TEST/00000', checkin_date: MC.today(), total_amount: 50, currency: (B.S || DEFAULTS).currency || 'AED', pdf_url: location.href.split('#')[0].replace(/[^/]*$/, '') }, { test: true, template: $('tpl').value.trim() || undefined, lang: $('lang').value.trim() || undefined });
      $('test').disabled = false;
      m.className = 'sm ' + (res.ok ? 'ok' : 'err'); if (!res.ok && /132001|does not exist/i.test(res.error || '')) res.error = '✗ WhatsApp has no approved template with this name + language. Pick one from the list above (it only shows approved ones), or check the language. Details: ' + res.error;
      m.textContent = res.ok ? '✓ Accepted by WhatsApp — check the phone (can take a few seconds).' : (/Unauthorized/i.test(res.error) ? '✗ The platform does not accept the API key saved on this device (wrong, mistyped or revoked). The key must be the MiniCuts business-app key (starts “mwk_”). Recover it from the browser where the Loyalty app was set up, or ask Zen to create a new one — or use the Zen send function (no key needed).' : res.error);
    };
  };

  if (typeof document !== 'undefined') setTimeout(() => B.probe(), 0);

  /* expose for the host page */
  window.mcRowButton = B.rowButton;
})();
