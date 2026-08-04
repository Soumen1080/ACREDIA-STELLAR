#!/usr/bin/env node
/**
 * Pin-keeper worker (issue #164).
 *
 * Standalone entrypoint — NOT part of the Next.js app — meant to be run
 * periodically by an external scheduler (cron, a GitHub Actions scheduled
 * workflow, a systemd timer, Render/Railway cron, etc.):
 *
 *   npm run worker:pin-keeper
 *
 * It repeatedly calls `runPinKeeperSweep` (src/lib/pinKeeper.ts) — each call
 * processes up to one batch of credentials needing a pin-health check or
 * repair — until a full pass finds nothing left to do, then exits. Running
 * it every few minutes keeps the backlog near zero without needing a
 * long-lived daemon process.
 *
 * Required environment variables (same names the Next.js app itself uses —
 * see docs/ops/pin-redundancy.md):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PINATA_JWT
 * Optional (enables the second provider — without it, the keeper still
 * verifies/repairs Pinata alone, and every secondary row records
 * 'not_configured' rather than a false 'failed' alarm):
 *   SECONDARY_PINNING_ENDPOINT, SECONDARY_PINNING_TOKEN, SECONDARY_PINNING_PROVIDER_NAME
 */
import { createClient } from '@supabase/supabase-js';
import { runPinKeeperSweep, type PinSweepSummary } from '../src/lib/pinKeeper';
import { isSecondaryPinningConfigured } from '../src/lib/ipfsServer';

const MAX_PASSES_PER_RUN = 200; // safety cap so a huge, permanently-failing backlog can't loop forever

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function addSummary(total: PinSweepSummary, next: PinSweepSummary): PinSweepSummary {
    return {
        checked: total.checked + next.checked,
        healthy: total.healthy + next.healthy,
        repaired: total.repaired + next.repaired,
        stillFailing: total.stillFailing + next.stillFailing,
        erasedSkipped: total.erasedSkipped + next.erasedSkipped,
        criticalCredentialIds: [...total.criticalCredentialIds, ...next.criticalCredentialIds],
        updates: [], // not needed once summed across passes; keep memory bounded
    };
}

async function main(): Promise<void> {
    const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    requireEnv('PINATA_JWT');

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log(
        `[pin-keeper] starting sweep — secondary provider ${
            isSecondaryPinningConfigured() ? 'configured' : 'NOT configured (Pinata-only, no redundancy yet)'
        }`,
    );

    let total: PinSweepSummary = {
        checked: 0,
        healthy: 0,
        repaired: 0,
        stillFailing: 0,
        erasedSkipped: 0,
        criticalCredentialIds: [],
        updates: [],
    };

    for (let pass = 0; pass < MAX_PASSES_PER_RUN; pass += 1) {
        const summary = await runPinKeeperSweep(supabase);
        total = addSummary(total, summary);

        if (summary.checked === 0) {
            break;
        }

        console.log(
            `[pin-keeper] pass ${pass + 1}: checked=${summary.checked} healthy=${summary.healthy} ` +
                `repaired=${summary.repaired} stillFailing=${summary.stillFailing} erasedSkipped=${summary.erasedSkipped}` +
                (summary.criticalCredentialIds.length > 0
                    ? ` CRITICAL(zero healthy pins)=${summary.criticalCredentialIds.join(',')}`
                    : ''),
        );
    }

    console.log(
        `[pin-keeper] done — checked=${total.checked} healthy=${total.healthy} repaired=${total.repaired} ` +
            `stillFailing=${total.stillFailing} erasedSkipped=${total.erasedSkipped} ` +
            `critical=${total.criticalCredentialIds.length}`,
    );

    if (total.criticalCredentialIds.length > 0) {
        // Non-zero exit so cron/CI surfaces this run as a failure — these
        // credentials have zero healthy pins and are currently unretrievable.
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('[pin-keeper] fatal error:', error);
    process.exitCode = 1;
});
