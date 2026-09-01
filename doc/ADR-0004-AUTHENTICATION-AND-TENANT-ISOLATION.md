# ADR-0004: Authentication and Tenant Isolation

**Date:** 2026-09-01 | **Status:** Proposed | **Deciders:** Munir (owner)

## Context

Current auth is a hardcoded PIN (`8065`) for management and no auth for staff pages. This is not suitable for SaaS.

## Proposed Decision

1. Supabase Auth (email + magic link) for all staff and management
2. RLS policies on every table scoped to `auth.uid()` and `tenant_id`
3. Anon key removed from browser — all calls proxied through Zen Platform Tenant API
4. Staff roles: `viewer`, `manager`, `admin`

## Migration Approach

1. Add `tenant_id` column to all tables
2. Populate with MiNiCUTS tenant UUID
3. Enable RLS with policies: `WHERE tenant_id = current_setting('app.tenant_id')`
4. Deploy Zen Platform Tenant API as proxy
5. Update all HTML files to call Tenant API instead of Supabase directly

## Status

Not yet implemented. See [MIGRATION_PLAN.md](../MIGRATION_PLAN.md) Phase 4.
