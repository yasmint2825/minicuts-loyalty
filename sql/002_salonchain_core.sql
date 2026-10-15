-- ============================================================================
-- MiNiCUTS SalonChain — outlets, users & access (RBAC), inventory, purchase orders
-- Branch: SalonChain          Safe to re-run (idempotent, additive only).
--
-- *** NOT APPLIED ANYWHERE. Do NOT run on production (wtapyfgtwkjyjrjdnhkb) or on the DEV
-- *** project. Rehearse on a separate sandbox project first (see doc/SALONCHAIN_DESIGN.md §8).
--
-- WHAT THIS ADDS (all NEW tables — no existing table is altered, so the live salon is unaffected)
--   1. branches            one row per outlet (seeded with DSO)
--   2. rbac_roles          role -> list of permissions (+ purchase-order approval limit)
--   3. memberships         who (login e-mail) has which role, for which outlets
--   4. inventory_items, item_branch_settings, suppliers
--   5. stock_movements     append-only stock ledger (receipts, issues, adjustments, transfers)
--   6. purchase_orders, purchase_order_lines, po_receipts
--   7. audit_log           written by triggers, so it cannot be skipped from the browser
--   8. Row-level security on every table above, driven by rbac_has(permission, branch)
--
-- SECURITY MODEL
--   The browser signs in with Supabase Auth (e-mail + password) and sends the user's JWT. Every policy
--   below resolves the e-mail in that JWT to a membership, then to the role's permissions and the
--   outlets that membership may touch. The public anon key has NO access to these tables.
--   Business rules that must not be bypassable (no negative stock, approval limits, "creator cannot
--   approve own PO", PO totals) are enforced in triggers, not only in the UI.
-- ============================================================================

-- ── 1. BRANCHES ──────────────────────────────────────────────
create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code = upper(code)),
  name        text not null,
  address     text,
  timezone    text not null default 'Asia/Dubai',
  currency    text not null default 'AED',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
insert into public.branches (code, name, address)
values ('DSO', 'MiNiCUTS — Dubai Silicon Oasis', 'Dubai Silicon Oasis, Dubai')
on conflict (code) do nothing;

-- ── 2. ROLES ─────────────────────────────────────────────────
create table if not exists public.rbac_roles (
  key                text primary key,
  label              text not null,
  description        text,
  permissions        text[] not null default '{}',     -- '*' = every permission
  po_approval_limit  numeric,                          -- NULL = unlimited (only matters if po.approve is held)
  default_all_branches boolean not null default false,
  is_system          boolean not null default true
);

-- permission catalogue (documentation only — the app shows these in "Users & access")
--   queue.operate  appointments.manage  customers.view  customers.edit  checkout.create  invoice.void
--   discount.apply history.view  reports.view  reports.view_all  insights.view
--   inventory.view inventory.receive inventory.issue inventory.adjust inventory.transfer inventory.items
--   suppliers.manage  po.view po.create po.approve po.approve_own po.receive po.cancel
--   users.manage roles.manage branches.manage  settings.branch settings.chain  chain.overview  audit.view

insert into public.rbac_roles (key, label, description, permissions, po_approval_limit, default_all_branches) values
 ('owner', 'Owner', 'Everything, every outlet.', array['*'], null, true),
 ('controller', 'Controller', 'Sees every outlet, approves purchase orders, oversees stock and the audit trail. Cannot manage users.',
   array['history.view','customers.view','reports.view','reports.view_all','insights.view','inventory.view','inventory.adjust','inventory.transfer','inventory.items','suppliers.manage','po.view','po.create','po.approve','po.receive','po.cancel','chain.overview','audit.view'], null, true),
 ('area_manager', 'Area manager', 'Runs the outlets assigned to them; approves purchase orders up to a limit.',
   array['queue.operate','appointments.manage','customers.view','customers.edit','checkout.create','invoice.void','discount.apply','history.view','reports.view','insights.view','inventory.view','inventory.receive','inventory.issue','inventory.adjust','inventory.transfer','inventory.items','po.view','po.create','po.approve','po.receive','po.cancel','settings.branch','chain.overview'], 2000, false),
 ('branch_manager', 'Branch manager', 'Runs one outlet: queue, billing, stock, purchase orders (approves small ones).',
   array['queue.operate','appointments.manage','customers.view','customers.edit','checkout.create','invoice.void','discount.apply','history.view','reports.view','insights.view','inventory.view','inventory.receive','inventory.issue','inventory.adjust','inventory.transfer','inventory.items','po.view','po.create','po.approve','po.receive','po.cancel','settings.branch'], 500, false),
 ('store_keeper', 'Store keeper', 'Receives and issues stock, drafts purchase orders for a manager to approve.',
   array['inventory.view','inventory.receive','inventory.issue','po.view','po.create','po.receive'], 0, false),
 ('receptionist', 'Receptionist', 'Front desk: queue, appointments, customers, checkout. Can record stock used.',
   array['queue.operate','appointments.manage','customers.view','customers.edit','checkout.create','history.view','inventory.view','inventory.issue'], 0, false),
 ('stylist', 'Stylist', 'Works the queue and records stock used.',
   array['queue.operate','appointments.manage','customers.view','inventory.view','inventory.issue'], 0, false),
 ('auditor', 'Auditor (read-only)', 'Can see everything, change nothing.',
   array['history.view','customers.view','reports.view','reports.view_all','insights.view','inventory.view','po.view','chain.overview','audit.view'], 0, true)
