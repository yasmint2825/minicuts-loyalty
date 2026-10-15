// supabase/functions/mc-admin-users/index.ts
//
// Lets an OWNER (anyone whose role carries the `users.manage` permission) create logins for new staff from the
// staff app's "Users & access" screen, so nobody has to open the Supabase dashboard for every new person.
// The browser never holds the admin key; this function does, and it checks who is asking.
//
// Guard rails:
//   - the caller must send a valid Supabase Auth session (verify_jwt stays ON) AND be an ACTIVE member whose role
//     has `users.manage` (or '*'). Anyone else gets 403.
//   - it can only act on an e-mail that already has a row in `memberships` (add the person in the app first), so it
//     cannot be used to mint arbitrary accounts.
//   - it never changes or deletes data other than Auth logins; it cannot ban the caller's own login.
//
// Actions (POST JSON):  { action: "invite", email }              e-mail the person a link to set their own password
//                       { action: "create", email, password }    create the login with a temporary password (min 10 chars)
//                       { action: "set_banned", email, banned }  block / unblock a login (used when a user is switched off)
//
// Deploy (ask first - this is a production change):  supabase functions deploy mc-admin-users
// Needs the standard secrets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (present by default in Supabase functions).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const validEmail = (e: unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "")) && String(e).length <= 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // 1. who is calling?
  const token = (req.headers.get("authorization") || "").replace(/^Bearer /i, "");
  const { data: u, error: ue } = await admin.auth.getUser(token);
  const callerEmail = String(u?.user?.email || "").toLowerCase();
  if (ue || !callerEmail) return json({ error: "Sign in first" }, 401);

  // 2. are they an active owner-type member?
  const { data: me } = await admin.from("memberships").select("email,role_key,active").eq("email", callerEmail).maybeSingle();
  if (!me || !me.active) return json({ error: "No active access" }, 403);
  const { data: role } = await admin.from("rbac_roles").select("permissions").eq("key", me.role_key).maybeSingle();
  const perms: string[] = role?.permissions || [];
  if (!(perms.includes("*") || perms.includes("users.manage"))) return json({ error: "Only an owner can manage users" }, 403);

  // 3. what do they want?
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  if (!validEmail(email)) return json({ error: "Enter a valid e-mail" }, 400);
  const { data: target } = await admin.from("memberships").select("email").eq("email", email).maybeSingle();
  if (!target) return json({ error: "Add this person under Users first" }, 400);

  if (b.action === "invite") {
    const redirectTo = typeof b.redirect_to === "string" && b.redirect_to.startsWith("https://") ? b.redirect_to : undefined;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  if (b.action === "create") {
    const password = String(b.password || "");
    if (password.length < 10) return json({ error: "Use at least 10 characters" }, 400);
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  if (b.action === "set_banned") {
    if (email === callerEmail) return json({ error: "You cannot block your own login" }, 400);
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((x) => String(x.email || "").toLowerCase() === email);
    if (!found) return json({ ok: true, note: "No login exists yet" });
    const { error } = await admin.auth.admin.updateUserById(found.id, { ban_duration: b.banned ? "876000h" : "none" });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" }, 400);
});
