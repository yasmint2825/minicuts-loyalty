# ADR-0002: Service Boundaries

**Date:** 2026-09-01 | **Status:** Accepted | **Deciders:** Munir (owner)

## Context

All functionality is in one repository. As Zen Platform grows, boundaries need to be defined.

## Decision

MiNiCUTS-specific UI stays in `minicuts-loyalty`. Platform-level services (auth, agents, analytics) live in `Zen-Platform-Console`. MiNiCUTS calls Zen Platform APIs progressively.

## Boundaries

| Boundary | MiNiCUTS repo | Zen Platform repo |
|---|---|---|
| Customer check-in UI | ✅ | |
| Queue + checkout UI | ✅ | |
| Loyalty passport UI | ✅ | |
| WhatsApp agent | | ✅ |
| ML analytics | | ✅ |
| Auth + tenant mgmt | | ✅ |
| Social content agent | | ✅ |

## Consequences

- Clear ownership per domain
- Progressive migration without big-bang rewrite
