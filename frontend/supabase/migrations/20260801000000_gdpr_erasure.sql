-- =====================================================================
-- ACREDIA-STELLAR — GDPR ERASURE MIGRATION (IDEMPOTENT)
-- Issue #160: Privacy & compliance (GDPR) – erasure, policy, ToS
-- =====================================================================
-- Run AFTER FULL_SETUP.sql on any existing database.
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS.
--
-- What this file does:
--   1. Adds `erasure_requests` table to track data-subject erasure requests.
--   2. Adds `request_erasure()` — callable by authenticated users to submit
--      a deletion request (inserts a pending row).
--   3. Adds `process_erasure(request_id uuid)` — callable ONLY by the
--      service_role; nullifies / redacts PII from students, institutions,
--      profiles, and credentials.metadata, then marks the request completed.
--   4. Adds `purge_old_verification_logs()` — deletes verification_logs rows
--      older than 90 days (schedule via Supabase pg_cron or a CRON route).
--   5. Documents data-retention policy via COMMENT ON statements.
--
-- pg_cron setup (run once in the Supabase SQL editor with pg_cron enabled):
--   SELECT cron.schedule(
--     'purge-verification-logs',
--     '0 3 * * *',
--     $$ SELECT public.purge_old_verification_logs(); $$
--   );
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Retention policy annotations
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.verification_logs IS
    'Privacy-safe audit log for public verification attempts. '
    'Stores coarse outcomes and hashed request identifiers only — no PII. '
    'Retention policy: rows are automatically purged after 90 days by '
    'public.purge_old_verification_logs() (scheduled via pg_cron).';

COMMENT ON COLUMN public.verification_logs.verifier_email IS
    'Optional: verifier-supplied email for audit purposes. '
    'Treated as pseudonymous data; purged after 90 days per retention policy.';

COMMENT ON COLUMN public.verification_logs.verifier_org IS
    'Optional: verifier-supplied organisation name. '
    'Treated as pseudonymous data; purged after 90 days per retention policy.';

COMMENT ON TABLE public.credentials IS
    'Issued academic credentials. The blockchain_hash column contains a '
    'SHA-256 hash that is also anchored on the Stellar blockchain and '
    'cannot be deleted (Art. 17(3)(b) GDPR: immutability required for '
    'public-interest record-keeping). The hash is NOT personal data — it '
    'does not reveal the credential content without the original document. '
    'On erasure: metadata and IPFS content are redacted/unpinned; the '
    'hash pointer row is retained with metadata replaced by {''redacted'':true}.';

COMMENT ON COLUMN public.credentials.ipfs_hash IS
    'IPFS CID of the encrypted credential document pinned to Pinata. '
    'On account erasure the content is unpinned via the Pinata API so it '
    'becomes inaccessible. The CID itself (a hash pointer) is retained in '
    'this column for audit continuity.';

-- ---------------------------------------------------------------------
-- Erasure requests table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erasure_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    requested_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP WITH TIME ZONE,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    failure_reason  TEXT
);

COMMENT ON TABLE public.erasure_requests IS
    'Data-subject right-to-erasure requests (GDPR Art. 17). '
    'A row is inserted when a user submits a deletion request and updated '
    'to completed once the server-side erasure process finishes.';

CREATE INDEX IF NOT EXISTS idx_erasure_requests_user
    ON public.erasure_requests (auth_user_id, status);

ALTER TABLE IF EXISTS public.erasure_requests ENABLE ROW LEVEL SECURITY;

-- Users may only see their own request history.
DROP POLICY IF EXISTS "Users can view own erasure requests" ON public.erasure_requests;
CREATE POLICY "Users can view own erasure requests"
    ON public.erasure_requests FOR SELECT
    USING (auth.uid() = auth_user_id);

-- Insertion is handled through process_erasure() (service_role) and
-- request_erasure() (SECURITY DEFINER), so regular users have no direct INSERT.
DROP POLICY IF EXISTS "Admin can view all erasure requests" ON public.erasure_requests;
CREATE POLICY "Admin can view all erasure requests"
    ON public.erasure_requests FOR SELECT
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Function: request_erasure()
-- Authenticated users call this to submit an erasure request.
-- Returns the new request id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_erasure()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_id      uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Prevent duplicate pending requests.
    IF EXISTS (
        SELECT 1 FROM public.erasure_requests
        WHERE auth_user_id = v_user_id AND status = 'pending'
    ) THEN
        RAISE EXCEPTION 'A pending erasure request already exists for this account';
    END IF;

    INSERT INTO public.erasure_requests (auth_user_id)
    VALUES (v_user_id)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_erasure() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_erasure() TO authenticated;

-- ---------------------------------------------------------------------
-- Function: process_erasure(request_id uuid)
-- Called ONLY by the server-side API route via the service_role client.
-- Redacts PII in students, institutions, profiles, credentials.
-- The auth.users row is deleted by the API route (admin.deleteUser).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_erasure(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
BEGIN
    -- Lock the request row and validate it.
    SELECT auth_user_id INTO v_user_id
    FROM public.erasure_requests
    WHERE id = p_request_id AND status IN ('pending', 'processing')
    FOR UPDATE SKIP LOCKED;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Erasure request % not found or already processed', p_request_id;
    END IF;

    -- Mark as processing.
    UPDATE public.erasure_requests
    SET status = 'processing'
    WHERE id = p_request_id;

    -- Redact student PII.
    UPDATE public.students
    SET
        name  = '[deleted]',
        email = NULL
    WHERE auth_user_id = v_user_id;

    -- Redact institution PII.
    UPDATE public.institutions
    SET
        name  = '[deleted]',
        email = NULL
    WHERE auth_user_id = v_user_id;

    -- Redact profile PII (email + full_name).
    UPDATE public.profiles
    SET
        email     = NULL,
        full_name = NULL
    WHERE id = v_user_id;

    -- Redact credential metadata (JSONB field may contain studentName etc.).
    -- ipfs_hash and blockchain_hash are retained as non-PII pointers.
    UPDATE public.credentials
    SET metadata = '{"redacted": true}'::jsonb
    WHERE student_id IN (
        SELECT id FROM public.students WHERE auth_user_id = v_user_id
    );

    -- Mark complete.
    UPDATE public.erasure_requests
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_request_id;
END;
$$;

-- process_erasure is NOT granted to authenticated users — only callable
-- by the server-side service_role client.
REVOKE ALL ON FUNCTION public.process_erasure(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- Function: purge_old_verification_logs()
-- Deletes verification_log rows older than 90 days (data retention policy).
-- Schedule with pg_cron; see header comment for the cron.schedule call.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_verification_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM public.verification_logs
    WHERE created_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_verification_logs() FROM PUBLIC;

COMMIT;

-- =====================================================================
-- DONE. Verify new objects:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'erasure_requests';
--
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name IN ('request_erasure','process_erasure','purge_old_verification_logs');
-- =====================================================================