on conflict (key) do update
  set label = excluded.label, description = excluded.description, permissions = excluded.permissions,
      po_approval_limit = excluded.po_approval_limit, default_all_branches = excluded.default_all_branches
  where public.rbac_roles.is_system;

-- ── 3. MEMBERSHIPS (who may do what, where) ──────────────────
create table if not exists public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (email = lower(email)),
  display_name       text,
  role_key           text not null references public.rbac_roles(key),
  all_branches       boolean not null default false,
  branch_ids         uuid[] not null default '{}',
  po_approval_limit  numeric,                          -- overrides the role's limit when set
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists memberships_email_uq on public.memberships (email);

-- FIRST OWNER (run once, by hand, after reviewing):
-- insert into public.memberships (email, display_name, role_key, all_branches)
-- values ('munir20684@gmail.com', 'Munir', 'owner', true) on conflict (email) do nothing;

-- helpers used by every policy and trigger ------------------------------------
create or replace function public.rbac_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.rbac_has(perm text, br uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships m join public.rbac_roles r on r.key = m.role_key
    where m.email = public.rbac_email() and m.active
      and ('*' = any (r.permissions) or perm = any (r.permissions))
      and (br is null or m.all_branches or br = any (m.branch_ids))
  )
$$;

-- purchase-order approval limit of the signed-in user (NULL = unlimited)
create or replace function public.rbac_po_limit() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(m.po_approval_limit, r.po_approval_limit)
  from public.memberships m join public.rbac_roles r on r.key = m.role_key
  where m.email = public.rbac_email() and m.active
$$;

-- ── 4. INVENTORY CATALOGUE ───────────────────────────────────
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text, phone text, whatsapp text, email text,
  payment_terms text, currency text not null default 'AED', lead_time_days int not null default 3,
  notes         text, active boolean not null default true,
  created_at    timestamptz not null default now()
);
create table if not exists public.inventory_items (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  name          text not null,
  category      text,                                   -- e.g. Hair care, Disposables, Kids gifts, Cleaning
  unit          text not null default 'pcs',
  pack_size     numeric not null default 1 check (pack_size > 0),   -- order in multiples of this
  last_cost     numeric not null default 0,
  supplier_id   uuid references public.suppliers(id),
  active        boolean not null default true,
  notes         text,
  created_at    timestamptz not null default now()
);
create table if not exists public.item_branch_settings (
  item_id         uuid not null references public.inventory_items(id) on delete cascade,
  branch_id       uuid not null references public.branches(id),
  reorder_point   numeric not null default 0,
  reorder_qty     numeric not null default 0,
  max_level       numeric,
  lead_time_days  int,
  location        text,
  primary key (item_id, branch_id)
);

-- ── 5. STOCK LEDGER (append-only) ────────────────────────────
create table if not exists public.stock_movements (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references public.branches(id),
  item_id      uuid not null references public.inventory_items(id),
  move_type    text not null check (move_type in ('opening','receipt','issue','adjust','transfer_in','transfer_out')),
  qty_delta    numeric not null,                         -- + in, − out
  unit_cost    numeric,
  reason       text,                                     -- used_in_service | gift | damaged | expired | other ...
  note         text,
  po_line_id   uuid,
  receipt_id   uuid,
  transfer_id  uuid,
  moved_on     date not null default current_date,
  created_by   text,
  created_at   timestamptz not null default now(),
  check ( (move_type in ('opening','receipt','transfer_in') and qty_delta > 0)
       or (move_type in ('issue','transfer_out') and qty_delta < 0)
       or (move_type = 'adjust' and qty_delta <> 0) )
);
create index if not exists stock_movements_branch_item on public.stock_movements (branch_id, item_id);
create index if not exists stock_movements_po_line on public.stock_movements (po_line_id) where po_line_id is not null;
create index if not exists stock_movements_moved_on on public.stock_movements (branch_id, moved_on);

