# Acredia — Production & Market Roadmap (Issue Backlog)

**Vision shift:** move Acredia from a hackathon/demo project to a real **verifiable-credential product and infrastructure** for the education market — the trust layer where institutions issue tamper-proof academic credentials, students own them for life, and anyone (employers, other institutions) verifies them in seconds.

**Who benefits**
- **Institutions** (universities, colleges, bootcamps, certification bodies) — issue fraud-proof credentials, cut verification workload.
- **Students / graduates** — lifelong, portable ownership of their achievements.
- **Verifiers** (employers, ATS platforms, other institutions) — instant, free authenticity checks.
- **Admins / operators** — govern which issuers are trusted.

**Scope note:** everything below targets a fully production-ready product running on **Stellar testnet**. Actual **mainnet deployment/interaction is intentionally out of scope** — the system is built so going live is only a config switch later. Contract-audit and mainnet-readiness prep are in scope; the deploy itself is not.

---

## Priority Index

| # | Issue | Area | Priority |
|---|-------|------|----------|
| 1 | Product vision, positioning & pricing model | Strategy/Docs | P0 |
| 2 | Institution onboarding & issuer verification (KYB) | Product/Security | P0 |
| 3 | Encrypt credential documents & PII on IPFS | Storage/Privacy | P0 |
| 4 | Observability: errors, logs, metrics, alerting | Infra | P0 |
| 5 | Privacy & compliance (GDPR): erasure, policy, ToS | Compliance | P0 |
| 6 | Contract security audit + mainnet-readiness checklist | Contracts | P1 |
| 7 | Adopt W3C Verifiable Credentials / Open Badges 3.0 | Standards | P1 |
| 8 | End-to-end integrity check (CID ↔ on-chain hash) | Verify | P1 |
| 9 | IPFS pin redundancy + re-pinning keeper | Storage/Infra | P1 |
| 10 | Distributed rate limiting (Redis) | Infra | P1 |
| 11 | Off-chain event indexer for reads & analytics | Architecture | P1 |
| 12 | Background worker / job queue | Architecture | P1 |
| 13 | Transactional email & notifications provider | Backend | P1 |
| 14 | Database migrations, backups & seed tooling | Infra | P1 |
| 15 | Public verification API + embeddable widget + API keys | Product | P1 |
| 16 | Public issuer trust registry / directory | Product | P2 |
| 17 | Batch credential issuance (contract + UI + CSV import) | Contracts/Product | P2 |
| 18 | On-chain issuer identity/metadata binding | Contracts | P2 |
| 19 | Contract emergency pause / circuit breaker | Contracts/Security | P2 |
| 20 | Institution analytics dashboard | Product | P2 |
| 21 | Student public credential page & standards export | Product | P2 |
| 22 | Accessibility (WCAG 2.1 AA) audit | Frontend | P2 |
| 23 | E2E, contract property & load testing | Quality | P2 |
| 24 | Secrets management & key rotation | Security/Infra | P2 |
| 25 | README overhaul + full product/architecture documentation | Docs | P1 |

---

## 🧭 Strategy & Product

### 1. Product vision, positioning & pricing model
**Labels:** `docs`, `strategy` · **Priority:** P0
**Affected paths:** `docs/product/` (new), `README.md`

**Problem:** The project is framed as a demo, not a product. There is no defined market, ideal customer, value proposition, or monetization path.

**Tasks**
- Write a one-page product vision + positioning statement (problem → solution → why Stellar → why now).
- Define ICP and personas (institution admin, registrar, student, employer/verifier) with jobs-to-be-done.
- Map the value proposition per persona and the top 3 differentiators vs. incumbents (paper/PDF, centralized portals, other blockchain credentialing).
- Draft a pricing/business model (e.g., per-credential issuance fee, institution subscription tiers, free public verification).
- Define success metrics (issuers onboarded, credentials issued, verifications/month).

**Acceptance criteria:** `docs/product/vision.md` exists that a new contributor or stakeholder can read to understand what Acredia is, who it's for, and how it makes money.

---

