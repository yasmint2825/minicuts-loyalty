-- ============================================================================
-- sql/003_seed_users.sql — the first three people for SalonChain.       NOT APPLIED ANYWHERE.
--
-- Run ONLY after sql/002_salonchain_core.sql, on the sandbox first, and only with Munir's approval.
-- This file adds rows to `memberships` (who may do what). It does NOT create logins: create each person under
-- Supabase → Authentication → Users with the SAME e-mail (tick "Auto confirm"), or invite them from the app once
-- the first admin is in. E-mails are stored in lower case.
--
--   munir20684@gmail.com   Application admin  all outlets   onboards client businesses, manages users and outlets
--   yasmin1388@gmail.com   Owner (MiNiCUTS)   all outlets   runs the MiNiCUTS business
--   mincutsfze@gmail.com   Branch manager     DSO only      the salon manager at Dubai Silicon Oasis
-- ============================================================================
do $$
begin
  if not exists (select 1 from public.rbac_roles where key = 'platform_admin') then
    raise exception 'Role platform_admin is missing: run the LATEST sql/002_salonchain_core.sql first (it is safe to run again), then this file.';
  end if;
end $$;

insert into public.memberships (email, display_name, role_key, all_branches, branch_ids)
values
  ('munir20684@gmail.com', 'Munir',  'platform_admin', true,  '{}'),
  ('yasmin1388@gmail.com', 'Yasmin', 'owner',          true,  '{}'),
  ('mincutsfze@gmail.com', 'MiNiCUTS salon manager', 'branch_manager', false,
     array[(select id from public.branches where code = 'DSO')])
on conflict (email) do update
  set display_name = excluded.display_name, role_key = excluded.role_key,
      all_branches = excluded.all_branches, branch_ids = excluded.branch_ids, active = true;
