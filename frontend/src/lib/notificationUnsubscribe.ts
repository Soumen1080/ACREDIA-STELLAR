import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerRuntimeConfig } from './runtimeConfig';

/**
 * Signed, expiring, single-user unsubscribe tokens (ACREDIA-STELLAR#235).
 *
 * The unsubscribe link is a one-click email link with no session attached, so
 * the endpoint can't rely on `requireAuthenticatedRequest`. Instead the link
 * carries a token that is only valid for the specific `userId` it was issued
 * for and expires after `TOKEN_TTL_MS` — a bare `userId` on its own can no
 * longer mutate anything.
 *
 * Reuses the existing verification-log HMAC secret (see
 * `verificationAudit.ts`) rather than adding a new env var: the `PURPOSE`
 * prefix domain-separates this token from other uses of the same secret.
 */

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PURPOSE = 'notifications-unsubscribe-v1';

function getSecret(): string {
    return getServerRuntimeConfig().verification.hashSecret;
}

function sign(userId: string, expiresAt: number): string {
    return createHmac('sha256', getSecret())
        .update(`${PURPOSE}:${userId}:${expiresAt}`)
        .digest('hex');
}

export function createUnsubscribeToken(userId: string, now: number = Date.now()): string {
    const expiresAt = now + TOKEN_TTL_MS;
    return `${expiresAt}.${sign(userId, expiresAt)}`;
}

/**
 * Verifies that `token` was issued for exactly this `userId` and has not
 * expired. Signature comparison is constant-time to avoid leaking validity
 * via timing.
 */
export function verifyUnsubscribeToken(
    userId: string | null | undefined,
    token: string | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!userId || !token) {
        return false;
    }

    const separatorIndex = token.indexOf('.');
    if (separatorIndex === -1) {
        return false;
    }

    const expiresAtRaw = token.slice(0, separatorIndex);
    const providedSignature = token.slice(separatorIndex + 1);
    const expiresAt = Number(expiresAtRaw);

    if (!Number.isFinite(expiresAt) || expiresAt < now) {
        return false;
    }

    const expectedSignature = sign(userId, expiresAt);
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const providedBuf = Buffer.from(providedSignature, 'hex');

    if (expectedBuf.length === 0 || expectedBuf.length !== providedBuf.length) {
        return false;
    }

    return timingSafeEqual(expectedBuf, providedBuf);
}
