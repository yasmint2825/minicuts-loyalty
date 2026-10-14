# Checkout, Invoicing, Appointments & Reports (branch `Appointments`)

## Rollout order
1. Run `sql/001_billing_and_appointments.sql` on **dev** (`flczmpscouzthbcostlg`), test, then **prod** (`wtapyfgtwkjyjrjdnhkb`). Then Supabase ▸ Settings ▸ API ▸ Reload schema.
2. Staff app ▸ Settings ▸ **Invoice & Tax**: confirm business name, address, TRN/GSTIN, rate, and whether list prices include tax. (Saved TRN `11233333333` is a placeholder; a UAE TRN has 15 digits.) Paste the MiniCuts API key (same as `mw_tenant_key`) on each device that sends WhatsApp.
3. Submit Meta **Utility** template `mc_invoice_utility` (en):
   `Hi {{1}}, thank you for visiting MiNiCUTS. Your invoice {{2}} dated {{3}} for {{4}} is ready. View or download it here: {{5}} Thank you for choosing MiNiCUTS.`
   Until approved, staff can use "Open in WhatsApp" (wa.me, manual send).
4. Settings ▸ **Appointments**: confirm opening hours and bookable days (Sat/Sun default to walk-in only).
5. Merge to `main` only after testing on dev.

## How it works
- **Checkout**: 💳 button on History rows and done Queue rows. Service, price, discount %, tip, Cash/Card → Issue Invoice. `queue.service_value` = amount payable for the service (tax included, tip excluded), so cash reconciliation is unchanged.
- **Invoice**: number `PREFIX/FY/00001`, sequential per FY (India: Apr–Mar), unique index + retry. Void keeps the number; the visit can be re-checked-out. PDF (jsPDF) stored in public bucket `invoices`; the WhatsApp message carries the link.
- **India**: GSTIN, SAC 999721, place of supply, CGST/SGST split, "Bill of Supply" if unregistered. Confirm rate/scheme with your CA.
- **Appointments**: slot length = Salon Setup duration (+ buffer). Availability = hours ∩ stylist days off (Staff Mgmt) − approved leave − roster holidays − existing bookings. Arrived → creates a queue token.
- **Reports** (PIN-gated): Sales & payments, Stylists, Services, Invoice register, Acquisition, Appointments; all export CSV.

## Known limits / follow-ups
- Zen `send-whatsapp` supports text params only, so the PDF is a link, not an attachment; it is also UAE-only (E.164), which blocks India numbers.
- Open anon RLS policies and hardcoded PIN match the existing app; PDF links are unguessable but public.
- Guests have no customer record, so acquisition for them shows "Unknown".
- Acquisition report covers live queue only; the Loyalty dashboard merges pre-9 Jun history.
- Tests: `node tests/unit.test.js`; `node tests/e2e.js` (Playwright, mocked Supabase).

## Grid is read-only before checkout (once the migration is applied)
- Queue rows no longer take AED / Tip / Pay typed in the grid. **✅ Stamp & Checkout** opens one window for service, price, discount %, tip and Cash/Card, issues the invoice, then stamps the visit ("Done — stamp visit").
- Safety: until `sql/001_billing_and_appointments.sql` has run, the page detects it and the grid works exactly as before (typeable amounts, plain Stamp). `?freeze=1` in the page address previews the new layout without the database.
- After an invoice exists, History ▸ Edit locks amount, tip and payment. Void the invoice to change them.


## Sending WhatsApp through Zen (no key in the browser)

`supabase/functions/mc-send-invoice/index.ts` lets the staff app send an invoice by passing only the **invoice id**. The function reads the phone number, amount, date, PDF link and template name from the database and calls Zen's existing `send-whatsapp` with service-role trust, so Zen's WhatsApp credentials, template handling and message log are used. Guard rails: only the configured invoice template, only to the phone stored on an existing non-void invoice, PDF link must be from the `invoices` bucket, max 2 sends per phone/template/10 min, 5 test messages/hour.

- Not deployed yet (production change - needs approval after the SQL migration, because it reads `invoices`).
- The staff app calls it first; if it answers 404 (not deployed) the app falls back to the browser-stored `mwk_` key.
- Deploy: `supabase functions deploy mc-send-invoice` (verify_jwt on).

## Practice mode (test locally without touching production)

Open `minicuts-staff.html?demo=1` (or `minicuts-checkin.html?demo=1`). `mc-demo.js` answers every Supabase call from a small database kept in the browser (localStorage); nothing reaches Supabase and no WhatsApp is sent. A red bar shows "PRACTICE MODE" with a reset button. Without `?demo=1` the file does nothing. Automated check: `node tests/e2e_demo.js`.
