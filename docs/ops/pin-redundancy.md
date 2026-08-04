# IPFS Pin Redundancy & the Pin-Keeper — Durability Guide

> **Audience:** Institutions who want to know how durable an issued
> credential's document actually is, and developers/operators running or
> extending the pin-keeper.

---

## 1. The problem this solves

A credential's on-chain record (`AcrediaCredential.get_credential`) stores a
SHA-256 hash and an `ipfs://<cid>` URI — never the document itself. The
document lives on IPFS, pinned by a provider (Pinata) so it doesn't get
garbage-collected off the network. **A single pin at a single provider is a
single point of failure**: if that one pin is lost (account issue, provider
outage, accidental unpin), the on-chain hash and token still exist, but the
actual diploma/transcript/certificate becomes unretrievable — `verify_credential`
still succeeds, but there is no document for `GET /api/verify/{token}` or a
"Download VC (.json)" button (see `docs/verifiable-credentials.md`) to
actually fetch.

This is solved with two independent mechanisms:

1. **Redundant pinning** — every credential's content is tracked across
   **two independent providers** (Pinata + any second provider implementing
   the [IPFS Pinning Services API](https://ipfs.github.io/pinning-services-api-spec/)).
2. **A keeper worker** that periodically re-verifies both pins are actually
   alive and repairs (re-pins) whichever one is missing.

## 2. How it works

```
issue_credential ──▶ INSERT credentials row
                         │
                         ▼ (AFTER INSERT trigger, automatic)
                    register_credential_pins()
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
   credential_pins(pinata)   credential_pins(secondary)
        status='pending'         status='pending'
              │                     │
              └──────────┬──────────┘
                         ▼
         worker/pinKeeper.ts (cron, every few minutes)
         runPinKeeperSweep() — src/lib/pinKeeper.ts
              │
              ├─ checks each provider's current pin status
              ├─ repairs (re-pins) whichever is missing, using the
              │  exact bytes still held in credentials.metadata —
              │  repair never depends on any pinning provider, only
              │  on our own Postgres row surviving
              └─ records the result back onto credential_pins
```

Every credential gets a `credential_pins` row for **both** providers the
moment it's issued (a database trigger, not application code — see
`sql/pin_redundancy.sql` — so there is no "onboarding" gap and no way for a
credential to slip through untracked). The keeper's next scheduled sweep
picks up both rows within one cycle.

### Why repair always works from our own database, not from the other provider

The pin-keeper's repair step for a missing Pinata pin is: re-upload the
exact JSON still stored in `credentials.metadata` to Pinata. Because IPFS
CIDs are content-addressed, re-uploading byte-identical content reproduces
the identical CID — so this is safe and always available as long as the
Postgres row survives, **independent of whether any pinning provider still
has the content**. The keeper never needs to "recover" bytes from a
pinning service (the Pinning Services API is a control-plane API for
pinning by CID, not a data-retrieval API), which is why Postgres itself is
effectively a third, always-available copy of every credential's content.

The secondary provider's repair step is a *pin-by-CID* request (it fetches
the content itself from the public IPFS network). If Pinata was also
missing the content in the same sweep, the keeper repairs Pinata **first**,
then asks the secondary provider to pin — so the content is always
discoverable by the time that request goes out.

## 3. Durability guarantee for institutions

**When a second provider is configured** (see §4), losing any *one* of the
two providers does not make a credential's document unretrievable: the
other provider still serves it, and the next keeper sweep repairs the lost
one automatically — typically within one sweep interval (recommended:
every 5–15 minutes).

**Honest limitations — read before relying on this:**

- **Without a second provider configured**, there is no real redundancy
  yet — every `credential_pins` row for the `secondary` provider reports
  `not_configured`, and the keeper only verifies/repairs Pinata. This is
  visible, not silent: check `is_secondary_pinning_configured` via
  `docs/ops/pin-redundancy.md` §4 or ask your Acredia operator.
- **This is active-pinning redundancy, not permanent archival.** Both
  providers can, in principle, still be lost simultaneously (e.g. neither
  gets paid). For credentials that must survive independent of any ongoing
  pinning subscription, additionally commission a **Filecoin storage deal**
  (e.g. via a service like web3.storage/Storacha) for the same CID — this
  is a one-time, provider-independent commitment, complementary to (not a
  replacement for) the two active pins described here. This is not
  automated by this system; it's a recommended additional step for
  institutions with long-term legal retention requirements.
