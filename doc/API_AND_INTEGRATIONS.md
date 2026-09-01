# API and Integrations — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** `minicuts-staff.html`, `minicuts-checkin.html`, `index.html`

## Supabase REST (PostgREST)

All database operations are direct HTTP calls to Supabase PostgREST. No ORM, no server intermediary.

**Base URL:** `https://wtapyfgtwkjyjrjdnhkb.supabase.co/rest/v1/`

**Auth header:** `apikey: <anon_key>` + `Authorization: Bearer <anon_key>`

### Common Query Patterns

```
# Fetch today's queue
GET /rest/v1/queue?checkin_date=eq.2026-09-01&order=token_number.asc&limit=200

# Upsert (insert or update by PK)
POST /rest/v1/invoices?on_conflict=id
Header: Prefer: resolution=merge-duplicates,return=representation

# Partial update
PATCH /rest/v1/queue?id=eq.<uuid>

# Delete
DELETE /rest/v1/staff_leaves?id=eq.<uuid>

# Filter by list (IN)
GET /rest/v1/customers?mobile=in.(0551234567,971551234567)
```

### Schema Cache
After any `ALTER TABLE`, reload PostgREST schema:
**Supabase Dashboard → Settings → API → Reload schema**
Failure causes `PGRST204` errors on new columns.

## WhatsApp Integration

No official API. The system constructs `wa.me` URLs:

```
https://wa.me/<phone>?text=<url-encoded-message>
```

This opens WhatsApp with a pre-filled message. Staff tap Send manually. See [KNOWN_RISKS_AND_TECHNICAL_DEBT.md](./KNOWN_RISKS_AND_TECHNICAL_DEBT.md) for migration plan to WhatsApp Business API.

## Instagram (via Zen Platform)

The social content agent (`generate_social_content.py` in Zen-Platform-Console) posts branded content to `@minicutsdso` via Instagram Graph API. This is NOT part of this repository — see [Zen Platform docs](../../zen-platform/doc/README.md).

## Google Fonts

Loaded from CDN in every HTML `<head>`:
```html
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;700;900&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
```
