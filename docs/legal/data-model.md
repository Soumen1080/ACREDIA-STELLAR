# Data Model & GDPR Compliance — Acredia

> **Issue #160** — This document satisfies the acceptance criterion:
> *"on-chain immutability is documented and justified."*

---

## Overview

Acredia stores data across three distinct layers with different mutability characteristics.

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER            │  CONTENT                    │  MUTABLE?     │
├───────────────────┼─────────────────────────────┼───────────────┤
│  Supabase DB      │  PII (name, email, metadata) │  YES ✓       │
│  IPFS (Pinata)    │  Encrypted credential docs   │  YES (unpin) │
│  Stellar Blockchain│  SHA-256 hash + CID pointer  │  NO ✗        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1 — Supabase Database (purgeable)

All personally identifiable information lives in Supabase:

| Table | PII columns | On erasure |
|-------|-------------|-----------|
| `profiles` | `email`, `full_name` | Nullified |
| `students` | `name`, `email` | Set to `[deleted]` / NULL |
| `institutions` | `name`, `email` | Set to `[deleted]` / NULL |
| `credentials` | `metadata` (JSONB — contains student name, degree, grade) | Replaced with `{"redacted": true}` |
| `verification_logs` | `verifier_email`, `verifier_org` (optional) | Auto-purged after 90 days |

**Non-PII columns retained after erasure** (not subject to Art. 17):

- `credentials.blockchain_hash` — SHA-256 one-way hash
- `credentials.ipfs_hash` — IPFS CID (content address pointer)
- `credentials.token_id` — on-chain token identifier
- `credentials.issued_at`, `credentials.revoked` — audit timestamps

---

## Layer 2 — IPFS / Pinata (unpin on erasure)

Credential documents (PDFs, images) and metadata JSON objects are encrypted with **AES-256-GCM** before being uploaded to Pinata. Without the encryption key, the content is unreadable.

- On account erasure: the server calls `DELETE /pinning/unpin/{CID}` on Pinata for each CID associated with the user's credentials.
- After unpinning, the content is no longer retrievable from IPFS gateways (assuming no other pinner has the content, which is the case since Acredia is the sole pinner).
- The CID value (a hash pointer) remains in `credentials.ipfs_hash` for audit continuity but the content it references is gone.

---

## Layer 3 — Stellar Blockchain (immutable — not PII)

When a credential is issued, the following is written on-chain:

```
token_id         → unique identifier for this credential NFT
blockchain_hash  → SHA256(canonical-JSON(credential metadata))
issuer_wallet    → Stellar public key of the issuing institution
student_wallet   → Stellar public key of the student
```

### Why the hash is not personal data

Under **GDPR Recital 26**:

> *"The principles of data protection should therefore not apply to anonymous information, namely information which does not relate to an identified or identifiable natural person or to personal data rendered anonymous in such a manner that the data subject is not or no longer identifiable."*

The `blockchain_hash` is a one-way SHA-256 digest of the credential metadata. Without access to the original metadata document (which Acredia deletes on erasure), an observer **cannot reverse the hash** to identify the individual. The hash is therefore pseudonymous / anonymous in the GDPR sense — it is not personal data.

### Why it cannot be erased

Blockchain records are technically immutable. There is no `DELETE` operation on Stellar's ledger. Attempting to comply with Art. 17 by deleting the underlying PII (DB + IPFS) achieves the same practical outcome: the credential hash remains on-chain, but without the metadata it is meaningless.

We rely on the exemption in **GDPR Art. 17(3)(b)**:

> *"The right [to erasure] shall not apply to the extent that processing is necessary: (b) for compliance with a legal obligation which requires processing by Union or Member State law … or for the performance of a task carried out in the public interest …"*

Academic credential verification serves a legitimate public-interest function. The hash anchors the academic record permanently, which is the core value proposition for institutions and employers. The immutability is both technically unavoidable and legally justified.

---

## Data Retention Schedule

| Data | Retention | Basis |
|------|-----------|-------|
| Account profile + credentials | Lifetime of account | Contract |
| IPFS credential documents | Lifetime of account; unpinned on erasure | Contract |
| Verification logs | 90 days (auto-purge via `purge_old_verification_logs()`) | Legitimate interest |
| Erasure request records | 7 years | Legal compliance |
| On-chain hash records | Permanent | Art. 17(3)(b) GDPR |

---

## Erasure Flow (Technical)

```
User clicks "Delete Account"
  │
  ▼
POST /api/account/erase   (bearer token required)
  │
  ├─► INSERT erasure_requests (status = 'processing')
  │
  ├─► For each credentials.ipfs_hash:
  │       DELETE https://api.pinata.cloud/pinning/unpin/{CID}
  │       (best-effort; failures logged, do not abort)
  │
  ├─► CALL process_erasure(request_id)   [service_role]
  │       UPDATE students SET name='[deleted]', email=NULL
  │       UPDATE institutions SET name='[deleted]', email=NULL
  │       UPDATE profiles SET email=NULL, full_name=NULL
  │       UPDATE credentials SET metadata='{"redacted":true}'
  │       UPDATE erasure_requests SET status='completed'
  │
  └─► supabase.auth.admin.deleteUser(userId)
          (cascades → profiles FK → auth.users ON DELETE CASCADE)
  │
  ▼
204 No Content → client signs out → redirect to /
```

---

## References

- [GDPR Art. 17 — Right to erasure](https://gdpr-info.eu/art-17-gdpr/)
- [GDPR Recital 26 — Anonymous data](https://gdpr-info.eu/recitals/no-26/)
- [GDPR Art. 17(3)(b) — Exemption](https://gdpr-info.eu/art-17-gdpr/)
- [Pinata Unpin API](https://docs.pinata.cloud/api-reference/endpoint/unpin-file)
- [Stellar Ledger Immutability](https://developers.stellar.org/docs/learn/fundamentals)
- `frontend/supabase/migrations/20260801000000_gdpr_erasure.sql` — SQL migration
- `frontend/src/app/api/account/erase/route.ts` — API route
- `frontend/src/app/legal/privacy/page.tsx` — Privacy Policy
