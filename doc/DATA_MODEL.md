# Data Model — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** Supabase schema inspection + SQL queries

## Entity Relationship Overview

```mermaid
erDiagram
  customers ||--o{ queue : has
  customers ||--o{ visits : earns
  customers ||--o{ prizes_given : redeems
  customers ||--o{ invoices : billed_on
  queue ||--o| invoices : checked_out_via
  staff ||--o{ staff_attendance : logs
  staff ||--o{ staff_leaves : requests
  staff ||--o{ staff_overtime : logs
  staff ||--o{ staff_documents : has
  staff ||--o{ staff_roster : assigned
  staff_leave_types ||--o{ staff_leaves : categorises
  salon_services ||--o{ queue : selected_for

  customers {
    uuid id PK
    text name
    text mobile
    int stamps
    int game_points
    text gender
    text location
    text heard_via
    date expiry_date
    bool tc_accepted
    timestamptz tc_accepted_at
  }
  queue {
    uuid id PK
    int token_number
    uuid customer_id FK
    text customer_name
    text mobile
    date checkin_date
    text status
    text service
    text stylist
    numeric service_value
    numeric tip
    text payment_type
    text location
    timestamptz called_at
  }
  invoices {
    uuid id PK
    text invoice_number
    uuid queue_id FK
    uuid customer_id FK
    text service
    text stylist
    numeric base_amount
    numeric tax_rate
    numeric tax_amount
    numeric tip
    numeric total_amount
    text payment_type
    text status
    text void_reason
    date checkin_date
  }
```

## Data Boundaries (Critical)

| Source | Date Range | Table | Rows |
|---|---|---|---|
| Excel import (historical) | up to 8 Jun 2026 | `historical_transactions` | ~5,858 |
| Live Supabase | from 9 Jun 2026 | `queue` | 1,743+ |

The constant `DB_CUTOFF = '2026-06-09'` in `index.html` controls this split. Analytics code merges both sources for revenue charts.

## Key Config Table

`staff_config` is a key-value store:

| Key | Content |
|---|---|
| `staff_config_data` | JSON: `{{ stylists[], waTemplate, passportBase, googleLink, instaLink }}` |
| `loyalty_config` | JSON: `{{ stampsNeeded, gameThresholds }}` |
| `co_settings` | JSON: invoice business info, VAT rate, services, WA invoice template |
| `tc_text` | HTML string: Terms & Conditions text |
| `gv_setup` | JSON: gift voucher types and packages |

## RLS Status

> ⚠️ Row Level Security is **DISABLED** on all tables. The anon key has full read/write access.
> See [KNOWN_RISKS_AND_TECHNICAL_DEBT.md](./KNOWN_RISKS_AND_TECHNICAL_DEBT.md).
