# Migration Plan — MiNiCUTS → Zen Platform

> **Last verified:** 2026-09-01 · **Source:** [adr/ADR-0005-INCREMENTAL-MIGRATION.md](./adr/ADR-0005-INCREMENTAL-MIGRATION.md)

## Strategy

Incremental migration — MiNiCUTS remains live throughout. No big-bang rewrite.

```mermaid
gantt
  title MiNiCUTS → Zen Platform Migration
  dateFormat YYYY-MM
  section Phase 1 — Zen Platform Foundation
    Auth Service (Supabase Auth)       :2026-09, 1M
    Tenant onboarding API              :2026-09, 1M
    MiNiCUTS registered as tenant      :2026-10, 1M
  section Phase 2 — AI Agents
    WhatsApp reply agent live          :2026-10, 1M
    Campaign agent (nudge/lapsed)      :2026-11, 1M
    Voice/call agent                   :2027-01, 2M
  section Phase 3 — Analytics Migration
    ML pipeline → Zen analytics svc    :2026-12, 1M
    Dashboard reads from Zen API       :2027-01, 1M
  section Phase 4 — Security Hardening
    Enable RLS on all tables           :2027-02, 1M
    Remove hardcoded keys from HTML    :2027-02, 1M
    Staff auth via Supabase Auth       :2027-03, 1M
```

## Phase Details

### Phase 1 — Foundation
- Register MiNiCUTS as tenant in Zen Platform
- Replace anon key in HTML with Zen Platform API calls
- Supabase Auth for staff login (email/PIN → proper accounts)

### Phase 2 — AI Agents
- WhatsApp Business API replaces wa.me links
- Campaign agent handles lapsed customer nudges
- Voice agent answers phone calls

### Phase 3 — Analytics
- `historical_transactions` + `queue` data piped into Zen analytics service
- `index.html` analytics tab reads from Zen API endpoints

### Phase 4 — Security
- RLS enabled on all Supabase tables with tenant-scoped policies
- Hardcoded credentials removed from all HTML files
