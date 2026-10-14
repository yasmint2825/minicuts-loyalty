// supabase/functions/mc-send-invoice/index.ts
//
// Lets the MiniCuts staff app send an invoice on WhatsApp THROUGH ZEN, without any API key in the browser.
// The app sends only an invoice id; everything else (phone number, amount, date, PDF link, template name)
// is read here from the database and handed to Zen's existing `send-whatsapp` function with full trust
// (service-role call), so Zen's WhatsApp credentials, template mapping and message log are used as-is.
//
// Guard rails (the staff app's anon key is public, so this function must not be a free WhatsApp sender):
//   - it can ONLY send the one configured invoice template, to the phone number stored on an existing invoice
//   - the PDF link must point at this project's public `invoices` storage bucket
//   - void invoices are refused
//   - at most 2 sends per phone number / template / 10 minutes, and 5 test messages per hour in total
//
// Deploy (ask first - this is a production change):  supabase functions deploy mc-send-invoice
// verify_jwt stays ON: the staff app calls it with its normal anon key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const TENANT = "minicuts";
const DEFAULT_TEMPLATE = "booking_completed_invoice";
const LEGACY_TEMPLATES = ["mc_invoice_utility"]; // old placeholder that never existed in WhatsApp - treated as "not set"
const GRAPH_VERSION = "v25.0";
const validTplName = (n: unknown) => /^[a-z0-9_]{1,200}$/.test(String(n || ""));
const validLang = (n: unknown) => /^[a-z]{2}(_[A-Z]{2})?$/.test(String(n || ""));

