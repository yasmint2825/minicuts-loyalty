# MiNiCUTS Loyalty — Documentation Index

> **Last verified:** 2026-09-01 · **Source:** codebase review + Supabase schema inspection

This `doc/` directory is the single source of truth for developers working on the MiNiCUTS Loyalty & Salon Management System. Use the table below to navigate.

| Document | Purpose |
|---|---|
| [SYSTEM_CONTEXT.md](./SYSTEM_CONTEXT.md) | What the system does and why it exists |
| [FUNCTIONAL_CAPABILITIES.md](./FUNCTIONAL_CAPABILITIES.md) | Feature inventory per module |
| [CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md) | Architecture, file map, deployment topology |
| [CODEBASE_MAP.md](./CODEBASE_MAP.md) | File-by-file reference with key functions |
| [DATA_MODEL.md](./DATA_MODEL.md) | Supabase schema, table relationships, data boundaries |
| [API_AND_INTEGRATIONS.md](./API_AND_INTEGRATIONS.md) | Supabase REST, WhatsApp, Instagram integrations |
| [AUTHENTICATION_AND_SECURITY.md](./AUTHENTICATION_AND_SECURITY.md) | Auth model, RLS, PIN gates |
| [JOBS_AND_SCHEDULES.md](./JOBS_AND_SCHEDULES.md) | Auto-refresh intervals, cron jobs |
| [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) | How to run and develop locally |
| [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) | GitHub Pages deploy, Supabase migrations |
| [TESTING_STRATEGY.md](./TESTING_STRATEGY.md) | Manual test checklist, known fragile areas |
| [OBSERVABILITY_AND_OPERATIONS.md](./OBSERVABILITY_AND_OPERATIONS.md) | Monitoring, error visibility, support runbook |
| [KNOWN_RISKS_AND_TECHNICAL_DEBT.md](./KNOWN_RISKS_AND_TECHNICAL_DEBT.md) | Debt register, security risks, pending SQL |
| [TARGET_ARCHITECTURE_ALIGNMENT.md](./TARGET_ARCHITECTURE_ALIGNMENT.md) | How this system fits into Zen Platform SaaS |
| [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) | Incremental migration to Zen Platform |
| [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) | First-day guide for a new developer |
| [adr/README.md](./adr/README.md) | Architecture Decision Records index |

## Quick Facts

| Item | Value |
|---|---|
| Repository | `yasmint2825/minicuts-loyalty` |
| Live URL | `https://yasmint2825.github.io/minicuts-loyalty/` |
| Backend | Supabase project `wtapyfgtwkjyjrjdnhkb` (ap-southeast-1) |
| Stack | Vanilla HTML5 + CSS + JavaScript — no build step |
| Role in Zen Platform | Tenant #1 / live pilot |
| Staff PIN | `8065` (see [AUTHENTICATION_AND_SECURITY.md](./AUTHENTICATION_AND_SECURITY.md)) |
