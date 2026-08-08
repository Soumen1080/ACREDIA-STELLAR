-- =====================================================================
-- ACREDIA-STELLAR — FIX next_job() (IDEMPOTENT)
-- =====================================================================
-- Two bugs in the original public.next_job(p_worker_id text):
--
--   1. SIGNATURE MISMATCH — the email worker calls
--        rpc('next_job', { queue_name: 'send_email' })
--      but the function only accepted `p_worker_id`, so PostgREST could not
--      resolve it and every poll failed with
--        "Could not find the function public.next_job(queue_name) in the
--         schema cache"
--      i.e. the email worker could never claim a job.
--
--   2. NO QUEUE FILTERING — it selected ANY pending row from public.jobs,
--      ignoring `name`. Once a second job type exists (pin repair, indexing),
--      the email worker would claim those jobs and fail them as "unknown
--      email type", burning their retry budget.
--
-- This migration replaces it with a queue-aware version. The old single-arg
-- signature is dropped first: adding a parameter would create an overload and
-- an ambiguous-function error at call time.
--
-- Safe to re-run: DROP ... IF EXISTS + CREATE OR REPLACE.
-- =====================================================================

BEGIN;

-- Remove the old single-argument version so no ambiguous overload remains.
DROP FUNCTION IF EXISTS public.next_job(text);

-- Claim the next pending job for a specific queue.
--
-- `queue_name` matches public.jobs.name, so each worker only ever claims its
-- own job type. FOR UPDATE SKIP LOCKED lets several workers poll concurrently
-- without handing the same row to two of them.
CREATE OR REPLACE FUNCTION public.next_job(
    queue_name text,
    worker_id  text DEFAULT NULL
)
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
    WHERE status = 'pending'
      AND run_at <= NOW()
      AND name = queue_name
      AND attempts < max_attempts
    ORDER BY run_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NOT NULL THEN
        UPDATE public.jobs
        SET status     = 'processing',
            locked_at  = NOW(),
            locked_by  = COALESCE(worker_id, 'worker'),
            attempts   = attempts + 1,
            updated_at = NOW()
        WHERE id = v_job_id;

        RETURN QUERY SELECT * FROM public.jobs WHERE id = v_job_id;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.next_job(text, text) IS
    'Atomically claims the next pending job for the given queue (jobs.name). '
    'Uses FOR UPDATE SKIP LOCKED so multiple workers can poll safely. '
    'Callable only by the service role — never by anon/authenticated users.';

-- Workers connect with the service-role key, which bypasses these grants.
-- Public/authenticated callers must never be able to claim jobs.
REVOKE ALL ON FUNCTION public.next_job(text, text) FROM PUBLIC;

COMMIT;

-- =====================================================================
-- DONE. Verify:
--   SELECT routine_name, specific_name
--   FROM information_schema.routines
--   WHERE routine_schema='public' AND routine_name='next_job';
-- =====================================================================
