-- =====================================================================
-- ACREDIA-STELLAR — ADD institutions.status (IDEMPOTENT)
-- =====================================================================
-- `institutions.status` is declared in the initial schema, but that table is
-- created with CREATE TABLE IF NOT EXISTS. On a database where the table
-- already existed, the IF NOT EXISTS guard skips the statement entirely, so a
-- column added to the definition later never reaches the live table.
--
-- The result was a database whose institutions table had every column except
-- `status`, and any query selecting it failed with
--     42703: column institutions.status does not exist
--
-- Column additions therefore need their own ALTER, which is what this does.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS + a guarded constraint.
-- =====================================================================

BEGIN;

ALTER TABLE public.institutions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Add the CHECK only when absent. On a database created fresh from the initial
-- schema the constraint already exists under this name, and re-adding it would
-- error.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.institutions'::regclass
          AND conname  = 'institutions_status_check'
    ) THEN
        ALTER TABLE public.institutions
            ADD CONSTRAINT institutions_status_check
            CHECK (status IN ('pending', 'verified', 'suspended', 'rejected'));
    END IF;
END
$$;

-- Backfill: rows that were already flagged verified predate the status column,
-- and would otherwise all read as 'pending'.
UPDATE public.institutions
SET    status = 'verified'
WHERE  verified IS TRUE
  AND  status = 'pending';

COMMIT;

-- =====================================================================
-- DONE. Verify:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='institutions';
-- =====================================================================
