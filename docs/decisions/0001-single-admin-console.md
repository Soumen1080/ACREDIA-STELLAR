# 0001 — One admin console, at `/admin`

**Status:** Accepted
**Date:** 2026-08-28
**Issues:** [#224](https://github.com/soumen0818/ACREDIA-STELLAR/issues/224) (shared console shell), [#225](https://github.com/soumen0818/ACREDIA-STELLAR/issues/225) (admin landing screen)

## Context

`/dashboard` used to render a third, admin-specific screen: a "Welcome, Admin"
heading, an Account card mixing identity, account actions, and wallet status,
and two link cards pointing at `/admin` and `/admin/institutions` — followed by
roughly half a viewport of nothing.

That screen had no job. It was not a working dashboard (it showed no data) and
not a redirect either, so it read as a dead-end menu that duplicated `/admin`
without its content. `/auth/admin-login` already sends admins straight to
`/admin`, so it was only reachable by clicking the logo or typing the URL.

Issue #225 offered two directions:

- **Option A** — grow `/dashboard` into a real admin overview: sidebar shell,
  live stats, pending institutions, verification activity, worker health.
- **Option B** — redirect `/dashboard` → `/admin`, so there is exactly one
  admin console.

## Decision

**Option B.** `/dashboard` redirects admins to `/admin`, and `/admin` is the
admin landing screen.

Option A was rejected because everything it asks for — the sidebar shell, live
statistics, and links into the rest of the console — already exists at `/admin`.
Building it a second time at `/dashboard` would leave one role with two consoles
that have to be kept in sync, which is the opposite of what #224 set out to fix.

Consequences of choosing B:

- `/dashboard` and `/dashboard/settings` redirect admins to `/admin` and
  `/admin/settings`. The settings redirect preserves the query string, because
  the notification-unsubscribe route sends every role to `/dashboard/settings`.
- The "welcome" surface is gone. Nothing was lost with it: it carried no data.
- **The acceptance criteria of #225 move to `/admin`.** #225 lists changes to
  `/admin` as out of scope, but that was written assuming the landing screen
  would stay at `/dashboard`. Under Option B, `/admin` *is* the landing screen,
  so it is the only place the criteria can be satisfied.

## What that meant for `/admin`

- **Blocking states own the whole content area.** No wallet connected, still
  checking ownership, and connected-but-not-the-owner each render a single
  centred gate instead of a small card stranded above an empty page. The
  disconnected state went from filling 51% of a 1080p viewport to 96%.
- **Wallet-disconnected is loud, connected is quiet.** The gate is
  warning-toned with the connect action inside it. When a wallet is connected
  it disappears entirely; the address becomes a quiet control in the sidebar.
- **Identity, wallet state, and actions are separated** into three bands in the
  sidebar footer — "Signed in as <email>", then the wallet control, then sign
  out. The page no longer carries an Account card.
- **The landing screen leads with what needs attention:** institutions awaiting
  review, counted from the institution `status` column via the existing
  `/api/admin/institutions` route. Deliberately *not* from the overview's
  `authorizedInstitutions` stat, which counts "has a wallet or has issued
  something" rather than "approved by an admin", and would make the claim
  untrue.
- **Verification outcomes and indexer position are shown.** Both already rode
  along in the `/api/admin/stats` payload and were being fetched and discarded.
  No new endpoint, no new capability.
- **The subtitle was dropped.** The sidebar entry already reads
  "Overview — System statistics"; an `<h1>Overview</h1>` plus a
  "System statistics and contract status" subtitle stated the same fact three
  times in one viewport.

## Alternatives considered

**Unlock statistics without a wallet.** `/api/admin/stats` is authenticated by
bearer token and admin role — it never needed a wallet, so gating it on
`isOwner` is a client-side choice. Removing that gate would fill the
disconnected screen with real content. Rejected: the read-only notice states
that behaviour deliberately, and changing it is a product decision, not a
layout one.
