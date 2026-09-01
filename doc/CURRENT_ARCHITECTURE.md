# Current Architecture — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** codebase review of all HTML files

## Overview

The system is a **static multi-page application** — each HTML file is a self-contained app with inline CSS and JavaScript. There is no build step, no bundler, and no server-side rendering.

## Deployment Topology

```mermaid
graph TB
  subgraph GitHub Pages
    idx[index.html<br/>Loyalty Dashboard]
    stf[minicuts-staff.html<br/>Queue & Checkout]
    chk[minicuts-checkin.html<br/>Check-In Kiosk]
    mgmt[minicuts-staff-mgmt.html<br/>HR / Staff Mgmt]
    co[checkout.html<br/>Standalone Checkout]
  end

  subgraph Supabase ap-southeast-1
    db[(PostgreSQL<br/>16 tables)]
    rest[PostgREST<br/>REST API]
    auth[Supabase Auth<br/>not yet used]
  end

  subgraph Client Browser
    idx & stf & chk & mgmt & co -- HTTP fetch --> rest
    rest -- JSON --> idx & stf & chk & mgmt & co
  end

  db --- rest
```

## File Map

| File | Lines | Purpose |
|---|---|---|
| `index.html` | ~6,900 | Loyalty dashboard + analytics + customer profiles + salon setup |
| `minicuts-staff.html` | ~2,900 | Queue + checkout + settings + invoicing |
| `minicuts-checkin.html` | ~1,700 | Customer kiosk |
| `minicuts-staff-mgmt.html` | ~1,630 | HR module |
| `checkout.html` | ~990 | Standalone reports (features now merged into staff page) |

## Data Flow

```mermaid
sequenceDiagram
  participant Browser
  participant PostgREST
  participant PostgreSQL

  Browser->>PostgREST: GET /rest/v1/queue?checkin_date=eq.2026-09-01
  PostgREST->>PostgreSQL: SELECT * FROM queue WHERE checkin_date = '2026-09-01'
  PostgreSQL-->>PostgREST: rows[]
  PostgREST-->>Browser: JSON array

  Browser->>PostgREST: POST /rest/v1/invoices
  PostgREST->>PostgreSQL: INSERT INTO invoices (...)
  PostgreSQL-->>PostgREST: inserted row
  PostgREST-->>Browser: 201 Created
```

## Key Design Decisions
- See [adr/ADR-0001-REPOSITORY-STRATEGY.md](./adr/ADR-0001-REPOSITORY-STRATEGY.md)
- See [adr/ADR-0002-SERVICE-BOUNDARIES.md](./adr/ADR-0002-SERVICE-BOUNDARIES.md)
