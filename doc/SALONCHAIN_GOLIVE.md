# SalonChain — getting real logins and admin access (go-live checklist)

**Nothing below has been done.** Every step that touches a Supabase project needs Munir's explicit approval. Do it first on a **sandbox** Supabase project, never on production or DEV first.

## Why you cannot "register" into the admin pages
The admin screens (Users & access, Group overview) exist only in chain mode and only for people who have (1) a login and (2) a row in `memberships`. Nobody can create the very first one from inside the app — that would let a stranger make themselves owner. So the **first owner is created once, by hand** in Supabase. After that, the owner adds everyone else inside the app.

## One-time setup (about 15 minutes)
1. **Sandbox project:** create a new Supabase project (or use an agreed copy). Load the current schema into it.
2. **Run `sql/002_salonchain_core.sql`** in the SQL editor. It creates the tables, security rules and the DSO outlet. It changes no existing salon table.
3. **Authentication → Providers → Email:** turn **OFF "Allow new users to sign up"**; set minimum password length 10; keep e-mail confirmation on.
4. **Authentication → Users → Add user:** e-mail `munir20684@gmail.com`, a strong password, tick **Auto confirm** (this is the application admin's login).
5. **Add the first three people** — run `sql/003_seed_users.sql` (it only adds rows to `memberships`; it creates no logins):
   - `munir20684@gmail.com` → **Application admin** (every permission, onboards client businesses)
   - `yasmin1388@gmail.com` → **Owner** of MiNiCUTS (everything for the business, not onboarding other clients)
   - `mincutsfze@gmail.com` → **Branch manager**, DSO only (the salon manager)
   Then create a login for each under Authentication → Users with the **same e-mail** (Auto confirm), or let the application admin invite the other two from the app after step 6.
6. **Deploy the logins service** (lets the app create logins for you): `supabase functions deploy mc-admin-users` (source: `supabase/functions/mc-admin-users/index.ts`). Without it, the app still saves the user and tells you to create the login in Supabase by hand.
7. Open the staff app with `?chain=1`, sign in as the owner → **Users & access**.

## Adding people afterwards (all inside the app)
Users & access → **Add user** → e-mail, name, role, outlets → choose:
- **E-mail an invite** — they get a link and set their own password; or
- **Temporary password** — for staff without e-mail; the app shows it **once**; they change it from the top bar; or
- **I'll create it in Supabase myself.**
Switching someone off blocks the login too. "Forgot password?" is on the sign-in screen; the owner can also send a reset e-mail from a user's Edit window.

## What the logins service allows
Only an active member whose role has `users.manage` (the owner) can call it; it only acts on an e-mail already added under Users; it can create/invite and block/unblock logins and cannot block the caller's own login. It cannot read or change salon data.

## If you lock yourself out
Authentication → Users in the Supabase dashboard: reset the password or add a user; and the SQL line in step 5 restores an owner row. Keep two owners.