- **GDPR erasure is intentional data loss, not a bug.** When a student
  exercises their right to erasure, their credentials' documents are
  deliberately unpinned and `credentials.metadata` is redacted (see §6).
  The keeper recognizes this (`status = 'erased'`) and will never
  "repair" it back.
- The guarantee covers the **document** (the VC/OBv3 JSON and any attached
  evidence file). The **on-chain hash and token** are immutable by design
  regardless of pin health — see `contracts/README.md`.

## 4. Configuration

| Variable | Required | Purpose |
|---|---|---|
| `PINATA_JWT` | Yes | Primary provider (already required for issuance). |
| `SECONDARY_PINNING_ENDPOINT` | For redundancy | Base URL of a provider implementing the IPFS Pinning Services API, e.g. Filebase, Crust Network, Temporal, or a self-hosted `ipfs-cluster`. No trailing slash. |
| `SECONDARY_PINNING_TOKEN` | For redundancy | Bearer token for that provider. |
| `SECONDARY_PINNING_PROVIDER_NAME` | No | Display/log label only (default `"secondary"`). |

Any provider conforming to the spec works without code changes — this is
deliberately not locked to one vendor. Pick one from a different
organization/infrastructure than Pinata, so the two pins are actually
independent (different account, different underlying storage/region).

## 5. Running the keeper

```bash
npm run worker:pin-keeper
```

This is a standalone script (`worker/pinKeeper.ts`) — not part of the
Next.js app — meant to be invoked periodically by whatever scheduler your
deployment already has. It repeatedly sweeps in batches until nothing is
left to do, then exits, so it's safe to run on a short interval. A
non-zero exit code means at least one credential currently has **zero**
healthy pins (see §7 — treat this as a page-worthy alert).

Example: GitHub Actions scheduled workflow (`.github/workflows/pin-keeper.yml`):

```yaml
on:
  schedule:
    - cron: '*/10 * * * *'
jobs:
  pin-keeper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
        working-directory: frontend
      - run: npm run worker:pin-keeper
        working-directory: frontend
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          PINATA_JWT: ${{ secrets.PINATA_JWT }}
          SECONDARY_PINNING_ENDPOINT: ${{ secrets.SECONDARY_PINNING_ENDPOINT }}
          SECONDARY_PINNING_TOKEN: ${{ secrets.SECONDARY_PINNING_TOKEN }}
```

Equally, a `systemd` timer, Render/Railway cron job, or any other
scheduler that can run `npm run worker:pin-keeper` with these environment
variables works the same way.

## 6. Pin health states (`credential_pins.status`)

| Status | Meaning |
|---|---|
| `pending` | Not yet checked, or in progress (secondary provider still queued/pinning). |
| `pinned` | Verified retrievable from this provider right now. |
| `failed` | Checked and/or a repair attempt was made; still missing. |
| `not_configured` | The secondary provider has no credentials configured — not an outage, just not enabled yet. |
| `erased` | The owning credential was GDPR-erased; intentionally unpinned, never repaired, never alerted on. |

Institutions and students can see the pin health of their own credentials
directly (`credential_pins` has read-scoped RLS policies mirroring
`credentials`), for transparency into this guarantee.

## 7. Alerting on failures

Every sweep records `recordMetric('pin_keeper.sweep', ...)` with
`healthy`/`repaired`/`stillFailing`/`critical` counts, and calls
`captureException` (both in `src/lib/debug.ts` — see that module for how
these forward to your observability pipeline) whenever any credential ends
a sweep with **zero** healthy providers — this is the signal to wire into
paging/alerting (see the project's alerting/notifications work, e.g.
issue #4). The worker script itself also exits non-zero in that case, so a
naive "did the cron job succeed" check is enough to catch it even before
richer alerting is wired up.

## 8. GDPR erasure interaction

`process_erasure()` (`sql/gdpr_erasure.sql`) unpins a user's credential
documents from Pinata and redacts `credentials.metadata` to
`{"redacted": true}`. The keeper checks for this sentinel before doing
anything else for a candidate row and, if present, marks it `erased` and
stops — it will never re-pin, never report it as a failure, and never
alert on it. If you extend the keeper, preserve this check
(`isRedactedMetadata` in `src/lib/pinKeeper.ts`) — treating an erasure as a
"missing pin to repair" would undo a legally-mandated deletion.
