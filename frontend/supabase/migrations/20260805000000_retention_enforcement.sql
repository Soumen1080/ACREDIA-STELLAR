-- =====================================================================
-- ACREDIA-STELLAR — RETENTION ENFORCEMENT (IDEMPOTENT)
-- Issue #227: retention was promised in the privacy policy but never ran
-- =====================================================================
-- Before this migration, `purge_old_verification_logs()` existed but nothing
-- ever called it: the only schedule was a commented-out `cron.schedule(...)`
-- snippet in the header of 20260801000000_gdpr_erasure.sql, to be pasted into
-- the SQL editor by hand. Meanwhile /legal/privacy told users verification
-- logs were purged by an "automatic nightly purge", and contact messages
-- "24 months from last correspondence". Neither was enforced.
--
-- What this file does:
--   1. Adds `maintenance_runs` — an audit trail of every retention run
--      (when, how long, how many rows, success or failure). GDPR Art. 5(2)
--      requires the controller to *demonstrate* compliance, which a silent
--      job cannot do.
--   2. Adds `purge_old_contact_messages()` — enforces the 24-month policy
--      that was already published but had no mechanism at all.
--   3. Adds `run_retention_purge()` — the single entry point. Runs both
--      purges and records the outcome. Called by /api/cron/retention
--      (Vercel Cron) and, where the extension exists, by pg_cron.
--   4. Adds `retention_status()` — what the admin console reads to show row
--      counts, overdue rows, and when the purge last succeeded.
--   5. Schedules the job via pg_cron *if that extension is available*, so a
--      Supabase-only deployment is covered without Vercel.
--
-- Retention periods are defined in exactly two places per table — the purge
-- function and the status function — and `tests/sqlMigrations.test.ts` asserts
-- they still agree, so they cannot silently drift apart.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- Maintenance run log
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_runs (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job           TEXT NOT NULL,
    started_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMP WITH TIME ZONE,
    duration_ms   INTEGER,
    rows_deleted  INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'running'
                      CHECK (status IN ('running', 'succeeded', 'failed')),
    detail        JSONB NOT NULL DEFAULT '{}'::jsonb,
    error         TEXT
);

COMMENT ON TABLE public.maintenance_runs IS
    'Audit trail for scheduled maintenance jobs (currently data retention). '
    'Exists so the retention policy published at /legal/privacy can be '
    'demonstrated rather than merely asserted (GDPR Art. 5(2)).';

CREATE INDEX IF NOT EXISTS idx_maintenance_runs_job_finished
    ON public.maintenance_runs (job, status, finished_at DESC);

ALTER TABLE IF EXISTS public.maintenance_runs ENABLE ROW LEVEL SECURITY;

-- Read: admins only. There is deliberately no INSERT/UPDATE policy — rows are
-- written solely by run_retention_purge() (SECURITY DEFINER) and the
-- service-role client, both of which bypass RLS.
DROP POLICY IF EXISTS "Admin can view maintenance runs" ON public.maintenance_runs;
CREATE POLICY "Admin can view maintenance runs"
    ON public.maintenance_runs FOR SELECT
    USING (public.is_admin());

-- ---------------------------------------------------------------------
-- Function: purge_old_contact_messages()
-- The privacy policy states "24 months from last correspondence", so the
-- clock starts at handled_at when the message has been dealt with and at
-- created_at when it never was.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_contact_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM public.contact_messages
    WHERE COALESCE(handled_at, created_at) < NOW() - INTERVAL '24 months';

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_contact_messages() FROM PUBLIC;

COMMENT ON TABLE public.contact_messages IS
    'Submissions from the public /contact form. Written server-side only '
    '(service_role) after validation + rate limiting; readable by admins only. '
    'ip_hash is an HMAC of the client IP — never a raw address. '
    'Retention policy: deleted 24 months after the last correspondence '
    '(handled_at, falling back to created_at) by '
    'public.purge_old_contact_messages(), run nightly via '
    'public.run_retention_purge().';

-- ---------------------------------------------------------------------
-- Function: run_retention_purge()
-- The single entry point for every scheduler. Records the run either way,
-- so a failure is visible instead of silent.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_retention_purge()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run_id     uuid;
    v_started    timestamptz := clock_timestamp();
    v_logs       integer := 0;
    v_messages   integer := 0;
    v_duration   integer;