### 2. Institution onboarding & issuer verification (KYB)
**Labels:** `feature`, `security`, `backend` · **Priority:** P0
**Affected paths:** `frontend/src/app/api/institution/**`, `contracts/src/lib.rs` (authorize_issuer), `frontend/sql/`

**Problem:** Any signed-up "institution" can currently request issuance. In a real product, only **vetted** institutions may issue — otherwise the credentials mean nothing.

**Tasks**
- Add an institution verification workflow: application → document/domain check → admin approval → on-chain issuer authorization.
- Add institution status states (`pending`, `verified`, `suspended`, `rejected`) in the DB; gate issuance UI/API on `verified`.
- Verify institution domain ownership (email-domain match / DNS TXT record) as a lightweight trust signal.
- Call `authorize_issuer` on-chain only after admin approval; record who approved and when (audit trail).
- Surface verification status in the institution dashboard.

**Acceptance criteria:** An unverified institution cannot issue via UI or API; verification state is auditable; on-chain authorization is granted only post-approval.

---

## 🔐 Storage, Privacy & Security

### 3. Encrypt credential documents & PII on IPFS
**Labels:** `security`, `privacy`, `backend` · **Priority:** P0
**Affected paths:** `frontend/src/lib/ipfsServer.ts`, `frontend/src/lib/ipfs.ts`, `frontend/src/app/api/ipfs/**`

**Problem:** Credential documents (diplomas, transcripts) and metadata are pinned to **public** IPFS. Anyone with the CID can read a student's PII — a privacy and compliance risk.

**Tasks**
- Encrypt document + sensitive metadata before pinning (e.g., AES-GCM with a per-credential key).
- Keep the on-chain hash over the canonical (unencrypted) payload so verification still works.
- Define a key-management + access model (who can decrypt: the student and parties they grant access to).
- Add a controlled retrieval endpoint that decrypts only for authorized viewers; keep public verification working on the hash without exposing PII.
- Migrate/annotate existing credentials or document the cutover.

**Acceptance criteria:** A raw IPFS CID no longer exposes student PII; verification still proves authenticity via the on-chain hash; authorized parties can view the document.

---

### 4. Observability: errors, logs, metrics, alerting
**Labels:** `infra`, `observability` · **Priority:** P0
**Affected paths:** `frontend/src/lib/debug.ts`, API routes, deployment config

**Problem:** Structured logging exists (`debug.ts`) but there is no centralized error tracking, metrics, or alerting. Production incidents would be invisible.

**Tasks**
- Integrate error tracking (e.g., Sentry) on client + server; wire `captureException` to it (PII scrubbing already present).
- Ship structured logs to an aggregator; add request IDs across API routes.
- Track key metrics: issuance success/failure, verification counts/results, RPC/IPFS latency & error rates.
- Add uptime monitoring + alerting on API/RPC/IPFS failures and error-rate spikes.
- Create a minimal on-call runbook (`docs/ops/runbook.md`).

**Acceptance criteria:** A thrown server error appears in the tracker within seconds; alerts fire on error spikes; dashboards show issuance/verification volume.

---

### 5. Privacy & compliance (GDPR): erasure, policy, ToS
**Labels:** `compliance`, `security`, `legal` · **Priority:** P0
**Affected paths:** `frontend/sql/`, `frontend/src/app/**`, `docs/legal/` (new)

**Problem:** No privacy policy, terms, or data-subject-rights handling. On-chain data is immutable, which conflicts with "right to erasure" unless designed for.

**Tasks**
- Document the data model: only a **hash** and IPFS pointer go on-chain (no PII on-chain); PII lives in the DB + encrypted IPFS.
- Implement account deletion / erasure: purge DB PII and unpin/rotate IPFS content; keep the immutable on-chain hash (not PII) documented as such.
- Add Privacy Policy, Terms of Service, and a DPA template; link them in the footer.
- Add a data-retention policy for `verification_logs` (already hashed) and other logs.
- Add cookie/analytics consent if analytics are introduced.

**Acceptance criteria:** A user can request deletion and their PII is removed from DB + IPFS; legal pages are published; on-chain immutability is documented and justified.

---

## ⛓️ Smart Contract