-- ── 6. PURCHASING ────────────────────────────────────────────
create table if not exists public.purchase_orders (
  id               uuid primary key default gen_random_uuid(),
  po_number        text unique,
  fy               text,
  seq              int,
  branch_id        uuid not null references public.branches(id),
  supplier_id      uuid not null references public.suppliers(id),
  status           text not null default 'draft'
                   check (status in ('draft','submitted','approved','rejected','ordered','partial','received','closed','cancelled')),
  order_date       date not null default current_date,
  expected_date    date,
  currency         text not null default 'AED',
  tax_rate         numeric not null default 5,
  subtotal         numeric not null default 0,
  tax_amount       numeric not null default 0,
  total            numeric not null default 0,
  notes            text,
  created_by       text, submitted_at timestamptz,
  approved_by      text, approved_at timestamptz,
  rejected_reason  text,
  ordered_at       timestamptz,
  cancelled_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (branch_id, fy, seq)
);
create table if not exists public.purchase_order_lines (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders(id) on delete cascade,
  item_id      uuid references public.inventory_items(id),
  description  text not null,
  qty_ordered  numeric not null check (qty_ordered > 0),
  unit_cost    numeric not null default 0 check (unit_cost >= 0),
  line_total   numeric generated always as (round(qty_ordered * unit_cost, 2)) stored
);
create index if not exists purchase_order_lines_po on public.purchase_order_lines (po_id);
create table if not exists public.po_receipts (
  id            uuid primary key default gen_random_uuid(),
  po_id         uuid not null references public.purchase_orders(id) on delete cascade,
  received_on   date not null default current_date,
  delivery_ref  text,
  note          text,
  received_by   text,
  created_at    timestamptz not null default now()
);

-- ── 7. AUDIT LOG ─────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  actor      text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  branch_id  uuid,
  detail     jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);

-- ============================================================================
-- TRIGGERS — rules that must hold even if someone calls the API directly
-- ============================================================================

-- stock ledger: stamp the actor, never allow negative stock ---------------------
create or replace function public.trg_stock_movement_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  new.created_by := public.rbac_email();
  if new.qty_delta < 0 and new.move_type in ('issue','transfer_out') then
    perform pg_advisory_xact_lock(hashtext(new.branch_id::text || new.item_id::text));
    select coalesce(sum(qty_delta), 0) into cur from public.stock_movements where branch_id = new.branch_id and item_id = new.item_id;
    if cur + new.qty_delta < 0 then
      raise exception 'Insufficient stock: % on hand, % requested', cur, -new.qty_delta using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists stock_movement_before on public.stock_movements;
create trigger stock_movement_before before insert on public.stock_movements for each row execute function public.trg_stock_movement_before();

-- ledger is append-only: no UPDATE or DELETE, whoever you are -------------------
create or replace function public.trg_ledger_immutable() returns trigger
language plpgsql as $$ begin raise exception 'stock_movements is append-only — post a correcting adjustment instead'; end $$;
drop trigger if exists stock_movement_immutable on public.stock_movements;
create trigger stock_movement_immutable before update or delete on public.stock_movements for each row execute function public.trg_ledger_immutable();

-- audit: adjustments / openings / transfers ---------------------------------------
create or replace function public.trg_stock_movement_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.move_type in ('adjust','opening','transfer_out','transfer_in') then
    insert into public.audit_log (actor, action, entity, entity_id, branch_id, detail)
    values (new.created_by, 'stock.' || new.move_type, 'stock_movements', new.id::text, new.branch_id,
            jsonb_build_object('item_id', new.item_id, 'qty', new.qty_delta, 'reason', new.reason, 'note', new.note));
  end if;
  return new;
end $$;
drop trigger if exists stock_movement_audit on public.stock_movements;
create trigger stock_movement_audit after insert on public.stock_movements for each row execute function public.trg_stock_movement_audit();

