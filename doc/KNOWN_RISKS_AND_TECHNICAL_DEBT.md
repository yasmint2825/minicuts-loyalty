# Known Risks and Technical Debt — MiNiCUTS Loyalty

> **Last verified:** 2026-10-25 (security rows) · **Source:** code review + live database rules

## Security Risks

| Risk | Severity | Detail |
|---|---|---|
| Anon key in browser source | High | Supabase anon key hardcoded in all HTML files. Anyone with it can still read customers, queue, visits and invoices, and add or change most rows. Since 25 Oct 2026 it can no longer delete core records or read the WhatsApp log (lockdown step 1). Full fix: staff sign-in, then lockdown steps 2–3. |
| Open RLS rules on most salon tables | High | RLS is on everywhere, but most salon tables allow the public key. See [AUTHENTICATION_AND_SECURITY.md](./AUTHENTICATION_AND_SECURITY.md#row-level-security-rls). |
| PIN auth for management | Medium | `MGMT_PASS = '8065'` is visible in page source |
| No staff auth on the plain link | Medium | Staff queue URL is public. Signed-in mode (`?chain=1`, Supabase Auth + `memberships`) exists but is optional. |

## Technical Debt Register

| Item | Impact | Effort | Notes |
|---|---|---|---|
| No automated tests | High | Medium | All testing is manual. Fragile for new developers. |
| Duplicate Supabase credentials in every HTML file | Medium | Low | Single change → must update 5 files |
| No dev/staging environment | Medium | Medium | Test against production database |
| localStorage removed but `staff_config` still has `alert_dismissed_expiry` | Low | Low | `ALTER TABLE staff_documents ADD COLUMN IF NOT EXISTS alert_dismissed_expiry text` pending |
| WhatsApp via wa.me (manual) | Medium | High | Needs WhatsApp Business API for automation |
| `checkout.html` is now legacy | Low | Low | Features merged into `minicuts-staff.html`; file should be removed |

## Pending SQL Migrations

```sql
-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS invoices ( ... ); -- see DEPLOYMENT_RUNBOOK.md
ALTER TABLE staff_documents ADD COLUMN IF NOT EXISTS alert_dismissed_expiry text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tc_accepted boolean DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tc_accepted_at timestamptz;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE queue ADD COLUMN IF NOT EXISTS called_at timestamptz;
```
