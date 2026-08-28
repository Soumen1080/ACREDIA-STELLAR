import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(...segments: string[]) {
    return readFileSync(join(process.cwd(), ...segments), 'utf8');
}

const retention = read('supabase', 'migrations', '20260805000000_retention_enforcement.sql');
const gdpr = read('supabase', 'migrations', '20260801000000_gdpr_erasure.sql');
const schema = read('supabase', 'schema.sql');
const privacy = read('src', 'app', 'legal', 'privacy', 'page.tsx');
const vercelConfig = JSON.parse(read('vercel.json'));

describe('retention enforcement migration', () => {
    it('records every run so compliance can be demonstrated', () => {
        expect(retention).toContain('CREATE TABLE IF NOT EXISTS public.maintenance_runs');
        expect(retention).toMatch(/rows_deleted\s+INTEGER/);
        expect(retention).toMatch(/duration_ms\s+INTEGER/);
        expect(retention).toMatch(/status\s+TEXT[\s\S]*?'running', 'succeeded', 'failed'/);
    });

    it('exposes one entry point that both schedulers call', () => {
        expect(retention).toContain('CREATE OR REPLACE FUNCTION public.run_retention_purge()');
        expect(retention).toContain('v_logs     := public.purge_old_verification_logs();');
        expect(retention).toContain('v_messages := public.purge_old_contact_messages();');
    });

    it('records a failed run instead of rolling it back', () => {
        // A re-raise inside the handler would discard the failure row — the
        // exact silence this issue is about.
        expect(retention).toContain("SET status      = 'failed'");
        expect(retention).not.toMatch(/error\s+= SQLERRM[\s\S]{0,200}?\bRAISE;/);
    });

    it('schedules itself, guarded so a missing extension cannot fail the migration', () => {
        expect(retention).toContain("cron.schedule(\n            'acredia-retention-purge'");
        expect(retention).toContain("SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'");
        // Re-runnable: an existing job is removed first.
        expect(retention).toContain("PERFORM cron.unschedule('acredia-retention-purge')");
        expect(retention).toContain('EXCEPTION WHEN OTHERS THEN');
    });

    it('locks the purge functions away from public callers', () => {
        expect(retention).toContain(
            'REVOKE ALL ON FUNCTION public.run_retention_purge() FROM PUBLIC',
        );
        expect(retention).toContain(
            'REVOKE ALL ON FUNCTION public.purge_old_contact_messages() FROM PUBLIC',
        );
        expect(retention).toContain(
            'GRANT EXECUTE ON FUNCTION public.run_retention_purge() TO service_role',
        );
    });

    it('is idempotent', () => {
        expect(retention).toContain('CREATE TABLE IF NOT EXISTS');
        expect(retention).toContain('CREATE INDEX IF NOT EXISTS');
        expect(retention).toContain('DROP POLICY IF EXISTS "Admin can view maintenance runs"');
        expect(retention).toContain('CREATE OR REPLACE FUNCTION');
    });

    it('reaches a fresh deployment through the generated schema', () => {
        expect(schema).toContain('CREATE OR REPLACE FUNCTION public.run_retention_purge()');
        expect(schema).toContain('CREATE TABLE IF NOT EXISTS public.maintenance_runs');
        expect(schema).toContain('CREATE OR REPLACE FUNCTION public.retention_status()');
    });
});

describe('retention periods stay consistent', () => {
    // Each period is written in two SQL places — the function that deletes and
    // the function that reports. If they drift, the admin console would show
    // "0 rows past retention" while rows sat there undeleted.
    it('uses 90 days for verification logs in both the purge and the status', () => {
        expect(gdpr).toContain("NOW() - INTERVAL '90 days'");

        const statusFn = retention.slice(
            retention.indexOf('CREATE OR REPLACE FUNCTION public.retention_status()'),
        );
        expect(statusFn).toContain("created_at < NOW() - INTERVAL '90 days'");
        expect(statusFn).toContain("'retentionDays', 90");
    });

    it('uses 24 months from last correspondence for contact messages in both', () => {
        const purgeFn = retention.slice(
            retention.indexOf('CREATE OR REPLACE FUNCTION public.purge_old_contact_messages()'),
            retention.indexOf('CREATE OR REPLACE FUNCTION public.run_retention_purge()'),
        );
        expect(purgeFn).toContain(
            "COALESCE(handled_at, created_at) < NOW() - INTERVAL '24 months'",
        );

        const statusFn = retention.slice(
            retention.indexOf('CREATE OR REPLACE FUNCTION public.retention_status()'),
        );
        expect(statusFn).toContain('COALESCE(handled_at, created_at)');
        expect(statusFn).toContain("INTERVAL '24 months'");
        expect(statusFn).toContain("'retentionMonths', 24");
    });

    it('matches the periods published in the privacy policy', () => {
        // Publishing a period you do not enforce is the failure this issue
        // reported; these two must be changed together or not at all.
        expect(privacy).toContain('90 days');
        expect(privacy).toContain('24 months from the last correspondence');
        expect(privacy).toContain('nightly at 03:00 UTC');
    });

    it('schedules the advertised time', () => {
        const cron = vercelConfig.crons.find(
            (job: { path: string }) => job.path === '/api/cron/retention',
        );
        expect(cron, 'vercel.json must schedule the retention route').toBeTruthy();
        // 03:00 UTC — the time the privacy policy now states.
        expect(cron.schedule).toBe('0 3 * * *');
        expect(retention).toContain("'0 3 * * *'");
    });
});

describe('the manual scheduling gap is closed', () => {
    it('no longer tells operators to paste a cron.schedule snippet by hand', () => {
        // The whole defect: scheduling lived in a commented-out snippet that a
        // human was expected to run, and evidently never did.
        expect(gdpr).not.toMatch(/--\s*SELECT cron\.schedule/);
        expect(gdpr).not.toContain('run once in the Supabase SQL editor');
    });

    it('stops claiming a schedule that does not exist', () => {
        expect(gdpr).not.toContain('(scheduled via pg_cron)');
        expect(retention).toContain('public.run_retention_purge()');
    });
});
