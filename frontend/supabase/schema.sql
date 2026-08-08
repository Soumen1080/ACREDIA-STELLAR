-- ============================================================================
-- ACREDIA — Full database schema (generated; do not edit by hand)
--
-- Regenerate with:  npm run db:schema
-- Source of truth:  supabase/migrations/*.sql
--
-- HOW TO USE
--   Supabase dashboard → SQL Editor → paste this whole file → Run.
--
-- SAFE TO RE-RUN. Every statement is idempotent:
--   • CREATE TABLE / INDEX ... IF NOT EXISTS
--   • ADD COLUMN ... IF NOT EXISTS
--   • CREATE OR REPLACE FUNCTION
--   • DROP POLICY / TRIGGER IF EXISTS before each CREATE
-- Existing objects are skipped; missing ones are created. No data is dropped.
--
-- Generated: 2026-08-08T06:58:35Z
-- ============================================================================


-- ============================================================================
-- migration: 20260730000000_initial_schema.sql
-- ============================================================================

-- =====================================================================
-- ACREDIA-STELLAR — FULL DATABASE SETUP (SINGLE FILE, IDEMPOTENT)
-- =====================================================================
-- Run this once on a NEW Supabase project after changing credentials.
-- Safe to re-run: uses IF NOT EXISTS / IF EXISTS / DROP-before-CREATE
-- and DO $$ ... $$ if/else blocks so nothing errors on a second run.
--
-- This consolidates:
--   1. database_schema.sql          (tables, triggers, indexes, base RLS)
--   2. add_credential_hash_metadata (hash/version columns)
--   3. secure_rls_migration.sql     (production RLS policy set + is_admin)
--
-- After running this SQL, update frontend/.env.local with the new
-- NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / service key.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Profiles (role mirror: admin / institution / student)
CREATE TABLE IF NOT EXISTS public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email      TEXT UNIQUE NOT NULL,
    role       TEXT NOT NULL,
    full_name  TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Institutions
CREATE TABLE IF NOT EXISTS public.institutions (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    auth_user_id          UUID REFERENCES auth.users (id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    email                 TEXT UNIQUE NOT NULL,
    wallet_address        TEXT UNIQUE,
    verified              BOOLEAN DEFAULT false,
    status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'suspended', 'rejected')),
    authorization_tx_hash TEXT,
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Students
CREATE TABLE IF NOT EXISTS public.students (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    auth_user_id   UUID REFERENCES auth.users (id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    wallet_address TEXT UNIQUE,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Credentials
CREATE TABLE IF NOT EXISTS public.credentials (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    student_id              UUID REFERENCES public.students (id) ON DELETE CASCADE,
    student_wallet_address  TEXT,
    institution_id          UUID REFERENCES public.institutions (id) ON DELETE CASCADE,
    issuer_wallet_address   TEXT,
    token_id                TEXT UNIQUE NOT NULL,
    ipfs_hash               TEXT NOT NULL,
    blockchain_hash         TEXT NOT NULL,
    metadata                JSONB NOT NULL,
    metadata_schema_version INTEGER NOT NULL DEFAULT 1,
    hash_algorithm          TEXT NOT NULL DEFAULT 'sha256:canonical-json:v1',
    issued_at               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked                 BOOLEAN DEFAULT false,
    revoked_at              TIMESTAMP WITH TIME ZONE
);

-- Verification logs
CREATE TABLE IF NOT EXISTS public.verification_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    credential_id       UUID REFERENCES public.credentials (id) ON DELETE SET NULL,
    verifier_email      TEXT,
    verifier_org        TEXT,
    verification_result JSONB NOT NULL,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys for programmatic verification
CREATE TABLE IF NOT EXISTS public.api_keys (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    institution_id      UUID REFERENCES public.institutions (id) ON DELETE CASCADE,
    key_prefix          TEXT NOT NULL,
    key_hash            TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL,
    revoked             BOOLEAN DEFAULT false,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.verification_logs IS
    'Privacy-safe audit log for public verification attempts. '
    'Stores coarse outcomes and hashed request identifiers only — no PII. '
    'Retention policy: rows are automatically purged after 90 days by '
    'public.purge_old_verification_logs() (scheduled via pg_cron).';

-- ---------------------------------------------------------------------
-- Credentials: ensure hash/version columns exist (for older DBs)
-- IF the columns are missing -> add them; ELSE leave as-is.
-- ---------------------------------------------------------------------
ALTER TABLE public.credentials
    ADD COLUMN IF NOT EXISTS metadata_schema_version INTEGER,
    ADD COLUMN IF NOT EXISTS hash_algorithm TEXT;

-- Stamp legacy rows that predate canonical hashing, then set defaults.
-- v0 means "legacy JSON.stringify(metadata)"; v1 means canonical JSON.
UPDATE public.credentials
SET metadata_schema_version = CASE
    WHEN hash_algorithm = 'sha256:canonical-json:v1' THEN 1
    ELSE 0
END
WHERE metadata_schema_version IS NULL;

UPDATE public.credentials
SET hash_algorithm = CASE
    WHEN metadata_schema_version = 0 THEN 'sha256:json-stringify'
    ELSE 'sha256:canonical-json:v1'
END
WHERE hash_algorithm IS NULL;

ALTER TABLE public.credentials
    ALTER COLUMN metadata_schema_version SET DEFAULT 1,
    ALTER COLUMN hash_algorithm SET DEFAULT 'sha256:canonical-json:v1',
    ALTER COLUMN metadata_schema_version SET NOT NULL,
    ALTER COLUMN hash_algorithm SET NOT NULL;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

-- Mirror new auth users into profiles. Client role metadata is NOT trusted
-- for admin: only 'institution' or 'student' is honored here.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, full_name)
  VALUES (
    new.id,
    new.email,
    CASE
      WHEN new.raw_user_meta_data->>'role' = 'institution' THEN 'institution'
      ELSE 'student'
    END,
    new.raw_user_meta_data->>'name'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Block role escalation unless done by the trusted service_role.
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger AS $$
BEGIN
  IF old.role IS DISTINCT FROM new.role AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Profile roles can only be changed by a trusted server-side admin process';
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create institution row on institution signup.
CREATE OR REPLACE FUNCTION public.handle_new_institution_user()
RETURNS trigger AS $$
BEGIN
  IF new.raw_user_meta_data->>'role' = 'institution' THEN
    INSERT INTO public.institutions (auth_user_id, name, email)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auto-create student row on student signup.
CREATE OR REPLACE FUNCTION public.handle_new_student_user()
RETURNS trigger AS $$
BEGIN
  IF new.raw_user_meta_data->>'role' = 'student' THEN
    INSERT INTO public.students (auth_user_id, name, email)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      new.email
    )
    ON CONFLICT (email) DO NOTHING;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Admin check helper used by RLS policies.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- Triggers (drop-before-create so re-runs are clean)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.prevent_profile_role_escalation();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_institution ON auth.users;
CREATE TRIGGER on_auth_user_created_institution
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_institution_user();

DROP TRIGGER IF EXISTS on_auth_user_created_student ON auth.users;
CREATE TRIGGER on_auth_user_created_student
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_student_user();

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_institutions_auth_user      ON public.institutions (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_institutions_wallet         ON public.institutions (wallet_address);
CREATE INDEX IF NOT EXISTS idx_students_auth_user          ON public.students (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_students_wallet             ON public.students (wallet_address);
CREATE INDEX IF NOT EXISTS idx_credentials_student         ON public.credentials (student_id);
CREATE INDEX IF NOT EXISTS idx_credentials_institution     ON public.credentials (institution_id);
CREATE INDEX IF NOT EXISTS idx_credentials_token           ON public.credentials (token_id);
CREATE INDEX IF NOT EXISTS idx_verification_logs_credential ON public.verification_logs (credential_id);
-- Pagination and filtering indexes (Issue #82)
CREATE INDEX IF NOT EXISTS idx_credentials_institution_issued
  ON public.credentials (institution_id, issued_at DESC, revoked);

CREATE INDEX IF NOT EXISTS idx_credentials_student_issued
  ON public.credentials (student_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_credentials_fts
  ON public.credentials USING gin(
    to_tsvector('english',
      COALESCE((metadata->>'studentName')::text, '') || ' ' ||
      COALESCE((metadata->>'credentialType')::text, '') || ' ' ||
      COALESCE((metadata->>'degree')::text, '') || ' ' ||
      COALESCE(token_id::text, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_credentials_institution_revoked
  ON public.credentials (institution_id, revoked, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_credentials_issued_at
  ON public.credentials (issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_logs_created_at ON public.verification_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_verification_logs_result_type
    ON public.verification_logs ((verification_result->>'result_type'));
CREATE INDEX IF NOT EXISTS idx_api_keys_institution         ON public.api_keys (institution_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash                ON public.api_keys (key_hash);

-- ---------------------------------------------------------------------
-- Enable Row Level Security
-- ---------------------------------------------------------------------
ALTER TABLE IF EXISTS public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.institutions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.students          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credentials       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.verification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_keys          ENABLE ROW LEVEL SECURITY;
-- NOTE: public.jobs, public.indexer_state, and public.credential_pins are
-- NOT created until later in this script (see the "Job queue" / "Indexer
-- State" / "Pin redundancy" sections below), so an ALTER TABLE IF EXISTS
-- here would silently no-op on a brand-new database. Each of those
-- sections enables RLS on itself immediately after its own CREATE TABLE
-- instead — do not add them here.

-- ---------------------------------------------------------------------
-- Drop any legacy / permissive policies before recreating (idempotent)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are viewable by everyone"               ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"                    ON public.profiles;
DROP POLICY IF EXISTS "Profiles can view own profile"                   ON public.profiles;
DROP POLICY IF EXISTS "Profiles can update own profile"                 ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles"                     ON public.profiles;

DROP POLICY IF EXISTS "Institutions can view own data"                  ON public.institutions;
DROP POLICY IF EXISTS "Institutions can update own data"                ON public.institutions;
DROP POLICY IF EXISTS "Anyone can insert institutions"                  ON public.institutions;
DROP POLICY IF EXISTS "Public can count institutions"                   ON public.institutions;
DROP POLICY IF EXISTS "Admin can view all institutions"                 ON public.institutions;
DROP POLICY IF EXISTS "Admin can update institutions"                   ON public.institutions;
DROP POLICY IF EXISTS "Institutions can insert own data"                ON public.institutions;
DROP POLICY IF EXISTS "Authenticated users can read institution names"  ON public.institutions;

DROP POLICY IF EXISTS "Students can view own data"                      ON public.students;
DROP POLICY IF EXISTS "Students can update own data"                    ON public.students;
DROP POLICY IF EXISTS "Anyone can insert students"                      ON public.students;
DROP POLICY IF EXISTS "Public can count students"                       ON public.students;
DROP POLICY IF EXISTS "Admin can view all students"                     ON public.students;
DROP POLICY IF EXISTS "Admin can update students"                       ON public.students;
DROP POLICY IF EXISTS "Students can insert own data"                    ON public.students;

DROP POLICY IF EXISTS "Students can view own credentials"               ON public.credentials;
DROP POLICY IF EXISTS "Institutions can view issued credentials"        ON public.credentials;
DROP POLICY IF EXISTS "Institutions can insert credentials"             ON public.credentials;
DROP POLICY IF EXISTS "Institutions can update own credentials"         ON public.credentials;
DROP POLICY IF EXISTS "Public can view credentials for verification"    ON public.credentials;
DROP POLICY IF EXISTS "Admin can view all credentials"                  ON public.credentials;

DROP POLICY IF EXISTS "Anyone can insert verification logs"             ON public.verification_logs;
DROP POLICY IF EXISTS "Anyone can view verification logs"               ON public.verification_logs;
DROP POLICY IF EXISTS "Admin can view verification logs"                ON public.verification_logs;
DROP POLICY IF EXISTS "Admin can insert verification logs"              ON public.verification_logs;

DROP POLICY IF EXISTS "Institutions can view own api keys"              ON public.api_keys;
DROP POLICY IF EXISTS "Institutions can insert own api keys"            ON public.api_keys;
DROP POLICY IF EXISTS "Institutions can update own api keys"            ON public.api_keys;
DROP POLICY IF EXISTS "Admin can manage all api keys"                   ON public.api_keys;


-- ---------------------------------------------------------------------
-- Profiles policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles can view own profile" ON public.profiles;
CREATE POLICY "Profiles can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles can update own profile" ON public.profiles;
CREATE POLICY "Profiles can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Institutions policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Institutions can view own data" ON public.institutions;
CREATE POLICY "Institutions can view own data"
  ON public.institutions FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Institutions can update own data" ON public.institutions;
CREATE POLICY "Institutions can update own data"
  ON public.institutions FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Institutions can insert own data" ON public.institutions;
CREATE POLICY "Institutions can insert own data"
  ON public.institutions FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Authenticated users can read institution names" ON public.institutions;
CREATE POLICY "Authenticated users can read institution names"
  ON public.institutions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Admin can view all institutions" ON public.institutions;
CREATE POLICY "Admin can view all institutions"
  ON public.institutions FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can update institutions" ON public.institutions;
CREATE POLICY "Admin can update institutions"
  ON public.institutions FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Students policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Students can view own data" ON public.students;
CREATE POLICY "Students can view own data"
  ON public.students FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Students can update own data" ON public.students;
CREATE POLICY "Students can update own data"
  ON public.students FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Students can insert own data" ON public.students;
CREATE POLICY "Students can insert own data"
  ON public.students FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Admin can view all students" ON public.students;
CREATE POLICY "Admin can view all students"
  ON public.students FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can update students" ON public.students;
CREATE POLICY "Admin can update students"
  ON public.students FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Credentials policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Students can view own credentials" ON public.credentials;
CREATE POLICY "Students can view own credentials"
  ON public.credentials FOR SELECT
  USING (
    student_id IN (
      SELECT id FROM public.students WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Institutions can view issued credentials" ON public.credentials;
CREATE POLICY "Institutions can view issued credentials"
  ON public.credentials FOR SELECT
  USING (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Institutions can insert credentials" ON public.credentials;
CREATE POLICY "Institutions can insert credentials"
  ON public.credentials FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid() AND verified = true
    )
  );

DROP POLICY IF EXISTS "Institutions can update own credentials" ON public.credentials;
CREATE POLICY "Institutions can update own credentials"
  ON public.credentials FOR UPDATE
  USING (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid() AND verified = true
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid() AND verified = true
    )
  );

DROP POLICY IF EXISTS "Admin can view all credentials" ON public.credentials;
CREATE POLICY "Admin can view all credentials"
  ON public.credentials FOR SELECT
  USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Verification logs policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin can view verification logs" ON public.verification_logs;
CREATE POLICY "Admin can view verification logs"
  ON public.verification_logs FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert verification logs" ON public.verification_logs;
CREATE POLICY "Admin can insert verification logs"
  ON public.verification_logs FOR INSERT
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- API Keys policies
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Institutions can view own api keys" ON public.api_keys;
CREATE POLICY "Institutions can view own api keys"
  ON public.api_keys FOR SELECT
  USING (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Institutions can insert own api keys" ON public.api_keys;
CREATE POLICY "Institutions can insert own api keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Institutions can update own api keys" ON public.api_keys;
CREATE POLICY "Institutions can update own api keys"
  ON public.api_keys FOR UPDATE
  USING (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT id FROM public.institutions WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin can manage all api keys" ON public.api_keys;
CREATE POLICY "Admin can manage all api keys"
  ON public.api_keys FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Erasure requests table (created by gdpr_erasure.sql; policies here
-- ensure idempotent policy management in this consolidated setup file)
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

DROP POLICY IF EXISTS "Users can view own erasure requests" ON public.erasure_requests;
CREATE POLICY "Users can view own erasure requests"
    ON public.erasure_requests FOR SELECT
    USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Admin can view all erasure requests" ON public.erasure_requests;
CREATE POLICY "Admin can view all erasure requests"
    ON public.erasure_requests FOR SELECT
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Job queue table (created by job_queue.sql; policies here
-- ensure idempotent policy management in this consolidated setup file)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jobs (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             TEXT NOT NULL,
    payload          JSONB NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts         INTEGER NOT NULL DEFAULT 0,
    max_attempts     INTEGER NOT NULL DEFAULT 3,
    run_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    locked_at        TIMESTAMP WITH TIME ZONE,
    locked_by        TEXT,
    error_log        TEXT,
    idempotency_key  TEXT UNIQUE,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.jobs IS
    'Postgres-backed job queue for background asynchronous tasks (re-pinning, indexing, notifications).';

CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at
    ON public.jobs (status, run_at)
    WHERE status = 'pending';

ALTER TABLE IF EXISTS public.jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view jobs" ON public.jobs;
CREATE POLICY "Admin can view jobs"
    ON public.jobs FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage jobs" ON public.jobs;
CREATE POLICY "Admin can manage jobs"
    ON public.jobs FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Function: next_job(p_worker_id text)
-- Picks and locks the next pending job that is ready to run.
-- Uses FOR UPDATE SKIP LOCKED to prevent multiple workers from picking
-- the same job concurrently.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_job(p_worker_id text)
RETURNS SETOF public.jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id uuid;
BEGIN
    SELECT id INTO v_job_id
    FROM public.jobs
    WHERE status = 'pending' AND run_at <= NOW()
    ORDER BY run_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NOT NULL THEN
        UPDATE public.jobs
        SET status = 'processing',
            locked_at = NOW(),
            locked_by = p_worker_id,
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = v_job_id;

        RETURN QUERY SELECT * FROM public.jobs WHERE id = v_job_id;
    END IF;
END;
$$;

-- next_job is NOT accessible to public / authenticated users.
REVOKE ALL ON FUNCTION public.next_job(text) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- Indexer State
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.indexer_state (
    id TEXT PRIMARY KEY DEFAULT 'main',
    last_ledger INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE public.indexer_state IS
    'Tracks the off-chain indexer progress syncing events from the Soroban contract.';

ALTER TABLE IF EXISTS public.indexer_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view indexer state" ON public.indexer_state;
CREATE POLICY "Admin can view indexer state"
    ON public.indexer_state FOR SELECT
    USING (public.is_admin());

DROP POLICY IF EXISTS "Admin can manage indexer state" ON public.indexer_state;
CREATE POLICY "Admin can manage indexer state"
    ON public.indexer_state FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------
-- Pin redundancy table (created by pin_redundancy.sql; definitions here
-- ensure idempotent setup in this consolidated setup file)
-- Issue #164: IPFS pin redundancy + re-pinning keeper
-- ---------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS idx_credential_pins_needs_check
    ON public.credential_pins (last_checked_at NULLS FIRST)
    WHERE status NOT IN ('pinned', 'erased');

CREATE INDEX IF NOT EXISTS idx_credential_pins_stale_pinned
    ON public.credential_pins (last_checked_at)
    WHERE status = 'pinned';

CREATE INDEX IF NOT EXISTS idx_credential_pins_credential
    ON public.credential_pins (credential_id);

ALTER TABLE IF EXISTS public.credential_pins ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Admin can manage credential pins" ON public.credential_pins;
CREATE POLICY "Admin can manage credential pins"
    ON public.credential_pins FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

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

-- =====================================================================
-- DONE. Verify tables exist (optional sanity check):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- =====================================================================


-- ============================================================================
-- migration: 20260730135800_add_notification_preferences.sql
-- ============================================================================

-- Add notification preferences to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email_issued": true, "email_revoked": true, "email_verified": true}'::jsonb;

-- Comment for the new column
COMMENT ON COLUMN public.profiles.notification_preferences IS 'Stores user preferences for transactional emails';


-- ============================================================================
-- migration: 20260801000000_gdpr_erasure.sql
-- ============================================================================

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


-- ============================================================================
-- migration: 20260802000000_contact_messages.sql
-- ============================================================================

-- =====================================================================
-- ACREDIA-STELLAR — CONTACT MESSAGES (IDEMPOTENT)
-- =====================================================================
-- Backs the public /contact form.
--
-- Design notes:
--   • Messages are written ONLY by the server (service_role) after the
--     API route has validated input and applied rate limiting, so there is
--     no public INSERT policy — anonymous users can never write directly.
--   • Nobody except an admin can read messages (they contain the sender's
--     name/email, i.e. personal data).
--   • ip_hash is an HMAC, never a raw IP, so the table stays privacy-safe
--     and consistent with verification_logs.
--
-- Safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS before CREATE.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.contact_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    message      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'read', 'replied', 'spam')),
    ip_hash      TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    handled_at   TIMESTAMP WITH TIME ZONE,

    -- Defence in depth: the API validates these too, but the database
    -- refuses obviously malformed or abusive payloads regardless of caller.
    CONSTRAINT contact_messages_name_len    CHECK (char_length(name) BETWEEN 2 AND 100),
    CONSTRAINT contact_messages_email_len   CHECK (char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT contact_messages_email_shape CHECK (position('@' IN email) > 1),
    CONSTRAINT contact_messages_message_len CHECK (char_length(message) BETWEEN 10 AND 5000)
);

COMMENT ON TABLE public.contact_messages IS
    'Submissions from the public /contact form. Written server-side only '
    '(service_role) after validation + rate limiting; readable by admins only. '
    'ip_hash is an HMAC of the client IP — never a raw address.';

COMMENT ON COLUMN public.contact_messages.ip_hash IS
    'HMAC-SHA256 of the submitting IP, used for abuse investigation without '
    'storing personal network identifiers.';

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
    ON public.contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status
    ON public.contact_messages (status, created_at DESC);

-- Supports the per-IP flood check in the API route.
CREATE INDEX IF NOT EXISTS idx_contact_messages_ip_recent
    ON public.contact_messages (ip_hash, created_at DESC);

ALTER TABLE IF EXISTS public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Read: admins only (messages contain the sender's name + email).
DROP POLICY IF EXISTS "Admin can view contact messages" ON public.contact_messages;
CREATE POLICY "Admin can view contact messages"
    ON public.contact_messages FOR SELECT
    USING (public.is_admin());

-- Manage (update status / delete): admins only.
DROP POLICY IF EXISTS "Admin can manage contact messages" ON public.contact_messages;
CREATE POLICY "Admin can manage contact messages"
    ON public.contact_messages FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- NOTE: deliberately NO insert policy for anon/authenticated. Inserts happen
-- through the service-role client in /api/contact, which bypasses RLS after
-- validating and rate limiting the request.

COMMIT;

-- =====================================================================
-- DONE. Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='contact_messages';
-- =====================================================================

