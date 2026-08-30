import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@/lib/rateLimit';

/* ── Hoisted mocks ──────────────────────────────────────────────────────── */

const { mockGetServiceRoleClient, mockStructuredLog } = vi.hoisted(() => ({
    mockGetServiceRoleClient: vi.fn(),
    mockStructuredLog: vi.fn(),
}));

vi.mock('../src/lib/serverAuth', () => ({
    getServiceRoleClient: mockGetServiceRoleClient,
}));

vi.mock('../src/lib/debug', () => ({
    structuredLog: mockStructuredLog,
    captureException: vi.fn(),
}));

import { createUnsubscribeToken } from '../src/lib/notificationUnsubscribe';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

type MockState = {
    updateCalls: Array<{ userId: string; prefs: Record<string, boolean> }>;
    profiles: Record<string, { notification_preferences: Record<string, boolean> } | undefined>;
};

let state: MockState;

function buildSupabaseMock() {
    return {
        from: vi.fn((table: string) => {
            if (table !== 'profiles') {
                throw new Error(`unexpected table: ${table}`);
            }

            return {
                select: vi.fn(() => ({
                    eq: vi.fn((_col: string, val: string) => ({
                        single: vi.fn(async () => {
                            const profile = state.profiles[val];
                            return { data: profile ?? null, error: profile ? null : { message: 'not found' } };
                        }),
                    })),
                })),
                update: vi.fn((newPrefs: Record<string, boolean>) => ({
                    eq: vi.fn(async (_col: string, val: string) => {
                        state.updateCalls.push({ userId: val, prefs: newPrefs });
                        return { error: null };
                    }),
                })),
            };
        }),
    };
}

let ipCounter = 0;
function unsubscribeRequest(
    method: 'GET' | 'POST',
    params: Record<string, string>,
): NextRequest {
    ipCounter += 1;
    const url = new URL('http://localhost:3000/api/account/notifications/unsubscribe');
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }

    return new NextRequest(url, {
        method,
        headers: { 'x-forwarded-for': `203.0.113.${ipCounter % 250}` },
    });
}

beforeEach(() => {
    process.env.VERIFICATION_LOG_HASH_SECRET = 'test-unsubscribe-secret';
    resetRateLimitStore();
    mockStructuredLog.mockClear();

    state = {
        updateCalls: [],
        profiles: {
            [USER_A]: { notification_preferences: { email_issued: true, email_revoked: true, email_verified: true } },
            [USER_B]: { notification_preferences: { email_issued: true, email_revoked: true, email_verified: true } },
        },
    };

    mockGetServiceRoleClient.mockReturnValue(buildSupabaseMock());
});

describe('GET /api/account/notifications/unsubscribe', () => {
    it('does not mutate anything for a bare userId with no token (the original IDOR)', async () => {
        const { GET } = await import('../src/app/api/account/notifications/unsubscribe/route');

        const response = await GET(unsubscribeRequest('GET', { userId: USER_A }));

        expect(response.status).toBe(307); // NextResponse.redirect default
        expect(state.updateCalls).toHaveLength(0);
    });

    it('does not mutate anything for a forged/garbage token', async () => {
        const { GET } = await import('../src/app/api/account/notifications/unsubscribe/route');

        const response = await GET(
            unsubscribeRequest('GET', { userId: USER_A, token: 'not-a-real-token' }),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('error=true');
        expect(state.updateCalls).toHaveLength(0);
    });

    it('does not mutate anything even with a valid token (state changes on POST only)', async () => {
        const { GET } = await import('../src/app/api/account/notifications/unsubscribe/route');
        const token = createUnsubscribeToken(USER_A);

        const response = await GET(unsubscribeRequest('GET', { userId: USER_A, token }));

        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<form');
        expect(state.updateCalls).toHaveLength(0);
    });
});

describe('POST /api/account/notifications/unsubscribe', () => {
    it('rejects a bare userId with no token and mutates nothing', async () => {
        const { POST } = await import('../src/app/api/account/notifications/unsubscribe/route');

        const response = await POST(unsubscribeRequest('POST', { userId: USER_A }));

        expect(response.status).toBe(401);
        expect(state.updateCalls).toHaveLength(0);
    });

    it("rejects user A's token being replayed against user B's id", async () => {
        const { POST } = await import('../src/app/api/account/notifications/unsubscribe/route');
        const tokenForA = createUnsubscribeToken(USER_A);

        const response = await POST(
            unsubscribeRequest('POST', { userId: USER_B, token: tokenForA }),
        );

        expect(response.status).toBe(401);
        expect(state.updateCalls).toHaveLength(0);
    });

    it('rejects an expired token', async () => {
        const { POST } = await import('../src/app/api/account/notifications/unsubscribe/route');
        const expiredToken = createUnsubscribeToken(USER_A, Date.now() - 31 * 24 * 60 * 60 * 1000);

        const response = await POST(
            unsubscribeRequest('POST', { userId: USER_A, token: expiredToken }),
        );

        expect(response.status).toBe(401);
        expect(state.updateCalls).toHaveLength(0);
    });

    it("updates only the token's own user when the token is valid", async () => {
        const { POST } = await import('../src/app/api/account/notifications/unsubscribe/route');
        const token = createUnsubscribeToken(USER_A);

        const response = await POST(unsubscribeRequest('POST', { userId: USER_A, token }));

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toContain('unsubscribed=true');
        expect(state.updateCalls).toHaveLength(1);
        expect(state.updateCalls[0]).toMatchObject({
            userId: USER_A,
            prefs: {
                notification_preferences: {
                    email_issued: false,
                    email_revoked: false,
                    email_verified: false,
                },
            },
        });
    });
});
