-- =====================================================================
-- ACREDIA-STELLAR — PIN REDUNDANCY SCHEMA (IDEMPOTENT)
-- Issue #164: IPFS pin redundancy + re-pinning keeper
-- =====================================================================
-- Tracks pin health per credential per provider so a single Pinata outage
-- (or lost pin) never makes a credential's document unretrievable. A
-- trigger automatically registers tracking rows for both providers the
-- moment a credential is issued; the pin-keeper worker
-- (`worker/pinKeeper.ts`) periodically verifies and repairs them.
--
-- Run this once against an existing Supabase project that already has
-- database_schema.sql / FULL_SETUP.sql applied. For a brand-new project,
-- FULL_SETUP.sql already includes this table.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.credential_pins (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credential_id       UUID NOT NULL REFERENCES public.credentials (id) ON DELETE CASCADE,
    cid                 TEXT NOT NULL,
    provider            TEXT NOT NULL CHECK (provider IN ('pinata', 'secondary')),
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'pinned', 'failed', 'not_configured', 'erased')),
    provider_request_id TEXT,
    last_checked_at     TIMESTAMP WITH TIME ZONE,
    last_error          TEXT,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (credential_id, provider)
);

COMMENT ON TABLE public.credential_pins IS
    'Per-credential, per-provider IPFS pin health. A credential is only '
    'safely retrievable while at least one row here is status = pinned. '
    'Maintained by the pin-keeper worker (worker/pinKeeper.ts) — see '
    'docs/ops/pin-redundancy.md for the durability guarantee this backs.';

COMMENT ON COLUMN public.credential_pins.provider IS
    '''pinata'' is the primary provider (also used at issuance time). '
    '''secondary'' is any IPFS Pinning-Services-API-compliant provider '
    '(Filebase, Crust Network, Temporal, a self-hosted ipfs-cluster, etc.) '
    'configured via SECONDARY_PINNING_ENDPOINT / SECONDARY_PINNING_TOKEN.';

COMMENT ON COLUMN public.credential_pins.status IS
    'pending: not yet checked. pinned: verified retrievable from this '
    'provider. failed: checked and/or repair attempted, still missing. '
    'not_configured: the secondary provider has no credentials configured '
    '(not an outage — operator has not enabled redundancy yet). erased: '
    'the owning credential was GDPR-erased (metadata redacted to '
    '{"redacted": true} by process_erasure()) — intentionally unpinned, '
    'never repaired, never alerted on.';

-- The keeper's sweep query selects rows that are not (yet) healthy, plus
-- already-healthy rows that are due for periodic re-verification.
-- 'erased' rows are excluded from both: they are a terminal, intentional
-- state (GDPR erasure) that must never be re-checked or repaired.
CREATE INDEX IF NOT EXISTS idx_credential_pins_needs_check
    ON public.credential_pins (last_checked_at NULLS FIRST)
    WHERE status NOT IN ('pinned', 'erased');

CREATE INDEX IF NOT EXISTS idx_credential_pins_stale_pinned
    ON public.credential_pins (last_checked_at)
    WHERE status = 'pinned';

CREATE INDEX IF NOT EXISTS idx_credential_pins_credential
    ON public.credential_pins (credential_id);

ALTER TABLE IF EXISTS public.credential_pins ENABLE ROW LEVEL SECURITY;

-- Institutions/students can see the pin health of their own credentials
-- (transparency into the durability guarantee), mirroring the existing
-- read-scoping on public.credentials.
DROP POLICY IF EXISTS "Institutions can view own credential pins" ON public.credential_pins;
CREATE POLICY "Institutions can view own credential pins"
    ON public.credential_pins FOR SELECT
    USING (
        credential_id IN (
            SELECT c.id FROM public.credentials c
            JOIN public.institutions i ON i.id = c.institution_id
            WHERE i.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Students can view own credential pins" ON public.credential_pins;
CREATE POLICY "Students can view own credential pins"
    ON public.credential_pins FOR SELECT
    USING (
        credential_id IN (
            SELECT c.id FROM public.credentials c
            JOIN public.students s ON s.id = c.student_id
            WHERE s.auth_user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Admin can view all credential pins" ON public.credential_pins;
CREATE POLICY "Admin can view all credential pins"
    ON public.credential_pins FOR SELECT
    USING (public.is_admin());

-- Only the pin-keeper worker (service_role, bypasses RLS) writes rows.
DROP POLICY IF EXISTS "Admin can manage credential pins" ON public.credential_pins;
CREATE POLICY "Admin can manage credential pins"
    ON public.credential_pins FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Trigger: auto-register tracking rows the moment a credential is issued
-- ---------------------------------------------------------------------
-- Every credential gets a 'pinata' + 'secondary' row from birth, both
-- 'pending', so the keeper's sweep query (WHERE status != 'pinned') picks
-- new credentials up on its very next run without any separate
-- "onboarding" pass or application-code coordination.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_credential_pins()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.credential_pins (credential_id, cid, provider, status)
    VALUES
        (NEW.id, NEW.ipfs_hash, 'pinata', 'pending'),
        (NEW.id, NEW.ipfs_hash, 'secondary', 'pending')
    ON CONFLICT (credential_id, provider) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_register_credential_pins ON public.credentials;
CREATE TRIGGER trg_register_credential_pins
    AFTER INSERT ON public.credentials
    FOR EACH ROW
    EXECUTE FUNCTION public.register_credential_pins();

COMMIT;