BEGIN
    INSERT INTO public.maintenance_runs (job) VALUES ('retention')
    RETURNING id INTO v_run_id;

    -- Nested block so the failure record below survives: an exception handler
    -- rolls back to the start of its own block, and the INSERT above is
    -- outside it.
    BEGIN
        v_logs     := public.purge_old_verification_logs();
        v_messages := public.purge_old_contact_messages();
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.maintenance_runs
        SET status      = 'failed',
            finished_at = NOW(),
            duration_ms = (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer,
            error       = SQLERRM
        WHERE id = v_run_id;

        -- Returned rather than re-raised: re-raising would roll the failure
        -- record back with it, which is precisely the silence this issue is
        -- about. The caller turns a 'failed' status into a non-200 response.
        RETURN jsonb_build_object(
            'status', 'failed',
            'runId',  v_run_id,
            'error',  SQLERRM
        );
    END;

    v_duration := (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::integer;

    UPDATE public.maintenance_runs
    SET status       = 'succeeded',
        finished_at  = NOW(),
        duration_ms  = v_duration,
        rows_deleted = v_logs + v_messages,
        detail       = jsonb_build_object(
                           'verification_logs', v_logs,
                           'contact_messages',  v_messages
                       )
    WHERE id = v_run_id;

    RETURN jsonb_build_object(
        'status',            'succeeded',
        'runId',             v_run_id,
        'rowsDeleted',       v_logs + v_messages,
        'verificationLogs',  v_logs,
        'contactMessages',   v_messages,
        'durationMs',        v_duration
    );
END;
$$;

REVOKE ALL ON FUNCTION public.run_retention_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_retention_purge() TO service_role;

-- ---------------------------------------------------------------------
-- Function: retention_status()
-- Powers the admin console panel and the staleness alert. `overdue` is the
-- number of rows that should already have been deleted — it must be 0 on a
-- healthy deployment, which is the check that proves the policy is honoured.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status jsonb;
BEGIN
    SELECT jsonb_build_object(
        'verificationLogs', jsonb_build_object(
            'total',         (SELECT COUNT(*) FROM public.verification_logs),
            'overdue',       (SELECT COUNT(*) FROM public.verification_logs
                              WHERE created_at < NOW() - INTERVAL '90 days'),
            'oldest',        (SELECT MIN(created_at) FROM public.verification_logs),
            'retentionDays', 90
        ),
        'contactMessages', jsonb_build_object(
            'total',           (SELECT COUNT(*) FROM public.contact_messages),
            'overdue',         (SELECT COUNT(*) FROM public.contact_messages
                                WHERE COALESCE(handled_at, created_at)
                                      < NOW() - INTERVAL '24 months'),
            'oldest',          (SELECT MIN(created_at) FROM public.contact_messages),
            'retentionMonths', 24
        ),
        'lastSuccess', (
            SELECT jsonb_build_object(
                'finishedAt',  finished_at,
                'rowsDeleted', rows_deleted,
                'durationMs',  duration_ms,
                'detail',      detail
            )
            FROM public.maintenance_runs
            WHERE job = 'retention' AND status = 'succeeded'
            ORDER BY finished_at DESC
            LIMIT 1
        ),
        'lastFailure', (
            SELECT jsonb_build_object('finishedAt', finished_at, 'error', error)
            FROM public.maintenance_runs
            WHERE job = 'retention' AND status = 'failed'
            ORDER BY finished_at DESC
            LIMIT 1
        )
    ) INTO v_status;

    RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.retention_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retention_status() TO service_role;

-- ---------------------------------------------------------------------
-- Correct the retention annotation on verification_logs.
-- The previous text claimed the purge was "scheduled via pg_cron"; nothing
-- was scheduled anywhere.
-- ---------------------------------------------------------------------
COMMENT ON TABLE public.verification_logs IS
    'Privacy-safe audit log for public verification attempts. '
    'Stores coarse outcomes and hashed request identifiers only — no PII. '
    'Retention policy: rows older than 90 days are deleted by '
    'public.purge_old_verification_logs(), run nightly through '
    'public.run_retention_purge() — invoked by the /api/cron/retention route '
    '(Vercel Cron) and by pg_cron where that extension is available. '
    'Every run is recorded in public.maintenance_runs.';

-- ---------------------------------------------------------------------
-- Schedule via pg_cron when the extension is present.
--
-- Supabase projects can enable pg_cron; plain Postgres and local dev
-- generally cannot. This block therefore no-ops rather than failing the
-- migration, and the /api/cron/retention route covers deployments where it
-- does nothing. Re-running is safe: an existing job is unscheduled first.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'acredia-retention-purge') THEN
            PERFORM cron.unschedule('acredia-retention-purge');
        END IF;

        PERFORM cron.schedule(
            'acredia-retention-purge',
            '0 3 * * *',
            $cron$ SELECT public.run_retention_purge(); $cron$
        );

        RAISE NOTICE 'Retention purge scheduled with pg_cron (03:00 UTC daily).';
    ELSE
        RAISE NOTICE 'pg_cron not installed; retention runs via the /api/cron/retention route.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Insufficient privileges on a managed instance, for example. The HTTP
    -- scheduler still covers this deployment, so never fail the migration.
    RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$$;

COMMIT;

-- =====================================================================
-- DONE. Verify:
--   SELECT public.retention_status();
--
--   -- Must return 0 on a compliant deployment:
--   SELECT COUNT(*) FROM public.verification_logs
--   WHERE created_at < NOW() - INTERVAL '90 days';
--
--   -- Force a run now (service_role):
--   SELECT public.run_retention_purge();
-- =====================================================================
