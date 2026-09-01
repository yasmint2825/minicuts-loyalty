# Developer Onboarding — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** developer experience

Welcome to the MiNiCUTS Loyalty codebase. This guide gets you productive on day one.

## Day 1 Checklist

- [ ] Clone the repo: `git clone https://github.com/yasmint2825/minicuts-loyalty.git`
- [ ] Start local server: `python3 -m http.server 8080`
- [ ] Open staff queue: `http://localhost:8080/minicuts-staff.html`
- [ ] Open check-in kiosk: `http://localhost:8080/minicuts-checkin.html`
- [ ] Open analytics (PIN `8065`): `http://localhost:8080/index.html`
- [ ] Get Supabase dashboard access: `https://supabase.com/dashboard/project/wtapyfgtwkjyjrjdnhkb`
- [ ] Read [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)
- [ ] Read [DATA_MODEL.md](./DATA_MODEL.md)
- [ ] Read [KNOWN_RISKS_AND_TECHNICAL_DEBT.md](./KNOWN_RISKS_AND_TECHNICAL_DEBT.md)

## Things That Will Surprise You

1. **No framework, no build step.** Everything is plain HTML/JS. Edit and hard-refresh.
2. **No dev database.** You're pointing at production. Use test mobile numbers like `0559999001`.
3. **Duplicate code.** `sb()`, constants, and helpers are copy-pasted into every HTML file. This is intentional for now.
4. **Modals are hidden with `display:none` inline style.** Don't add a second one — that breaks them.
5. **Date parsing needs `T12:00:00`.** Never do `new Date('2026-08-31')` — always `new Date('2026-08-31T12:00:00')` to avoid UTC timezone shifts in Dubai.
6. **Supabase schema cache.** After any `ALTER TABLE`, go to Supabase Dashboard → Settings → API → Reload schema. Forgetting this causes `PGRST204` errors.

## Key Contacts

| Role | Access needed |
|---|---|
| GitHub write access | Repo owner: `yasmint2825` |
| Supabase project access | Project owner invite |
| WhatsApp Business account | ⚠️ Unknown — check with business owner |

## Next Steps After Day 1

Read:
- [CODEBASE_MAP.md](./CODEBASE_MAP.md) — function reference
- [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) — manual test checklist
- [TARGET_ARCHITECTURE_ALIGNMENT.md](./TARGET_ARCHITECTURE_ALIGNMENT.md) — where this is heading
