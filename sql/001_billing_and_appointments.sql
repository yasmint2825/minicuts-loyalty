-- ============================================================================
-- MiNiCUTS — Billing (checkout/discount/invoice) + Appointments
-- Branch: Appointments        Safe to re-run (idempotent, additive only).
--
-- WHAT THIS DOES
--   1. invoices      : extends the existing (empty) table with discount, GST/VAT split,
--                      seller snapshot, PDF link; adds an RLS policy (table currently has none,
--                      so the anon key cannot read/write it at all).
--   2. queue         : list_price, discount_pct, invoice_id, invoice_number
--   3. appointments  : new table
--   4. storage       : public bucket "invoices" for the PDF that WhatsApp links to
--
-- RUN ORDER: run on the DEV project first (flczmpscouzthbcostlg), test, then production
-- (wtapyfgtwkjyjrjdnhkb). After running: Supabase Dashboard -> Settings -> API -> Reload schema.
--
-- NOTE ON POLICIES: every table in this app is accessed with the public anon key (see
-- doc/AUTHENTICATION_AND_SECURITY.md). These policies follow that existing pattern
-- ("anon full access"). Tighten them when the Zen tenant-API migration (Phase 4) lands.
-- ============================================================================

-- ── 1. INVOICES ─────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_number  text unique,
  queue_id        uuid,
  customer_id     uuid,
  customer_name   text,
  mobile          text,
  service         text,
  stylist         text,
  base_amount     numeric default 0,      -- taxable value (after discount, excl. tax)
  tax_rate        numeric default 5,
  tax_amount      numeric default 0,      -- total tax (VAT, or CGST+SGST)
  tip             numeric default 0,
  total_amount    numeric default 0,      -- base + tax + tip
  payment_type    text,
  notes           text,
  status          text default 'paid',    -- paid | void
  void_reason     text,
  voided_at       timestamptz,
  checkin_date    date,
  whatsapp_sent   boolean default false,
  whatsapp_sent_at timestamptz,
  created_at      timestamptz default now()
);

alter table public.invoices add column if not exists fy               text;      -- '2026' (UAE) or '2627' (India Apr-Mar)
alter table public.invoices add column if not exists seq              integer;   -- running number within fy
alter table public.invoices add column if not exists stylist2         text;
alter table public.invoices add column if not exists list_price       numeric;   -- price before discount (as priced)
alter table public.invoices add column if not exists discount_pct     numeric default 0;
alter table public.invoices add column if not exists discount_amount  numeric default 0;
alter table public.invoices add column if not exists payable_amount   numeric;   -- what the customer pays for the service (incl. tax, excl. tip)
alter table public.invoices add column if not exists cgst             numeric default 0;
alter table public.invoices add column if not exists sgst             numeric default 0;
alter table public.invoices add column if not exists igst             numeric default 0;
alter table public.invoices add column if not exists price_basis      text;      -- 'inclusive' | 'exclusive'
alter table public.invoices add column if not exists country          text;      -- 'AE' | 'IN'
alter table public.invoices add column if not exists currency         text default 'AED';
alter table public.invoices add column if not exists tax_label        text;      -- 'VAT' | 'GST'
alter table public.invoices add column if not exists tax_id           text;      -- seller TRN / GSTIN at time of issue
alter table public.invoices add column if not exists sac              text;      -- India: service accounting code
alter table public.invoices add column if not exists place_of_supply  text;      -- India: state name + code
alter table public.invoices add column if not exists seller           jsonb;     -- snapshot of business details at issue time
alter table public.invoices add column if not exists pdf_url          text;
alter table public.invoices add column if not exists wa_status        text;      -- null | sent | failed
alter table public.invoices add column if not exists wa_error         text;

create unique index if not exists invoices_invoice_number_key on public.invoices (invoice_number);
-- one running number per financial year (stops two tablets issuing the same number)
create unique index if not exists invoices_fy_seq_key on public.invoices (fy, seq) where fy is not null and seq is not null;
create index if not exists invoices_checkin_date_idx on public.invoices (checkin_date);
create index if not exists invoices_queue_id_idx on public.invoices (queue_id);

alter table public.invoices enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='invoices' and policyname='anon full access') then
    create policy "anon full access" on public.invoices for all using (true) with check (true);
  end if;
end $$;

-- ── 2. QUEUE ────────────────────────────────────────────────────────────────
alter table public.queue add column if not exists list_price     numeric;
alter table public.queue add column if not exists discount_pct   numeric default 0;
alter table public.queue add column if not exists invoice_id     uuid;
alter table public.queue add column if not exists invoice_number text;

-- ── 3. APPOINTMENTS ─────────────────────────────────────────────────────────
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid,
  customer_name text not null,
  mobile        text,
  service_id    text,
  service       text not null,
  duration_min  integer not null default 30,   -- copied from salon_services.duration (+ buffer) at booking time
  stylist       text not null,
  appt_date     date not null,
  start_time    time not null,
  end_time      time not null,
  status        text not null default 'booked', -- booked | arrived | no_show | cancelled
  notes         text,
  source        text default 'staff',
  queue_id      uuid,                           -- set when the customer is checked in
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists appointments_date_idx    on public.appointments (appt_date, stylist);
create index if not exists appointments_mobile_idx  on public.appointments (mobile);

alter table public.appointments enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='appointments' and policyname='anon full access') then
    create policy "anon full access" on public.appointments for all using (true) with check (true);
  end if;
end $$;

-- ── 4. STORAGE: invoice PDFs ────────────────────────────────────────────────
-- Public bucket so the WhatsApp link opens without login. File names are random
-- (uuid) so links cannot be guessed, but anyone WITH the link can open the PDF.
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', true)
on conflict (id) do nothing;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='invoices anon insert') then
    create policy "invoices anon insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'invoices');
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='invoices public read') then
    create policy "invoices public read" on storage.objects for select to anon, authenticated using (bucket_id = 'invoices');
  end if;
end $$;

-- ── 5. WHATSAPP TEMPLATE (reference only — submitted in Meta, not SQL) ──────
-- Name: mc_invoice_utility   Language: en   Category: UTILITY
-- Body:
--   Hi {{1}}, thank you for visiting MiNiCUTS. Your invoice {{2}} dated {{3}} for {{4}} is ready.
--   View or download it here: {{5}}
-- Samples: {{1}}=Aisha  {{2}}=MC/2026/00012  {{3}}=14 Oct 2026  {{4}}=AED 42.00  {{5}}=https://.../invoices/abc.pdf
