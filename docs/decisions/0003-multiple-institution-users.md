# 0003 — Allowing Multiple Users Per Institution & Business Continuity

**Status:** Accepted  
**Date:** 2026-08-29  
**Issue:** [#242](https://github.com/soumen0818/ACREDIA-STELLAR/issues/242)

---

## Context

Originally, the database schema linked an institution to exactly one user via `institutions.auth_user_id`.

This 1:1 coupling introduced severe operational and business-continuity risks:
1. **Single Point of Failure (SPOF):** If the primary POC is unavailable, departs the institution, or experiences email delivery issues, all credential issuance and revocation for that university is blocked.
2. **Account Handover Friction:** Transferring management required either account credentials sharing (a severe security anti-pattern) or administrative takeover.
3. **Staff Collaboration:** Real universities have multiple registrars and administrators who need to issue credentials concurrently under the same institution identity and wallet.

---

## Decision

We introduce multi-user institutional tenancy backed by a dedicated mapping table: `public.institution_users`.

### 1. Data Model
```sql
CREATE TABLE IF NOT EXISTS public.institution_users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id  UUID NOT NULL REFERENCES public.institutions (id) ON DELETE CASCADE,
    auth_user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    role            TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'member', 'poc')),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, auth_user_id)
);
```

### 2. Backward Compatibility & Primary POC Retention
- The `institutions.auth_user_id` and `institutions.email` columns are retained as the **Primary POC** representation for backwards compatibility and high-level routing.
- When an institution is created or verified, its primary POC is automatically backfilled into `institution_users` with `role = 'poc'`.
- Authorization checks allow any active user in `institution_users` for that institution to access the dashboard and issue credentials.

### 3. SSO and SAML Alignment
- Using an explicit `institution_users` table directly aligns with enterprise SSO / SAML federation (e.g. Shibboleth, Okta) where incoming SSO assertions map institutional staff members to the appropriate `institution_id` with active tenancy.

---

## Consequences

- **Resilience:** Institutional operations do not halt if a single employee departs or is locked out. A secondary administrator can continue operations or manage staff access.
- **Auditing:** Individual credential issuance events can be attributed to the specific user (`auth.uid()`) who initiated the issuance, while the credential remains linked to the parent institution.
- **Deactivation without Deletion:** When a staff member leaves, their `institution_users.is_active` and `profiles.is_active` are set to `false`, preserving the historical audit log of all credentials they issued.
