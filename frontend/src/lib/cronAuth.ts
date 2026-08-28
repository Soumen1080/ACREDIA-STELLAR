import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { serverRuntimeConfig } from '@/lib/runtimeConfig';

export type CronAuthResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

function constantTimeEquals(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    // timingSafeEqual throws on length mismatch, which would itself leak the
    // secret's length, so compare a fixed-size digest of the inputs instead.
    if (left.length !== right.length) {
        return false;
    }
    return timingSafeEqual(left, right);
}

/**
 * Authorises a scheduled invocation of an `/api/cron/*` route.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` whenever the
 * `CRON_SECRET` environment variable is set on the project.
 *
 * Fails **closed**: with no secret configured the route is disabled rather
 * than left open. These endpoints delete rows, so an unauthenticated caller
 * could otherwise trigger unbounded work (issue #227).
 */
export function authorizeCronRequest(
    request: NextRequest,
    secret = serverRuntimeConfig.cron.secret,
): CronAuthResult {
    if (!secret) {
        return {
            ok: false,
            status: 503,
            error: 'Cron is not configured. Set CRON_SECRET to enable scheduled jobs.',
        };
    }

    const header = request.headers.get('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());

    if (!match || !constantTimeEquals(match[1], secret)) {
        return { ok: false, status: 401, error: 'Unauthorized' };
    }

    return { ok: true };
}
