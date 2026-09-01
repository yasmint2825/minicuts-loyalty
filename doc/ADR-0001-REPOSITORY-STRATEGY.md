# ADR-0001: Repository Strategy

**Date:** 2026-09-01 | **Status:** Accepted | **Deciders:** Munir (owner)

## Context

MiNiCUTS needed a simple deployment with zero infrastructure overhead. The team is one developer working in browser-native technology.

## Decision

Single GitHub repository (`yasmint2825/minicuts-loyalty`) deployed directly to GitHub Pages. No monorepo tooling, no build pipeline.

## Rationale

- Zero-cost hosting on GitHub Pages
- No CI/CD pipeline needed — `git push` deploys
- Suitable for single-tenant, single-developer context
- Acceptable technical debt: credential duplication across files

## Consequences

- ✅ Zero hosting cost, instant deploys
- ✅ Any developer with git access can deploy immediately
- ❌ Credentials hardcoded in every HTML file
- ❌ No environment separation (dev/staging/prod)
- ❌ Must be re-evaluated before SaaS launch (see [ADR-0005](./ADR-0005-INCREMENTAL-MIGRATION.md))
