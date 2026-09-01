# ADR-0003: Data Ownership

**Date:** 2026-09-01 | **Status:** Accepted | **Deciders:** Munir (owner)

## Context

MiNiCUTS uses Supabase directly. Zen Platform will eventually manage multi-tenant data.

## Decision

MiNiCUTS retains its own Supabase project for now. When Zen Platform onboards MiNiCUTS as tenant, data access goes through the Tenant API — Zen Platform never touches MiNiCUTS Supabase directly.

## Data Boundary

- `historical_transactions`: Excel import, pre-9 June 2026. Read-only archive.
- `queue`: Live from 9 June 2026. Source of truth for all current operations.
- `DB_CUTOFF = '2026-06-09'` in `index.html` enforces this boundary.

## Consequences

- MiNiCUTS data stays in MiNiCUTS control
- Analytics must merge two sources (handled in `acqRenderHistInsights()`)