-- purchase orders: numbering, status rules, approval limits -----------------------
create or replace function public.trg_po_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := public.rbac_email(); sub numeric; n int; lim numeric; code text;
begin
  -- changes made by other triggers (receipt sync) are trusted
  if pg_trigger_depth() > 1 then new.updated_at := now(); return new; end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'A purchase order starts as a draft'; end if;
    new.created_by := me;
    -- numbering is always assigned here (gap-free per outlet and year), whatever the browser sent
    select b.code, to_char(now() at time zone b.timezone, 'YYYY') into code, new.fy from public.branches b where b.id = new.branch_id;
    perform pg_advisory_xact_lock(hashtext('po' || new.branch_id::text));
    select coalesce(max(seq), 0) + 1 into new.seq from public.purchase_orders where branch_id = new.branch_id and fy = new.fy;
    new.po_number := 'PO/' || code || '/' || new.fy || '/' || lpad(new.seq::text, 4, '0');
    new.subtotal := 0; new.tax_amount := 0; new.total := 0;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------------------------------------
  new.updated_at := now();
  if new.po_number is distinct from old.po_number or new.branch_id is distinct from old.branch_id or new.created_by is distinct from old.created_by then
    raise exception 'PO number, outlet and creator cannot be changed';
  end if;
  if new.status = old.status then
    if old.status not in ('draft','rejected') and (new.supplier_id is distinct from old.supplier_id or new.total is distinct from old.total or new.subtotal is distinct from old.subtotal) then
      raise exception 'A submitted purchase order cannot be edited';
    end if;
    if old.status in ('draft') and not public.rbac_has('po.create', old.branch_id) then raise exception 'Not allowed to edit this purchase order'; end if;
    return new;
  end if;

  -- legal transitions
  if old.status in ('draft','rejected') and new.status = 'draft' then
    if not public.rbac_has('po.create', old.branch_id) then raise exception 'Not allowed to edit this purchase order'; end if;

  elsif old.status = 'draft' and new.status = 'submitted' then
    if not public.rbac_has('po.create', old.branch_id) then raise exception 'Not allowed to submit purchase orders for this outlet'; end if;
    select coalesce(sum(line_total), 0), count(*) into sub, n from public.purchase_order_lines where po_id = old.id;
    if n = 0 then raise exception 'Add at least one line before submitting'; end if;
    new.subtotal := sub; new.tax_amount := round(sub * new.tax_rate / 100, 2); new.total := new.subtotal + new.tax_amount;
    new.submitted_at := now();

  elsif old.status = 'submitted' and new.status = 'approved' then
    if not public.rbac_has('po.approve', old.branch_id) then raise exception 'You are not allowed to approve purchase orders for this outlet'; end if;
    if old.created_by = me and not public.rbac_has('po.approve_own', old.branch_id) then raise exception 'You cannot approve a purchase order you created'; end if;
    lim := public.rbac_po_limit();
    if lim is not null and old.total > lim then raise exception 'Total % is above your approval limit of %', old.total, lim; end if;
    new.approved_by := me; new.approved_at := now();

  elsif old.status = 'submitted' and new.status = 'rejected' then
    if not public.rbac_has('po.approve', old.branch_id) then raise exception 'You are not allowed to reject purchase orders for this outlet'; end if;
    if coalesce(trim(new.rejected_reason), '') = '' then raise exception 'Give a reason for rejecting'; end if;

  elsif old.status = 'approved' and new.status = 'ordered' then
    if not public.rbac_has('po.create', old.branch_id) then raise exception 'Not allowed to place this order'; end if;
    new.ordered_at := now();

  elsif old.status in ('ordered','partial') and new.status in ('partial','received','closed') then
    if not public.rbac_has('po.receive', old.branch_id) then raise exception 'Not allowed to receive goods for this outlet'; end if;

  elsif new.status = 'cancelled' and old.status in ('draft','submitted','approved','rejected','ordered','partial') then
    if not public.rbac_has('po.cancel', old.branch_id) then raise exception 'Not allowed to cancel this purchase order'; end if;
    if coalesce(trim(new.cancelled_reason), '') = '' then raise exception 'Give a reason for cancelling'; end if;
    if exists (select 1 from public.po_receipts where po_id = old.id) then raise exception 'Goods were already received — close the order instead'; end if;
  else
    raise exception 'A % purchase order cannot become %', old.status, new.status;
  end if;
  return new;
end $$;
drop trigger if exists po_guard on public.purchase_orders;
create trigger po_guard before insert or update on public.purchase_orders for each row execute function public.trg_po_guard();

create or replace function public.trg_po_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.audit_log (actor, action, entity, entity_id, branch_id, detail)
    values (public.rbac_email(), 'po.' || new.status, 'purchase_orders', new.id::text, new.branch_id,
            jsonb_build_object('po_number', new.po_number, 'from', old.status, 'total', new.total, 'reason', coalesce(new.rejected_reason, new.cancelled_reason)));
  end if;
  return new;
