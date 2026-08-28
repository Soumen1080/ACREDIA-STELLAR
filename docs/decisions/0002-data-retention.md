# 0002 — Data retention periods and how they are enforced

**Status:** Accepted
**Date:** 2026-08-28
**Issue:** [#227](https://github.com/soumen0818/ACREDIA-STELLAR/issues/227)

## Context

Two tables hold personal or pseudonymous data that accumulates without bound
from public traffic:

- `verification_logs` — one row per public verification attempt, with
  `ip_hash` and `user_agent_hash` (HMAC-SHA256 pseudonyms) and optional
  verifier-supplied email/organisation.
- `contact_messages` — name, email, message body, and `ip_hash` from the
  public contact form.

`/legal/privacy` published a retention period for both: 90 days for
verification logs ("automatic nightly purge") and 24 months for contact
messages ("from last correspondence").

Neither was enforced. `purge_old_verification_logs()` existed but nothing
called it — the only schedule was a commented-out `cron.schedule(...)` snippet
in a migration header, labelled "run once in the Supabase SQL editor". There
was no mechanism at all for `contact_messages`. Nothing anywhere reported
whether a purge had ever run, so the gap was invisible.

Publishing a specific retention period and not enforcing it is worse than
publishing none: GDPR Art. 5(1)(e) requires storage limitation, and Art. 5(2)
requires the controller to be able to *demonstrate* it.

## Decision

**Periods are unchanged** — the published ones were reasonable and are now
enforced rather than rewritten:

| Table | Period | Clock starts at |
| --- | --- | --- |
| `verification_logs` | 90 days | `created_at` |
| `contact_messages` | 24 months | `COALESCE(handled_at, created_at)` |

For `contact_messages`, "from last correspondence" is read as `handled_at`
when the message has been dealt with, falling back to `created_at` when it
never was. A message nobody ever answered is therefore deleted 24 months after
it arrived, not kept forever waiting for a reply.

**Enforcement is Option B from the issue — an authenticated cron route — plus
pg_cron where it happens to be available.**

- `public.run_retention_purge()` is the single entry point. It runs both
  purges and writes one row to `public.maintenance_runs` recording when it
  ran, how long it took, how many rows each table lost, and whether it failed.
- `GET /api/cron/retention` calls it, authenticated with `CRON_SECRET` and
  scheduled at 03:00 UTC by `vercel.json`.
- The migration *also* registers a pg_cron job calling the same function, but
  only if the extension exists, so a Supabase-only deployment is covered
  without Vercel. Both schedulers are idempotent and produce identical records.

Option A alone was rejected because pg_cron is not available on every target
(local development, plain Postgres, some managed tiers) and a schedule living
only inside the database is neither visible in the repo nor testable in CI.

## Consequences

- **`CRON_SECRET` is required in production.** The cron route fails closed
  (HTTP 503) when it is unset rather than exposing an unauthenticated endpoint
  that deletes rows. A deployment without it does not purge — and the admin
  console will say so within 48 hours.
- **A stalled purge is loud.** `/api/admin/retention` reports row counts,
  rows past their period (`overdue`), and hours since the last success. It
  logs at `ERROR` — and the admin overview shows a red panel — when no purge
  has succeeded in 48 hours *or* any row is overdue. A deployment that has
  never purged counts as stale, so "never ran" cannot read as healthy.
- **Two missed nights, not one, trips the alert**, so a single skipped run or
  a slow deploy window is not noise.
- **Periods live in two SQL places each** (the function that deletes, the
  function that reports). `tests/retentionEnforcement.test.ts` asserts they
  agree with each other and with the privacy-policy text, so the page and the
  behaviour cannot drift apart again.

## Not decided here

Whether to shorten either period. 90 days and 24 months were already
published; changing them is a product and legal call, not a fix for the
enforcement gap this records.
