# Local Development — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** developer walkthrough

## Prerequisites

```bash
# Required
- A modern browser (Chrome / Safari / Firefox)
- Git
- A local HTTP server (any of the below work)

# Option A: Python (built-in)
python3 -m http.server 8080

# Option B: Node http-server
npx http-server -p 8080

# Option C: VS Code Live Server extension
# Right-click any .html → Open with Live Server
```

> ⚠️ **Do NOT open HTML files via `file://`** — Supabase fetch calls fail due to CORS.

## Setup

```bash
git clone https://github.com/yasmint2825/minicuts-loyalty.git
cd minicuts-loyalty

# Start local server
python3 -m http.server 8080

# Open in browser
open http://localhost:8080/minicuts-staff.html        # Staff queue
open http://localhost:8080/minicuts-checkin.html       # Check-in kiosk
open http://localhost:8080/index.html                  # Loyalty dashboard (PIN: 8065)
open http://localhost:8080/minicuts-staff-mgmt.html    # Staff management
```

## Supabase Access

The dev environment uses the **production Supabase project** (there is no separate dev database). Be careful with test data — use identifiable mobile numbers (e.g. `0559999001`) and delete test records after.

```sql
-- Clean up test customers
DELETE FROM queue WHERE customer_id IN (
  SELECT id FROM customers WHERE mobile LIKE '05599990%'
);
DELETE FROM customers WHERE mobile LIKE '05599990%';
```

## Making Changes

1. Edit the relevant HTML file directly
2. Hard-refresh browser (`Cmd+Shift+R` / `Ctrl+Shift+R`) to see changes
3. Check browser F12 → Console for errors before committing
4. Test on mobile (iOS Safari is the primary staff device)

## Environment Variables

None — all config is hardcoded. See [AUTHENTICATION_AND_SECURITY.md](./AUTHENTICATION_AND_SECURITY.md) for why and what to change.
