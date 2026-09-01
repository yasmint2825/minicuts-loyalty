# Authentication and Security — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** `index.html` (MGMT_PASS), Supabase dashboard RLS check

## Current Auth Model

| Surface | Mechanism | Strength |
|---|---|---|
| Analytics Dashboard (`index.html`) | Hardcoded PIN `8065` in JS constant `MGMT_PASS` | ⚠️ Weak — visible in source |
| Staff Queue (`minicuts-staff.html`) | No auth — URL access only | ⚠️ No protection |
| Check-In Kiosk (`minicuts-checkin.html`) | No auth — designed to be public | ✅ Intentional |
| Staff HR (`minicuts-staff-mgmt.html`) | No auth — URL access only | ⚠️ No protection |
| Supabase API | Anon key hardcoded in every HTML file | ⚠️ Key is public |

## Row Level Security (RLS)

**RLS is disabled on all tables.** The anon key can read and write any row in any table.

```sql
-- Current state (confirmed)
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE 'staff%' OR tablename IN ('customers','queue','invoices');
-- All return rowsecurity = false
```

## Planned Security Improvements (Zen Platform migration)

1. Replace PIN gate with Supabase Auth (email + password or magic link)
2. Enable RLS with tenant-scoped policies
3. Move anon key to server-side Zen Platform API — browsers never see it
4. Separate staff roles (viewer vs manager vs admin)

See [TARGET_ARCHITECTURE_ALIGNMENT.md](./TARGET_ARCHITECTURE_ALIGNMENT.md) and [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).

## What NOT to commit

- Supabase anon key (currently hardcoded — acceptable for single-tenant kiosk, must change for SaaS)
- Staff mobile numbers or customer PII in code
- Any API keys for WhatsApp Business, Instagram, or Anthropic