// AES-GCM decrypt of the stored Meta token (same scheme as Zen's whatsapp-config / send-whatsapp). Read-only use.
async function decryptSecret(stored: string): Promise<string> {
  const keyB64 = Deno.env.get("CREDENTIAL_ENCRYPTION_KEY")!;
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)), "AES-GCM", false, ["decrypt"]);
  const combined = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(plain);
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// same rule as send-whatsapp (UAE numbers)
function toE164(mobile: string): string {
  let n = String(mobile || "").replace(/\D/g, "");
  if (n.startsWith("00971")) n = n.slice(5);
  else if (n.startsWith("971")) n = n.slice(3);
  else if (n.startsWith("0")) n = n.slice(1);
  return "971" + n;
}
const validUae = (m: string) => /^971\d{9}$/.test(toE164(m));
// Template booking_completed_invoice:
//   Hi {{1}}, Your appointment at {{2}} on {{3}} is Completed. ... Here is your invoice: {{4}} ... The Team at {{5}}
const brandOf = (name: unknown) => String(name || "MiNiCUTS").replace(/\s*\(.*\)\s*$/, "").replace(/\s+(FZCO|FZE|FZ-LLC|LLC|L\.L\.C\.?)$/i, "").trim() || "MiNiCUTS";
const fmtDate = (s: string) => {
  const d = new Date(String(s).slice(0, 10) + "T12:00:00Z");
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json();
    const { invoice_id, test_mobile, ping, list_templates, template: tplOverride, template_lang: langOverride } =
      body as { invoice_id?: string; test_mobile?: string; ping?: boolean; list_templates?: boolean; template?: string; template_lang?: string };

    // connectivity check from the settings screen: confirms this function is deployed, sends nothing
    if (ping) return json({ ok: true, via: "zen", template: DEFAULT_TEMPLATE, v: 4 });

    // Lists the templates that Meta has APPROVED for this WhatsApp account, so the settings screen can offer a pick-list
    // instead of a free-text box. Read-only; returns names/languages/body text only - never the token.
    if (list_templates) {
      const { data: creds } = await supabase.from("mw_tenant_credentials").select("access_token, waba_id").eq("tenant_id", TENANT).eq("channel", "whatsapp").maybeSingle();
      if (!creds?.access_token || !creds?.waba_id) return json({ ok: false, error: "WhatsApp is not fully connected in Zen yet (no WhatsApp Business Account id on file)." }, 400);
      const tok = await decryptSecret(creds.access_token);
      const out: Array<Record<string, unknown>> = [];
      let url: string | null = `https://graph.facebook.com/${GRAPH_VERSION}/${creds.waba_id}/message_templates?fields=name,language,status,category,components&limit=100`;
      for (let i = 0; url && i < 5; i++) {
        const mr = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        const mj = await mr.json();
        if (!mr.ok) return json({ ok: false, error: mj?.error?.message || "Could not read templates from WhatsApp" }, 400);
        for (const t of (mj.data || [])) {
          const bodyC = (t.components || []).find((c: { type: string }) => c.type === "BODY");
          const text = String(bodyC?.text || "");
          const vars = new Set((text.match(/\{\{\d+\}\}/g) || [])).size;
          const hdr = (t.components || []).find((c: { type: string }) => c.type === "HEADER");
          out.push({ name: t.name, language: t.language, status: t.status, category: t.category, body: text, vars, has_header: !!hdr });
        }
        url = mj?.paging?.next || null;
      }
      return json({ ok: true, templates: out });
    }

    const { data: cfg } = await supabase.from("staff_config").select("value").eq("key", "co_settings").maybeSingle();
    let settings: Record<string, unknown> = {};
    try { settings = typeof cfg?.value === "string" ? JSON.parse(cfg.value) : (cfg?.value || {}); } catch { /* keep defaults */ }
    let template = String(settings.waTemplateName || DEFAULT_TEMPLATE);
    if (LEGACY_TEMPLATES.includes(template) || !validTplName(template)) template = DEFAULT_TEMPLATE;
    let lang = validLang(settings.waTemplateLang) ? String(settings.waTemplateLang) : "en";

    let mobile = "", params: string[] = [], customer_id: string | undefined, customer_name: string | undefined, sent_by = "staff-invoice";

    if (invoice_id) {
      const { data: inv, error } = await supabase.from("invoices")
        .select("id, invoice_number, customer_id, customer_name, mobile, checkin_date, pdf_url, status, seller")
        .eq("id", invoice_id).maybeSingle();
      if (error || !inv) return json({ ok: false, error: "Invoice not found" }, 404);
      if (inv.status === "void") return json({ ok: false, error: "This invoice is void" }, 400);
      if (!inv.pdf_url) return json({ ok: false, error: "No PDF link yet — create the PDF first" }, 400);
      const allowed = `${SUPABASE_URL}/storage/v1/object/public/invoices/`;
      if (!String(inv.pdf_url).startsWith(allowed)) return json({ ok: false, error: "PDF link is not from the invoices bucket" }, 400);
      if (!inv.mobile || !validUae(inv.mobile)) return json({ ok: false, error: "No valid UAE mobile number on this invoice" }, 400);
      mobile = inv.mobile; customer_id = inv.customer_id || undefined; customer_name = inv.customer_name || undefined;
      const brand = brandOf((inv.seller as { bname?: string } | null)?.bname || settings.bname);
      params = [String(inv.customer_name || "there").split(" ")[0], brand, fmtDate(inv.checkin_date), inv.pdf_url, brand];
    } else if (test_mobile) {
      if (!validUae(test_mobile)) return json({ ok: false, error: "Enter a valid UAE mobile number" }, 400);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
        .eq("tenant_id", TENANT).eq("sent_by", "staff-invoice-test").gte("created_at", since);
      if ((count || 0) >= 5) return json({ ok: false, error: "Test limit reached (5 per hour). Try again later." }, 429);
      mobile = test_mobile; sent_by = "staff-invoice-test";
      if (validTplName(tplOverride)) {
        // lets the settings screen test the template shown on screen before it is saved - but never one of the marketing
        // templates Zen sends to customers (the anon key is public, so this must not become a way to message arbitrary numbers with them)
        const { data: mapped } = await supabase.from("mw_template_map").select("type_key").eq("tenant_id", TENANT).eq("template_name", String(tplOverride)).limit(1);
        if (mapped && mapped.length) return json({ ok: false, error: "That template is used for Zen campaigns and cannot be used as the invoice test" }, 400);
        template = String(tplOverride);
      }
      if (validLang(langOverride)) lang = String(langOverride);
      const brand = brandOf(settings.bname);
      params = ["Test", brand, fmtDate(new Date().toISOString()), `${SUPABASE_URL}/storage/v1/object/public/invoices/sample.pdf`, brand];
    } else {
      return json({ ok: false, error: "invoice_id is required" }, 400);
    }

    // flood guard: same phone + template at most twice in 10 minutes (a double tap is fine, a loop is not)
    const to = toE164(mobile);
    const tenMin = new Date(Date.now() - 600_000).toISOString();
    const { count: recent } = await supabase.from("whatsapp_messages").select("id", { count: "exact", head: true })
      .eq("tenant_id", TENANT).eq("mobile", to).eq("template_name", template).gte("created_at", tenMin);
    if ((recent || 0) >= 2) return json({ ok: false, error: "Already sent a moment ago — wait a few minutes before sending again" }, 429);

    // hand over to Zen: its credentials, its template handling, its message log
    const r = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
      body: JSON.stringify({ tenant_id: TENANT, mobile, template_name: template, template_lang: lang, params, customer_id, customer_name, sent_by }),
    });
    const out = await r.json().catch(() => ({ ok: false, error: `Zen returned ${r.status}` }));
    return json(out, out.ok ? 200 : (r.status >= 400 ? r.status : 400));
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