end $$;
drop trigger if exists po_audit on public.purchase_orders;
create trigger po_audit after update on public.purchase_orders for each row execute function public.trg_po_audit();

-- lines may only change while the PO is a draft -------------------------------------------------------
create or replace function public.trg_po_line_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare st text; pid uuid := coalesce(new.po_id, old.po_id);
begin
  select status into st from public.purchase_orders where id = pid;
  if st is distinct from 'draft' then raise exception 'Lines can only be changed while the purchase order is a draft'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists po_line_guard on public.purchase_order_lines;
create trigger po_line_guard before insert or update or delete on public.purchase_order_lines for each row execute function public.trg_po_line_guard();

-- receiving goods moves the PO to partial / received automatically ----------------------------------------
create or replace function public.trg_po_receipt_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid; open_lines int;
begin
  if new.po_line_id is null then return new; end if;
  select po_id into pid from public.purchase_order_lines where id = new.po_line_id;
  if pid is null then return new; end if;
  select count(*) into open_lines from public.purchase_order_lines l
   where l.po_id = pid and l.qty_ordered > coalesce((select sum(m.qty_delta) from public.stock_movements m where m.po_line_id = l.id), 0);
  update public.purchase_orders set status = case when open_lines = 0 then 'received' else 'partial' end
   where id = pid and status in ('ordered','partial');
  return new;
end $$;
drop trigger if exists po_receipt_sync on public.stock_movements;
create trigger po_receipt_sync after insert on public.stock_movements for each row execute function public.trg_po_receipt_sync();

-- people & roles changes are audited ---------------------------------------------------------------------
create or replace function public.trg_membership_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' or tg_op = 'INSERT' then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (public.rbac_email(), 'user.' || lower(tg_op), 'memberships', new.id::text,
            jsonb_build_object('email', new.email, 'role', new.role_key, 'all_branches', new.all_branches, 'branches', new.branch_ids, 'active', new.active));
  end if;
  return new;
end $$;
drop trigger if exists membership_audit on public.memberships;
create trigger membership_audit before insert or update on public.memberships for each row execute function public.trg_membership_audit();

-- ============================================================================
-- VIEWS (RLS of the underlying tables applies to the caller)
-- ============================================================================
create or replace view public.v_stock_on_hand with (security_invoker = true) as
  select branch_id, item_id, sum(qty_delta) as on_hand, max(created_at) as last_movement
  from public.stock_movements group by branch_id, item_id;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- ============================================================================
alter table public.branches              enable row level security;
alter table public.rbac_roles            enable row level security;
alter table public.memberships           enable row level security;
alter table public.suppliers             enable row level security;
alter table public.inventory_items       enable row level security;
alter table public.item_branch_settings  enable row level security;
alter table public.stock_movements       enable row level security;
alter table public.purchase_orders       enable row level security;
alter table public.purchase_order_lines  enable row level security;
alter table public.po_receipts           enable row level security;
alter table public.audit_log             enable row level security;

-- Supabase grants ALL on new tables to anon/authenticated by default, so start from nothing and grant exactly what is needed
revoke all on public.branches, public.rbac_roles, public.memberships, public.suppliers, public.inventory_items,
  public.item_branch_settings, public.stock_movements, public.purchase_orders, public.purchase_order_lines,
  public.po_receipts, public.audit_log, public.v_stock_on_hand from anon, authenticated;
grant select, insert, update, delete on public.branches, public.rbac_roles, public.memberships, public.suppliers,
  public.inventory_items, public.item_branch_settings, public.purchase_order_lines to authenticated;
grant select, insert, update on public.purchase_orders to authenticated;      -- cancelled, never deleted
grant select, insert on public.po_receipts to authenticated;
grant select, insert on public.stock_movements to authenticated;
grant select on public.audit_log to authenticated;     -- rows are written by the security-definer triggers only
grant select on public.v_stock_on_hand to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

-- a policy is only ever evaluated for a signed-in member; anyone else matches nothing
drop policy if exists branches_read on public.branches;
create policy branches_read on public.branches for select to authenticated
  using (exists (select 1 from public.memberships m where m.email = public.rbac_email() and m.active and (m.all_branches or branches.id = any (m.branch_ids))));
drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all to authenticated
  using (public.rbac_has('branches.manage')) with check (public.rbac_has('branches.manage'));

