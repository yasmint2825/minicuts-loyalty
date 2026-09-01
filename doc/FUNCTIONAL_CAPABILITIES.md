# Functional Capabilities — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** `minicuts-checkin.html`, `minicuts-staff.html`, `index.html`, `minicuts-staff-mgmt.html`

## Module Inventory

### 1. Customer Check-In Kiosk (`minicuts-checkin.html`)
- New customer registration (name, mobile, gender, location, source)
- Returning customer lookup by mobile → token issuance
- Guest/walk-in flow (no mobile required)
- Sibling registration (multiple children under one family)
- Terms & Conditions consent capture (`tc_accepted`, `tc_accepted_at`)
- Location selection (DSO, Liwan, Dubailand, Arjan, Bur Dubai, Oud Metha)
- Stamps overlay — in-page loyalty passport preview
- Token number display

### 2. Queue Management (`minicuts-staff.html` → Queue tab)
- Live queue with auto-refresh every 120 seconds
- Status flow: `waiting → called → done`
- 📢 Call button — records `called_at` timestamp
- ✅ Stamp button — adds visit stamp, updates customer loyalty
- Done-today section with 💳 Checkout button visible
- Filter by stylist, status, name search
- Cancel token (marks `cancelled`)
- History tab — browse any date's queue

### 3. Checkout & Invoicing (`minicuts-staff.html` → Checkout modal)
- Service dropdown populated from `salon_services` table
- Stylist selection from configured team
- Live VAT calculation (inclusive or exclusive, configurable)
- Base + VAT + tip split display
- Invoice auto-number generation (`MC` prefix + timestamp)
- Print invoice — `window.print()` isolates invoice area
- WhatsApp send — `wa.me/[mobile]?text=[template]`
- Void invoice — reason dropdown + audit trail

### 4. Loyalty Passport (`index.html?customer=1`)
- Mobile lookup → stamp circle display
- Progress bar from 0 to target (configurable stamps needed)
- Free wash detection and CTA
- Visit history (expandable)
- Game Zone points tracker with milestone rewards
- Auto-lookup when `?lookup=[mobile]` URL param present

### 5. Analytics Dashboard (`index.html` — PIN: `8065`)
- **Acquisition tab**: new vs returning vs guest KPIs, source breakdown, monthly revenue (Excel + DB merged)
- **Operations tab**: daily stacked bar chart, weekly summary by source, stylist performance table
- **Analytics tab**: customer segmentation, gender/location breakdown, stamp distribution
- **KoD tab**: day-level drill-down of every customer served

### 6. Staff Management (`minicuts-staff-mgmt.html`)
- Team profiles (name, role, mobile, join date, off days)
- Attendance log (check-in/out times, status)
- Leave management (types, approval status, days)
- Overtime log
- Document tracking (passport, visa, Emirates ID — expiry alerts)
- Monthly roster planner
- All data stored in Supabase only — no localStorage

### 7. Settings (`minicuts-staff.html` → ⚙️ Settings)
- Invoice & business info (name, TRN, VAT rate, prefix)
- Services & pricing (read from `salon_services` table)
- Team/stylists configuration
- WhatsApp message template with token system
- Gift voucher types and packages
