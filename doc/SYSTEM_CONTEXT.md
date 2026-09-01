# System Context — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** product walkthrough + `index.html`, `minicuts-staff.html`

## Why This System Exists

MiNiCUTS FZCO is a children's hair salon in Dubai Silicon Oasis. Before this system, operations ran on paper: queue tokens were handwritten, loyalty stamps were physical cards, and revenue was tracked in Excel spreadsheets.

This system replaces all paper-based operations with a digital platform covering every customer and staff touchpoint.

## Context Diagram

```mermaid
C4Context
  title MiNiCUTS System Context

  Person(customer, "Customer (Parent)", "Checks in child, tracks loyalty stamps")
  Person(staff, "Salon Staff", "Manages queue, stamps visits, issues invoices")
  Person(mgmt, "Management", "Views analytics, configures system")

  System(minicuts, "MiNiCUTS Platform", "Loyalty, Queue, Checkout, Analytics, Staff HR")

  System_Ext(supabase, "Supabase (PostgreSQL)", "Database + REST API")
  System_Ext(github, "GitHub Pages", "Static hosting")
  System_Ext(whatsapp, "WhatsApp (wa.me)", "Customer notifications")
  System_Ext(instagram, "Instagram Graph API", "Social content publishing")

  Rel(customer, minicuts, "Self check-in, views passport")
  Rel(staff, minicuts, "Queue management, checkout")
  Rel(mgmt, minicuts, "Analytics dashboard (PIN gated)")
  Rel(minicuts, supabase, "All data reads/writes via REST")
  Rel(minicuts, github, "Deployed as static HTML")
  Rel(minicuts, whatsapp, "Sends stamp confirmation + invoice links")
  Rel(minicuts, instagram, "Publishes branded content (Zen Platform agent)")
```

## Scope

In scope:
- Customer check-in kiosk (new / returning / guest flows)
- Digital loyalty stamp card and passport portal
- Staff queue management (call, stamp, checkout)
- VAT invoicing with print and WhatsApp send
- Analytics dashboard (acquisition, operations, revenue)
- Staff HR (attendance, leaves, overtime, documents, roster)
- Gift vouchers and KoD (Kids of Determination) programme

Out of scope (handled by Zen Platform layer):
- AI-driven WhatsApp reply agent
- Outbound campaign automation
- Voice/call handling
- Multi-tenant management console
