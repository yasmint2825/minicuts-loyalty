# Testing Strategy — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** developer experience

## Current State

There are **no automated tests**. All verification is manual. This is acceptable for the current scale (single tenant, ~1,743 queue rows since June) but must change before multi-tenant SaaS launch.

## Manual Test Checklist (before any deploy)

### Check-In Kiosk
- [ ] New customer: enter mobile → fill form → confirm token appears
- [ ] Returning customer: enter existing mobile → confirm lookup works → token issued
- [ ] Guest: select guest → select kids count → confirm token
- [ ] T&C checkbox appears for returning customer without consent
- [ ] Sibling check-in inherits location from existing sibling

### Queue Management
- [ ] Queue loads without "Loading queue..." stuck state
- [ ] Call button updates status instantly (optimistic update)
- [ ] Stamp button adds stamp — check Supabase `visits` table
- [ ] Done rows appear below separator with 💳 Checkout button
- [ ] History tab loads for selected date — no failure after 3+ clicks

### Checkout & Invoicing
- [ ] 💳 Checkout opens modal (not stuck/invisible)
- [ ] Service dropdown populates (from `salon_services` or fallback defaults)
- [ ] VAT calculation correct: AED 40 inclusive → base AED 38.10, VAT AED 1.90
- [ ] Issue Invoice → record appears in Supabase `invoices` table
- [ ] Print shows only invoice area (not full page)
- [ ] WhatsApp opens `wa.me/` with correct mobile and message

### Analytics
- [ ] Acquisition tab loads with PIN 8065
- [ ] Monthly Revenue table shows both Excel and DB rows
- [ ] Operations tab: Aug 31 appears in August (not September)
- [ ] Operations tab: Jul 31 appears in July (not August)

## Known Fragile Areas

| Area | Risk | Watch for |
|---|---|---|
| Date parsing | UTC vs local timezone | Aug/Jul 31 showing in wrong month |
| Queue concurrent load | Race on rapid tab switching | Queue stuck on "Loading..." |
| Supabase schema cache | New columns not visible | PGRST204 errors after ALTER TABLE |
| `display:none` on modals | CSS specificity | Modals not opening |
