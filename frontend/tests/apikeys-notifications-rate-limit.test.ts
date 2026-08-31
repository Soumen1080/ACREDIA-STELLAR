/// <reference types="vitest/globals" />
import { POST as apikeysPOST } from '@/app/api/institution/apikeys/route';
import { POST as notificationsTriggerPOST } from '@/app/api/notifications/trigger/route';
import { resetRateLimitStore } from '@/lib/rateLimit';

// ─── serverAuth mock ──────────────────────────────────────────────────────────

vi.mock('@/lib/serverAuth', () => ({
    requireInstitutionRequest: vi.fn().mockResolvedValue({
        ok: true,
        userId: 'user-inst-test',
        institutionId: 'inst-1',
    }),
    requireAuthenticatedRequest: vi.fn().mockResolvedValue({
        ok: true,
        userId: 'user-inst-test',
        user: { id: 'user-inst-test' },
        accessToken: 'tok',
    }),
    hasServiceRoleEnv: () => true,
    getServiceRoleClient: () => supabaseStub(),
}));

vi.mock('@/lib/apiKey', () => ({
    hashApiKey: vi.fn().mockResolvedValue('hashed'),
}));

// ─── Supabase stub ────────────────────────────────────────────────────────────

function supabaseStub() {
    return {
        from: (table: string) => {
            if (table === 'api_keys') {
                return {
                    insert: () => ({
                        select: () => ({
                            single: async () => ({
                                data: { id: 'key-1', key_prefix: 'sk_acredia_abc...', name: 'test', revoked: false, created_at: new Date().toISOString() },
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === 'institutions') {
                return {
                    select: () => ({
                        eq: () => ({
                            single: async () => ({ data: { id: 'inst-1', name: 'Test Institution' }, error: null }),
                        }),
                    }),
                };
            }
            if (table === 'credentials') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                single: async () => ({
                                    data: {
                                        id: 'cred-1',
                                        students: { id: 'student-1', email: 'student@example.com', auth_user_id: 'student-auth-1' },
                                        metadata: { credentialData: { studentName: 'Alice' } },
                                    },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === 'jobs') {
                return {
                    insert: async () => ({ error: null }),
                };
            }
            throw new Error(`Unexpected table: ${table}`);
        },
    };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeApikeysRequest(ip = '203.0.113.20'): Request {
    return new Request('http://localhost/api/institution/apikeys', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'my key' }),
    });
}

function makeNotificationsRequest(ip = '203.0.113.20'): Request {
    return new Request('http://localhost/api/notifications/trigger', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'issued', tokenId: 'tok-1' }),
    });
}

type RouteHandler = (req: Request) => Promise<Response>;

async function assertRateLimitEnforced(
    handler: RouteHandler,
    requestFactory: () => Request,
    allowedCount: number,
) {
    for (let i = 0; i < allowedCount; i++) {
        const res = await handler(requestFactory());
        expect(res.status, `request ${i + 1} should succeed`).not.toBe(429);
    }

    const blocked = await handler(requestFactory());
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    await expect(blocked.json()).resolves.toEqual({
        success: false,
        error: 'Too many requests',
    });
}

// ─── setup / teardown ─────────────────────────────────────────────────────────

const ENV_OVERRIDES: Record<string, string> = {
    RATE_LIMIT_INSTITUTION_APIKEYS_IP_MAX_REQUESTS: '3',
    RATE_LIMIT_INSTITUTION_APIKEYS_USER_MAX_REQUESTS: '3',
    RATE_LIMIT_NOTIFICATIONS_TRIGGER_IP_MAX_REQUESTS: '3',
    RATE_LIMIT_NOTIFICATIONS_TRIGGER_USER_MAX_REQUESTS: '3',
};

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
    for (const k of Object.keys(ENV_OVERRIDES)) savedEnv[k] = process.env[k];
    Object.assign(process.env, ENV_OVERRIDES);
    resetRateLimitStore();
});

afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
        if (typeof v === 'undefined') delete process.env[k];
        else process.env[k] = v;
    }
});

// ─── institution/apikeys ──────────────────────────────────────────────────────

describe('POST /api/institution/apikeys rate limiting', () => {
    it('returns 429 with Retry-After after the IP limit is exceeded', async () => {
        await assertRateLimitEnforced(
            (req) => apikeysPOST(req as Parameters<typeof apikeysPOST>[0]),
            () => makeApikeysRequest('10.10.10.1'),
            3,
        );
    });

    it('returns 429 with Retry-After after the per-institution limit is exceeded', async () => {
        let ipCounter = 1;
        await assertRateLimitEnforced(
            (req) => apikeysPOST(req as Parameters<typeof apikeysPOST>[0]),
            () => makeApikeysRequest(`10.20.30.${ipCounter++}`),
            3,
        );
    });
});

// ─── notifications/trigger ────────────────────────────────────────────────────

describe('POST /api/notifications/trigger rate limiting', () => {
    it('returns 429 with Retry-After after the IP limit is exceeded', async () => {
        await assertRateLimitEnforced(
            (req) => notificationsTriggerPOST(req as Parameters<typeof notificationsTriggerPOST>[0]),
            () => makeNotificationsRequest('10.10.40.1'),
            3,
        );
    });

    it('returns 429 with Retry-After after the per-user limit is exceeded', async () => {
        let ipCounter = 1;
        await assertRateLimitEnforced(
            (req) => notificationsTriggerPOST(req as Parameters<typeof notificationsTriggerPOST>[0]),
            () => makeNotificationsRequest(`10.20.60.${ipCounter++}`),
            3,
        );
    });
});
