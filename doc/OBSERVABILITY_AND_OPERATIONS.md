# Observability and Operations — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** codebase review

## Error Visibility

There is no centralised logging or monitoring. Errors surface via:

1. **Browser F12 → Console** — all `console.error()` calls appear here
2. **Toast notifications** — user-facing error messages via `toast(msg, 'err')`
3. **Inline table error rows** — failed loads show error text in the table body

## Checking for Issues

```javascript
// In browser console on any staff page:
// 1. Check if queue loaded
console.log('Queue rows:', _qdata.length);

// 2. Check invoice map
console.log('Invoices today:', Object.keys(_invMap).length);

// 3. Check settings loaded
console.log('Settings:', _coSettings);
console.log('Services:', _salonServices.length);
```

## Supabase Dashboard

- **Table editor:** view/edit rows directly → `https://supabase.com/dashboard/project/wtapyfgtwkjyjrjdnhkb/editor`
- **SQL editor:** run queries → `https://supabase.com/dashboard/project/wtapyfgtwkjyjrjdnhkb/sql`
- **API logs:** recent REST requests → Dashboard → Logs → API

## Common Support Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Queue stuck on "Loading queue..." | `loadAllConfig()` hanging or Supabase down | Check Supabase status.supabase.com; refresh |
| Checkout modal not opening | JavaScript error before `display:flex` | F12 → Console for error; check `_qdata` |
| "All object keys must match" error | Column not in Supabase schema | Reload schema in Supabase Dashboard → Settings → API |
| Aug/Jul 31 in wrong month | UTC timezone shift | Verify `fmtLocal()` used, not `toISOString()` |
| Services dropdown empty | `salon_services` table empty | Add services in index.html → Salon Setup |
