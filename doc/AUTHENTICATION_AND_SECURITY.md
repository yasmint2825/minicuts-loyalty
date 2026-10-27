# Authentication and Security — MiNiCUTS Loyalty

> **Last verified:** 2026-10-25 · **Source:** `index.html` (MGMT_PASS), live database rules (`pg_policies`, table grants)

## Current Auth Model

| Surface | Mechanism | Strength |
|---|---|---|
| Analytics Dashboard (`index.html`) | Hardcoded PIN `8065` in JS constant `MGMT_PASS` | ⚠️ Weak — visible in source |
| Staff Queue (`minicuts-staff.html`) | Plain link: no auth, public key. With `?chain=1`: Supabase Auth login + `memberships` role | ⚠️ Plain link unprotected; signed-in mode available |
| Check-In Kiosk (`minicuts-checkin.html`) | No auth — designed to be public | ✅ Intentional |
| Staff HR (`minicuts-staff-mgmt.html`) | No auth — URL access only | ⚠️ No protection |
| Supabase API | Anon key hardcoded in every HTML file | ⚠️ Key is public |

## Row Level Security (RLS)

RLS is **on** for every table, but most salon tables still have open rules, so the public key in the pages can still read, add and change most data. Real protection needs staff to sign in.

**Step 1 of the lockdown is live (applied 25 Oct 2026).** Source: Zen repo `supabase/migrations/24_salon_public_key_step1.sql`; undo: `24_salon_public_key_step1_rollback.sql`. It restricts only the public key; signed-in users (Zen, staff app with `?chain=1`) keep exactly the access they had.

| Public key can now… | Tables |
|---|---|
| Nothing | `whatsapp_messages`, `referrals`, `sm_*` (7 unused tables) |
| Read, add, change — **no delete** | `appointments`, `gift_vouchers`, `invoices`, `prizes_given`, `queue`, `salon_vat`, `staff_config` |
| Read, add, change, delete (pages delete here) | `salon_services`, `salon_coupons`, `historical_transactions`, `kod_members`, `staff`, `staff_*` |
| Unchanged (already no delete) | `customers`, `cycles`, `game_sessions`, `visits` |

Steps 2 and 3 (signed-in salon staff only, then server only) are written but **not applied**; they need every device to sign in first.

```sql
-- Check the current rules
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public' order by tablename;
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