### 6. Contract security audit + mainnet-readiness checklist
**Labels:** `contracts`, `security` · **Priority:** P1
**Affected paths:** `contracts/src/lib.rs`, `contracts/README.md`

**Problem:** The contract is well-structured (TTL handling, ownership transfer, events, migration) but has not had an independent audit. Mainnet requires this.

**Tasks**
- Commission/perform a third-party security audit; track findings to closure.
- Add a mainnet-readiness checklist: owner-key custody (multisig/hardware), upgrade governance, TTL/keeper strategy, event coverage, error taxonomy.
- Expand tests: property/fuzz tests for issuance/revocation invariants; explicit owner-only-gating tests on every privileged entrypoint.
- Document the storage/TTL model and archival-keeper expectations in `contracts/README.md`.
- **(Out of scope: the actual mainnet deploy/interaction.)**

**Acceptance criteria:** Audit report + resolved findings are recorded; a documented checklist gates any future mainnet deploy.

---

### 7. Adopt W3C Verifiable Credentials / Open Badges 3.0
**Labels:** `standards`, `contracts`, `backend` · **Priority:** P1
**Affected paths:** `frontend/src/lib/credentialService.ts`, `frontend/src/lib/schemas.ts`, IPFS metadata

**Problem:** Credential metadata is a custom shape. For real-world adoption and interoperability (LinkedIn, HR systems, other wallets), align with an open standard.

**Tasks**
- Model credential metadata as a W3C Verifiable Credential / Open Badges 3.0 JSON-LD document.
- Map issuer, subject, achievement, issuance date, and evidence to standard fields; keep the on-chain hash over the canonical VC.
- Provide a standards-compliant export (download `.json`) from the student dashboard.
- Document the schema and a verification recipe for third parties.

**Acceptance criteria:** An issued credential exports as a valid VC/OBv3 document a standard verifier can validate; on-chain hash matches the canonical form.

---

### 8. End-to-end integrity check (CID ↔ on-chain hash)
**Labels:** `verify`, `backend`, `security` · **Priority:** P1
**Affected paths:** `frontend/src/app/api/verify/[token]/route.ts`, `frontend/src/lib/verification.ts`, `frontend/src/hooks/useCredentialVerification.ts`

**Problem:** Verification proves the credential exists on-chain, but should also prove the **document being viewed** matches the on-chain hash and stored CID.

**Tasks**
- On verify, recompute the hash of the retrieved (canonical) payload and compare to the on-chain `credential_hash`.
- Confirm the IPFS CID referenced on-chain resolves and matches the stored content.
- Surface an explicit integrity result (match / mismatch / unavailable) in the verify UI, distinct from "revoked" and "not found".
- Record integrity result in `verification_logs` (privacy-safe, already hashed).

**Acceptance criteria:** A tampered document or mismatched CID produces a clear "integrity failed" state; a valid one shows "authentic".

---

### 9. IPFS pin redundancy + re-pinning keeper
**Labels:** `storage`, `infra` · **Priority:** P1
**Affected paths:** `frontend/src/lib/ipfsServer.ts`, worker (new)

**Problem:** A single Pinata pin is a single point of failure. If it's lost, credential documents become unretrievable.

