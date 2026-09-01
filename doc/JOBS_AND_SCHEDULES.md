# Jobs and Schedules — MiNiCUTS Loyalty

> **Last verified:** 2026-09-01 · **Source:** `minicuts-staff.html` line ~1650

## Client-Side Intervals

| Job | File | Interval | Condition | Code location |
|---|---|---|---|---|
| Queue auto-refresh | `minicuts-staff.html` | 120 seconds | Queue tab must be active | `setInterval(() => { if (queueTabActive()) loadQ(); }, 120000)` |

No other background jobs, cron tasks, or server-side schedules exist in this codebase.

## Zen Platform Jobs (separate repo)

The Zen Platform layer runs scheduled jobs for MiNiCUTS:
- Social content generation (3x/week via GitHub Actions)
- WhatsApp campaign dispatch
- ML model retraining pipeline

See [Zen Platform JOBS_AND_SCHEDULES.md](../../zen-platform/doc/JOBS_AND_SCHEDULES.md).
