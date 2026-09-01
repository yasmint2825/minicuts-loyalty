# Known Risks and Technical Debt — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** code review + Supabase inspection

## Security Risks

| Risk | Severity | Detail |
|---|---|---|
| Anon key in browser source | High | Supabase anon key hardcoded in all HTML files. Anyone with the URL can read/write the database. Acceptable for single-tenant private kiosk; unacceptable for SaaS. |
| RLS disabled on all tables | High | No row-level access control. See [AUTHENTICATION_AND_SECURITY.md](./AUTHENTICATION_AND_SECURITY.md) |
| PIN auth for management | Medium | `MGMT_PASS = '8065'` is visible in page source |
| No staff auth | Medium | Staff queue URL is public — anyone with the link can access |

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