**Tasks**
- Pin to at least two independent providers/regions (e.g., Pinata + a second pinning service or a Filecoin deal for permanence).
- Add a keeper job that periodically re-verifies pins are alive and re-pins/repairs missing content.
- Track pin health per credential; alert on failures (ties into #4).
- Document the durability guarantee for institutions.

**Acceptance criteria:** Losing one pinning provider does not make credentials unretrievable; the keeper detects and repairs missing pins.

---

## 🏗️ Backend & Infrastructure

### 10. Distributed rate limiting (Redis)
**Labels:** `infra`, `security` · **Priority:** P1
**Affected paths:** `frontend/src/lib/rateLimit.ts`, API routes

**Problem:** Rate limiting is in-memory, so it resets per instance and doesn't hold across a horizontally scaled deployment.

**Tasks**
- Back rate limiting with a shared store (e.g., Upstash Redis) keyed by IP/user/route.
- Apply consistent limits to verify, IPFS, admin, and auth-adjacent routes.
- Return standard `429` + `Retry-After`; make limits env-configurable.
- Add tests for limit enforcement across simulated instances.

**Acceptance criteria:** Limits hold globally across instances; bursts get `429`; legitimate traffic is unaffected.

---

### 11. Off-chain event indexer for reads & analytics
**Labels:** `architecture`, `backend` · **Priority:** P1
**Affected paths:** `frontend/src/lib/contractReads.ts`, indexer service (new)

**Problem:** Reads and stats hit the Soroban RPC directly, which is slow and fragile at scale, and rich analytics aren't possible.

**Tasks**
- Build an indexer that consumes contract events (`cred_iss`, `cred_rev`, `iss_auth`, `iss_rev`) into a queryable store.
- Serve dashboard/admin reads and verification lookups from the index, with the chain as source of truth.
- Reconcile periodically against the chain to catch missed events.
- Expose aggregate stats (issued, revoked, verifications) efficiently.

**Acceptance criteria:** Dashboards and verification reads no longer depend on live RPC for every request; analytics are fast and consistent with on-chain state.

---

### 12. Background worker / job queue
**Labels:** `architecture`, `backend` · **Priority:** P1
**Affected paths:** worker service (new), API routes

**Problem:** Everything runs inline in Next.js API routes. Long-running/retryable work (indexing, re-pinning, emails, webhooks) needs a queue.

**Tasks**
- Introduce a job queue + worker (e.g., Redis/Postgres-backed) with retries and dead-letter handling.
- Move re-pinning (#9), indexing (#11), and notifications (#13) onto the queue.
- Add idempotency keys so retries are safe.
- Add health checks and metrics for the worker.

**Acceptance criteria:** Async tasks are retried on failure, observable, and don't block API requests.

---

### 13. Transactional email & notifications provider
**Labels:** `backend`, `feature` · **Priority:** P1
**Affected paths:** worker (new), `frontend/src/app/api/**`

**Problem:** No product notifications. Users aren't told when a credential is issued/revoked or verification is requested.

**Tasks**
- Integrate a transactional email provider (e.g., Resend/Postmark) with a verified sending domain.
- Send: "credential issued to you", "credential revoked", "institution verified", plus auth emails (currently via Supabase).
- Add notification preferences and unsubscribe handling.
- Template emails with the Acredia brand.

**Acceptance criteria:** Issuing a credential emails the student; templates are branded; users can opt out of non-essential mail.

---

### 14. Database migrations, backups & seed tooling
**Labels:** `infra`, `backend` · **Priority:** P1
**Affected paths:** `frontend/sql/`, migrations (new)

**Problem:** Schema is applied via raw `.sql` files (`FULL_SETUP.sql`), with no migration history, backups, or seed data.

**Tasks**
- Adopt a migration tool (versioned up/down migrations); convert existing schema/RLS/triggers into ordered migrations.
- Add automated backups + a documented, tested restore procedure.
- Provide seed scripts for local/dev and demo environments.
- Document DB setup in `docs/architecture.md`.

**Acceptance criteria:** Schema changes are versioned and reproducible; backups exist with a tested restore; a fresh env can be seeded in one command.

---

## 🚀 Product Features

### 15. Public verification API + embeddable widget + API keys
**Labels:** `feature`, `backend` · **Priority:** P1
**Affected paths:** `frontend/src/app/api/verify/**`, public API + docs (new)

**Problem:** Verification is only via the web UI. To reach the market, employers/ATS platforms need to verify programmatically.

**Tasks**
- Expose a documented public verification API (verify by token/hash) returning authenticity + integrity + revocation status.
- Add API-key issuance for partners with per-key rate limits (ties into #10).
- Ship an embeddable "Verify with Acredia" widget/button third parties can drop into their site.
- Publish API reference docs and a quickstart.

**Acceptance criteria:** A third party can verify a credential via API with a key and embed a verify widget; docs are published.

---

### 16. Public issuer trust registry / directory
**Labels:** `feature`, `frontend`, `backend` · **Priority:** P2
**Affected paths:** new `/issuers` page, `frontend/src/app/api/**`

**Problem:** Verifiers can't easily tell which institutions are legitimately onboarded.

**Tasks**
- Build a public directory of verified issuers (name, domain, verification date, on-chain issuer address).
- Link each verified credential to its issuer's registry entry.
- Make the registry searchable and cross-checkable against on-chain authorization.

**Acceptance criteria:** A verifier can confirm an issuer is a real, vetted institution from a public page that matches on-chain authorization.

---

### 17. Batch credential issuance (contract + UI + CSV import)
**Labels:** `contracts`, `feature`, `frontend` · **Priority:** P2
**Affected paths:** `contracts/src/lib.rs`, `frontend/src/components/institution/**`

**Problem:** Real institutions issue thousands of credentials per term; one-by-one issuance doesn't scale.

**Tasks**
- Add a batch issuance path (contract entrypoint or batched invocation) to reduce cost/latency for many credentials.
- Add a CSV/spreadsheet import UI with validation, preview, and per-row error reporting.
- Handle partial failures gracefully with a per-row result.
- Add progress + a downloadable issuance report.

**Acceptance criteria:** An institution can upload a CSV and issue a batch, with clear per-row success/failure and a summary report.

---

### 18. On-chain issuer identity/metadata binding
**Labels:** `contracts` · **Priority:** P2
**Affected paths:** `contracts/src/lib.rs`

**Problem:** Authorized issuers are just addresses on-chain; there's no on-chain link to institution identity/name.

**Tasks**
- Store minimal issuer metadata on-chain (name/handle or a content hash pointing to a signed issuer profile).
- Emit issuer-profile events so the indexer (#11) and registry (#16) stay in sync.
- Keep it minimal to control storage/TTL cost.

**Acceptance criteria:** A verifier can resolve an on-chain issuer address to an institution identity trust-minimally.

---

### 19. Contract emergency pause / circuit breaker
**Labels:** `contracts`, `security` · **Priority:** P2
**Affected paths:** `contracts/src/lib.rs`

**Problem:** No way to halt issuance during an incident (compromised issuer, discovered bug).

**Tasks**
- Add an owner-gated `pause`/`unpause` that blocks state-changing entrypoints (issue/revoke) while keeping reads/verification working.
- Emit pause/unpause events.
- Add tests for paused-state behavior.

**Acceptance criteria:** The owner can pause issuance; verification still works while paused; state changes are rejected.

---

### 20. Institution analytics dashboard
**Labels:** `feature`, `frontend` · **Priority:** P2
**Affected paths:** `frontend/src/app/dashboard/**`, indexer (#11)

**Problem:** Institutions have no insight into issuance/verification activity.

**Tasks**
- Add charts: credentials issued over time, active vs revoked, verifications per credential/period.
- Source data from the indexer (#11) for speed.
- Add CSV export of an institution's issued credentials.

**Acceptance criteria:** An institution sees accurate issuance/verification analytics and can export its data.

---

### 21. Student public credential page & standards export
**Labels:** `feature`, `frontend` · **Priority:** P2
**Affected paths:** `frontend/src/app/**`, `frontend/src/components/student/**`

**Problem:** Students can't share a clean public credential link or export in a portable format.

**Tasks**
- Add a public, shareable credential page (student-controlled visibility) with verify CTA and QR.
- Add "Add to LinkedIn"/share and download as VC/OBv3 (#7).
- Respect privacy (#3/#5): the public page reveals only what the student chooses.

**Acceptance criteria:** A student can share a public credential link and export a standards-compliant file; private data stays private.

---

## ✅ Quality & Accessibility

### 22. Accessibility (WCAG 2.1 AA) audit
**Labels:** `frontend`, `a11y` · **Priority:** P2
**Affected paths:** `frontend/src/**`

**Problem:** The redesigned UI needs a formal accessibility pass to be enterprise-ready.

**Tasks**
- Audit against WCAG 2.1 AA: color contrast, focus order, keyboard nav, form labels/aria, motion (reduced-motion already respected).
- Fix issues in nav, dialogs, forms, and the verify flow.
- Add automated a11y checks (axe) to CI.

**Acceptance criteria:** Automated a11y checks pass in CI; a manual keyboard/screen-reader pass of core flows succeeds.

---

### 23. E2E, contract property & load testing
**Labels:** `testing` · **Priority:** P2
**Affected paths:** `frontend/tests/`, `contracts/`, CI

**Problem:** Unit/integration tests exist, but there are no browser E2E, property-based contract, or load tests.

**Tasks**
- Add Playwright E2E for: register → issue → verify → revoke, and admin authorization.
- Add property/fuzz tests for contract invariants (no duplicate hash, only-issuer-revokes, TTL survival).
- Add load tests for verify + IPFS endpoints; capture baseline latencies.
- Wire E2E + a11y (#22) into CI.

**Acceptance criteria:** E2E covers the core flows and runs in CI; contract invariants are property-tested; load baselines are recorded.

---

## 🔑 Security / Infra

### 24. Secrets management & key rotation
**Labels:** `security`, `infra` · **Priority:** P2
**Affected paths:** `frontend/.env.local`, hosting config, `frontend/src/lib/runtimeConfig.ts`

**Problem:** Secrets live in `.env` files; there is no rotation strategy, and testnet/mainnet config isn't cleanly separated.

**Tasks**
- Move server secrets (service-role key, Pinata JWT, hash secret) to the host's secret store; keep only public `NEXT_PUBLIC_*` in the client bundle.
- Document a key-rotation procedure and rotate any keys previously committed/shared.
- Separate `testnet`/`mainnet` config profiles so the network is a single validated switch at boot (already partly enforced in `runtimeConfig.ts`).
- Add a pre-commit/CI secret-scan gate (extend the existing gitleaks setup).

**Acceptance criteria:** No secret is required in the client bundle; rotation is documented; CI blocks committed secrets.

---

## 📚 Documentation

### 25. README overhaul + full product/architecture documentation
**Labels:** `docs` · **Priority:** P1
**Affected paths:** `README.md`, `docs/**`, `contracts/README.md`, `CONTRIBUTING.md`, `SECURITY.md`

**Problem:** The README is well-organized but reads like a demo showcase (heavy on screenshots). It should read like a mature open-source product and fully document architecture, product, and usage. **Keep the existing good structure — refine, don't gut it.**

**Tasks**
- **Remove the "Screenshots" section and embedded screenshot images**; replace visual proof with a concise feature list and (optionally) one architecture diagram. Remove demo-only badges/links that don't apply to a product repo.
- Keep the existing organization (Overview, Why Stellar, Problem, Solution, Features, Smart Contracts, Tech Stack, Testing, Architecture, How It Works, Getting Started, Env Setup, Usage, Project Structure) and tighten each section.
- **Product idea:** add the market-oriented vision from #1 (what it is, why it exists).
- **Who benefits:** document each persona (institution, student, verifier, admin) and how they use it, step by step.
- **Architecture:** add a diagram + prose covering frontend (Next.js), auth (Supabase), contract (Soroban), storage (encrypted IPFS), indexer/worker, and data flow for issue/verify/revoke.
- **Tech stack:** an accurate, current table (Next.js 16, React 19, Tailwind v4, Supabase, Soroban/Rust, Stellar, IPFS/Pinata, Freighter).
- Add/refresh: quickstart (clone → env → run), self-hosting/deployment guide, security-policy pointer (`SECURITY.md`), contributing guide (`CONTRIBUTING.md`), and a link to API docs (#15).
- Move deep docs into `docs/` (`architecture.md`, `product/vision.md`, `api.md`, `ops/runbook.md`) and link them from the README.
- Document all env vars, network config, and the "testnet now / mainnet later" note.

**Acceptance criteria:** The README reads as a professional open-source product front page (no screenshot gallery), and a newcomer can understand the product, who it's for, the architecture, the tech stack, and how to run/contribute — with deeper docs linked under `docs/`.

---

*Backlog reflects the current architecture: Next.js 16 frontend, Supabase (Postgres + Auth + RLS), Soroban `AcrediaCredential` contract, Pinata IPFS, Freighter wallet — all on Stellar testnet. Mainnet deploy is deliberately deferred.*
