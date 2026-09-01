# Target Architecture Alignment — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** [Zen Platform docs](../../zen-platform/doc/README.md)

## MiNiCUTS as Tenant #1

MiNiCUTS is the **live pilot tenant** for Zen Platform — a multi-tenant AI engagement SaaS. The migration is incremental: MiNiCUTS continues to run as a standalone system while Zen Platform services are layered on top.

## Target State

```mermaid
graph TB
  subgraph Zen Platform SaaS
    auth[Auth Service<br/>Supabase Auth + RBAC]
    tenant[Tenant API<br/>Onboarding + Config]
    wa[WhatsApp Agent<br/>Reply + Campaigns]
    voice[Voice Agent<br/>Call Handling]
    analytics[Analytics Service<br/>ML Pipeline]
    console[Admin Console<br/>Zen-Platform-Console]
  end

  subgraph MiNiCUTS Tenant
    kiosk[Check-In Kiosk]
    queue[Queue + Checkout]
    loyalty[Loyalty Passport]
    hr[Staff HR]
  end

  kiosk & queue & loyalty & hr -- tenant API calls --> tenant
  tenant -- data + events --> wa & analytics
  console -- manage --> tenant
```

## What Stays in This Repo

The MiNiCUTS-specific HTML files (kiosk, queue, passport) remain here. They will progressively delegate to Zen Platform APIs rather than calling Supabase directly.

## Migration Phases

See [MIGRATION_PLAN.md](./MIGRATION_PLAN.md) for the phased plan.
