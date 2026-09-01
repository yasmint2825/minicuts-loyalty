# Codebase Map — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** direct file inspection

## Shared Patterns (all files)

Every HTML file implements an identical local `sb()` helper:

```javascript
// Path: every *.html file — sb() function
async function sb(table, method='GET', body=null, params='') {
  const url = SB_URL + '/rest/v1/' + table + (params ? '?' + params : '');
  const h = { 'Content-Type': 'application/json', 'apikey': SB_KEY,
               'Authorization': 'Bearer ' + SB_KEY, 'Prefer': 'return=representation' };
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 200));
  return t ? JSON.parse(t) : [];
}
```

## `minicuts-staff.html` — Key Functions

| Function | Line range | Purpose |
|---|---|---|
| `loadQ()` | ~694 | Loads today's queue + invoices + customers in parallel |
| `renderQ()` | ~1033 | Renders queue table — active rows then done rows |
| `buildRow(r)` | ~1058 | Builds a single queue table row with action buttons |
| `markDone(qid,cid,name,mob)` | ~1210 | Stamps visit, updates loyalty, fires WA message |
| `updS(id, status)` | ~1194 | PATCH queue row status |
| `loadHist()` | ~1209 | Loads history for selected date (gen counter prevents races) |
| `coOpen(queueId)` | ~2731 | Opens checkout modal with service/stylist dropdowns |
| `coSave()` | ~2800 | Issues invoice to Supabase, updates queue, shows invoice |
| `buildInvHTML(inv, s)` | ~2845 | Returns printable invoice HTML |
| `invSendWA()` | ~2870 | Opens wa.me with pre-filled invoice message |
| `loadAllConfig()` | ~578 | Fetches `staff_config` — sets STYLISTS, LCFG, WA_TEMPLATE |
| `coLoadSettings()` | ~2660 | Fetches `co_settings` + `salon_services` |
| `toggleSection(id)` | ~2621 | Expand/collapse settings section card |

## `minicuts-checkin.html` — Key Functions

| Function | Purpose |
|---|---|
| `doLookup()` | Mobile lookup — routes to returning/new flow |
| `doRegister()` | Creates customer record + queue token |
| `doGuest()` | Creates guest queue entry |
| `reserveTokenBlock(kids)` | Multi-child token reservation |
| `goPassport()` | Opens loyalty passport with mobile pre-filled |

## `index.html` — Key Functions

| Function | Purpose |
|---|---|
| `renderAcq(queueRows, hist)` | Acquisition tab KPIs + source bars |
| `acqRenderHistInsights(hist, dbRows)` | Monthly revenue table (Excel + DB merged) |
| `opsSetMonth()` | Operations date range + fetch |
| `renderCP(prefMobile)` | Customer loyalty passport render |
| `custLookup()` | Passport mobile lookup |
| `ssInit()` | Salon setup page initialise — loads `salon_services` |

## Constants (all files)

```javascript
const SB_URL = 'https://wtapyfgtwkjyjrjdnhkb.supabase.co'; // all files
const SB_KEY = 'eyJhbGci...';                               // anon key — all files
const MGMT_PASS = '8065';                                    // index.html
const DB_CUTOFF = '2026-06-09';                              // index.html — Excel/DB boundary
```