drop policy if exists roles_read on public.rbac_roles;
create policy roles_read on public.rbac_roles for select to authenticated using (exists (select 1 from public.memberships m where m.email = public.rbac_email() and m.active));
drop policy if exists roles_write on public.rbac_roles;
create policy roles_write on public.rbac_roles for all to authenticated using (public.rbac_has('roles.manage')) with check (public.rbac_has('roles.manage'));

drop policy if exists members_read on public.memberships;
create policy members_read on public.memberships for select to authenticated using (email = public.rbac_email() or public.rbac_has('users.manage'));
drop policy if exists members_write on public.memberships;
create policy members_write on public.memberships for all to authenticated using (public.rbac_has('users.manage')) with check (public.rbac_has('users.manage'));

drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated using (public.rbac_has('po.view') or public.rbac_has('inventory.view'));
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated using (public.rbac_has('suppliers.manage')) with check (public.rbac_has('suppliers.manage'));

drop policy if exists items_read on public.inventory_items;
create policy items_read on public.inventory_items for select to authenticated using (public.rbac_has('inventory.view') or public.rbac_has('po.view'));
drop policy if exists items_write on public.inventory_items;
create policy items_write on public.inventory_items for all to authenticated using (public.rbac_has('inventory.items')) with check (public.rbac_has('inventory.items'));

drop policy if exists ibs_read on public.item_branch_settings;
create policy ibs_read on public.item_branch_settings for select to authenticated using (public.rbac_has('inventory.view', branch_id));
drop policy if exists ibs_write on public.item_branch_settings;
create policy ibs_write on public.item_branch_settings for all to authenticated using (public.rbac_has('inventory.items', branch_id)) with check (public.rbac_has('inventory.items', branch_id));

drop policy if exists sm_read on public.stock_movements;
create policy sm_read on public.stock_movements for select to authenticated using (public.rbac_has('inventory.view', branch_id));
drop policy if exists sm_insert on public.stock_movements;
create policy sm_insert on public.stock_movements for insert to authenticated with check (
  case move_type
    when 'receipt'      then public.rbac_has('inventory.receive', branch_id) or (po_line_id is not null and public.rbac_has('po.receive', branch_id))
    when 'issue'        then public.rbac_has('inventory.issue', branch_id)
    when 'adjust'       then public.rbac_has('inventory.adjust', branch_id)
    when 'opening'      then public.rbac_has('inventory.adjust', branch_id)
    when 'transfer_out' then public.rbac_has('inventory.transfer', branch_id)
    when 'transfer_in'  then transfer_id is not null and exists (
         select 1 from public.stock_movements o where o.transfer_id = stock_movements.transfer_id and o.move_type = 'transfer_out'
            and o.item_id = stock_movements.item_id and public.rbac_has('inventory.transfer', o.branch_id))
    else false end);

drop policy if exists po_read on public.purchase_orders;
create policy po_read on public.purchase_orders for select to authenticated using (public.rbac_has('po.view', branch_id));
drop policy if exists po_insert on public.purchase_orders;
create policy po_insert on public.purchase_orders for insert to authenticated with check (public.rbac_has('po.create', branch_id));
drop policy if exists po_update on public.purchase_orders;
create policy po_update on public.purchase_orders for update to authenticated using (public.rbac_has('po.view', branch_id)) with check (public.rbac_has('po.view', branch_id));
-- no delete policy: purchase orders are cancelled, never deleted

drop policy if exists pol_read on public.purchase_order_lines;
create policy pol_read on public.purchase_order_lines for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id and public.rbac_has('po.view', p.branch_id)));
drop policy if exists pol_write on public.purchase_order_lines;
create policy pol_write on public.purchase_order_lines for all to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id and public.rbac_has('po.create', p.branch_id)))
  with check (exists (select 1 from public.purchase_orders p where p.id = po_id and public.rbac_has('po.create', p.branch_id)));

drop policy if exists receipts_read on public.po_receipts;
create policy receipts_read on public.po_receipts for select to authenticated
  using (exists (select 1 from public.purchase_orders p where p.id = po_id and public.rbac_has('po.view', p.branch_id)));
drop policy if exists receipts_insert on public.po_receipts;
create policy receipts_insert on public.po_receipts for insert to authenticated
  with check (exists (select 1 from public.purchase_orders p where p.id = po_id and public.rbac_has('po.receive', p.branch_id)));

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.rbac_has('audit.view'));
-- audit rows are written by security-definer triggers only (no insert policy for users)
