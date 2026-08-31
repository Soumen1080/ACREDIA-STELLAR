/// <reference types="vitest/globals" />
import {
    checkRateLimit,
    createInMemoryRateLimitStore,
    createUpstashRateLimitStore,
    resetRateLimitStore,
    setRateLimitStoreForTests,
    type RateLimitBucket,
} from '@/lib/rateLimit';

// ─── helpers ──────────────────────────────────────────────────────────────────

function requestFrom(ip: string, path = '/api/verify/token-123'): Request {
    return new Request(`http://localhost${path}`, {
        headers: { 'x-forwarded-for': ip },
    });
}

/** Build the JSON body Upstash returns for a pipeline of [INCR, EXPIRE NX, TTL]. */
function upstashPipelineResponse(count: number, ttl: number) {
    return JSON.stringify([
        { result: count }, // INCR
        { result: 1 },     // EXPIRE NX
        { result: ttl },   // TTL
    ]);
}

// Env keys touched by tests — saved/restored around every test.
const ENV_KEYS = [
    'RATE_LIMIT_VERIFY_MAX_REQUESTS',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
] as const;

// ─── in-memory: core behaviour ────────────────────────────────────────────────

describe('in-memory store', () => {
    afterEach(() => {
        setRateLimitStoreForTests(createInMemoryRateLimitStore());
        resetRateLimitStore();
        vi.restoreAllMocks();
    });

    it('enforces limits across simulated instances that share a backing store', async () => {
        const backingStore = new Map<string, RateLimitBucket>();
        const instanceA = createInMemoryRateLimitStore(backingStore);
        const instanceB = createInMemoryRateLimitStore(backingStore);

        setRateLimitStoreForTests(instanceA);
        await expect(
            checkRateLimit(requestFrom('203.0.113.50'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: true, remaining: 1 });

        setRateLimitStoreForTests(instanceB);
        await expect(
            checkRateLimit(requestFrom('203.0.113.50'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: true, remaining: 0 });

        // Third request — different instance, shared backing map — must be blocked globally.
        await expect(
            checkRateLimit(requestFrom('203.0.113.50'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: false, remaining: 0 });
    });

    it('isolates limits by IP', async () => {
        setRateLimitStoreForTests(createInMemoryRateLimitStore());

        await checkRateLimit(requestFrom('10.0.0.1'), { prefix: 'verify', windowSeconds: 60, maxRequests: 1 });
        // Different IP must still be allowed
        await expect(
            checkRateLimit(requestFrom('10.0.0.2'), { prefix: 'verify', windowSeconds: 60, maxRequests: 1 }),
        ).resolves.toMatchObject({ success: true });
    });

    it('isolates limits by identifier (per-user quota)', async () => {
        setRateLimitStoreForTests(createInMemoryRateLimitStore());
        const opts = { prefix: 'institution-credentials-user', windowSeconds: 60, maxRequests: 1 };

        await checkRateLimit(requestFrom('1.2.3.4'), { ...opts, identifier: 'user-aaa' });

        // Same IP, different user identifier → must succeed
        await expect(
            checkRateLimit(requestFrom('1.2.3.4'), { ...opts, identifier: 'user-bbb' }),
        ).resolves.toMatchObject({ success: true });

        // Same user again → must be blocked
        await expect(
            checkRateLimit(requestFrom('1.2.3.4'), { ...opts, identifier: 'user-aaa' }),
        ).resolves.toMatchObject({ success: false });
    });

    it('returns a positive integer retryAfter on a blocked result', async () => {
        setRateLimitStoreForTests(createInMemoryRateLimitStore());

        await checkRateLimit(requestFrom('5.5.5.5'), { prefix: 'verify', windowSeconds: 60, maxRequests: 1 });
        const result = await checkRateLimit(requestFrom('5.5.5.5'), {
            prefix: 'verify',
            windowSeconds: 60,
            maxRequests: 1,
        });

        expect(result.success).toBe(false);
        expect(result.retryAfter).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(result.retryAfter)).toBe(true);
    });

    it('cross-instance limits hold for institution-analytics-ip prefix', async () => {
        const backing = new Map<string, RateLimitBucket>();
        const a = createInMemoryRateLimitStore(backing);
        const b = createInMemoryRateLimitStore(backing);
        const opts = { prefix: 'institution-analytics-ip', windowSeconds: 60, maxRequests: 2 };
        const req = requestFrom('192.0.2.1', '/api/institution/analytics');

        setRateLimitStoreForTests(a);
        await expect(checkRateLimit(req, opts)).resolves.toMatchObject({ success: true, remaining: 1 });

        setRateLimitStoreForTests(b);
        await expect(checkRateLimit(req, opts)).resolves.toMatchObject({ success: true, remaining: 0 });
        await expect(checkRateLimit(req, opts)).resolves.toMatchObject({ success: false, remaining: 0 });
    });

    it('cross-instance limits hold for institution-export-user prefix', async () => {
        const backing = new Map<string, RateLimitBucket>();
        const a = createInMemoryRateLimitStore(backing);
        const b = createInMemoryRateLimitStore(backing);
        const opts = { prefix: 'institution-export-user', windowSeconds: 60, maxRequests: 1 };
        const req = requestFrom('192.0.2.2', '/api/institution/export');

        setRateLimitStoreForTests(a);
        await expect(
            checkRateLimit(req, { ...opts, identifier: 'user-xyz' }),
        ).resolves.toMatchObject({ success: true });

        setRateLimitStoreForTests(b);
        await expect(
            checkRateLimit(req, { ...opts, identifier: 'user-xyz' }),
        ).resolves.toMatchObject({ success: false });
    });
});

// ─── env overrides ────────────────────────────────────────────────────────────

describe('env overrides', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
        setRateLimitStoreForTests(createInMemoryRateLimitStore());
        resetRateLimitStore();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (typeof saved[k] === 'undefined') delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    it('respects RATE_LIMIT_<PREFIX>_MAX_REQUESTS override', async () => {
        process.env.RATE_LIMIT_VERIFY_MAX_REQUESTS = '1';

        await expect(
            checkRateLimit(requestFrom('203.0.113.51'), { prefix: 'verify', windowSeconds: 60, maxRequests: 10 }),
        ).resolves.toMatchObject({ success: true });

        await expect(
            checkRateLimit(requestFrom('203.0.113.51'), { prefix: 'verify', windowSeconds: 60, maxRequests: 10 }),
        ).resolves.toMatchObject({ success: false });
    });

    it('ignores a malformed override value and uses the coded default', async () => {
        process.env.RATE_LIMIT_VERIFY_MAX_REQUESTS = 'not-a-number';

        const opts = { prefix: 'verify', windowSeconds: 60, maxRequests: 10 };
        // Coded default is 10; first two requests should both succeed
        await expect(checkRateLimit(requestFrom('203.0.113.52'), opts)).resolves.toMatchObject({ success: true });
        await expect(checkRateLimit(requestFrom('203.0.113.52'), opts)).resolves.toMatchObject({ success: true });
    });
});

// ─── Upstash store ────────────────────────────────────────────────────────────

describe('Upstash store', () => {
    const FAKE_URL = 'https://fake-redis.upstash.io';
    const FAKE_TOKEN = 'fake-token';
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
        process.env.UPSTASH_REDIS_REST_URL = FAKE_URL;
        process.env.UPSTASH_REDIS_REST_TOKEN = FAKE_TOKEN;
        setRateLimitStoreForTests(createInMemoryRateLimitStore());
        resetRateLimitStore();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (typeof saved[k] === 'undefined') delete process.env[k];
            else process.env[k] = saved[k];
        }
        vi.restoreAllMocks();
    });

    it('createUpstashRateLimitStore returns null when env vars are absent', () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        expect(createUpstashRateLimitStore()).toBeNull();
    });

    it('createUpstashRateLimitStore returns a store when env vars are present', () => {
        expect(createUpstashRateLimitStore()).not.toBeNull();
    });

    it('increments via Upstash pipeline and returns correct count + resetAt', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(upstashPipelineResponse(1, 60), { status: 200 }),
        );

        const store = createUpstashRateLimitStore()!;
        const result = await store.increment('verify:1.2.3.4', 60);

        expect(result.count).toBe(1);
        expect(result.resetAt).toBeGreaterThan(Date.now());

        expect(fetchSpy).toHaveBeenCalledOnce();
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${FAKE_URL}/pipeline`);
        expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${FAKE_TOKEN}`);
        const body = JSON.parse(init.body as string) as unknown[][];
        expect(body[0]).toEqual(['INCR', 'verify:1.2.3.4']);
        expect(body[1]).toEqual(['EXPIRE', 'verify:1.2.3.4', 60, 'NX']);
        expect(body[2]).toEqual(['TTL', 'verify:1.2.3.4']);
    });

    it('blocks when Upstash returns a count exceeding maxRequests', async () => {
        // Simulate counter already at 11 with 45 s TTL remaining
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(upstashPipelineResponse(11, 45), { status: 200 }),
        );

        const store = createUpstashRateLimitStore()!;
        setRateLimitStoreForTests(store);

        const result = await checkRateLimit(requestFrom('9.9.9.9'), {
            prefix: 'verify',
            windowSeconds: 60,
            maxRequests: 10,
        });

        expect(result.success).toBe(false);
        expect(result.remaining).toBe(0);
        expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    });

    it('falls back to in-memory when fetch throws a network error', async () => {
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

        const store = createUpstashRateLimitStore()!;
        setRateLimitStoreForTests(store);

        // Must not throw; fallback in-memory allows the first request through
        const result = await checkRateLimit(requestFrom('8.8.8.8'), {
            prefix: 'verify',
            windowSeconds: 60,
            maxRequests: 5,
        });

        expect(result.success).toBe(true);
        expect(result.remaining).toBe(4);
    });

    it('falls back to in-memory when Upstash returns a non-OK HTTP status', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response('Service Unavailable', { status: 503 }),
        );

        const store = createUpstashRateLimitStore()!;
        setRateLimitStoreForTests(store);

        const result = await checkRateLimit(requestFrom('7.7.7.7'), {
            prefix: 'verify',
            windowSeconds: 60,
            maxRequests: 5,
        });

        expect(result.success).toBe(true);
    });

    it('enforces global limit across two store instances backed by Upstash', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(new Response(upstashPipelineResponse(1, 60), { status: 200 }))
            .mockResolvedValueOnce(new Response(upstashPipelineResponse(2, 59), { status: 200 }))
            .mockResolvedValueOnce(new Response(upstashPipelineResponse(3, 58), { status: 200 }));

        const storeA = createUpstashRateLimitStore()!;
        const storeB = createUpstashRateLimitStore()!;

        setRateLimitStoreForTests(storeA);
        await expect(
            checkRateLimit(requestFrom('203.0.113.99'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: true, remaining: 1 });

        setRateLimitStoreForTests(storeB);
        await expect(
            checkRateLimit(requestFrom('203.0.113.99'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: true, remaining: 0 });

        // Counter at 3, limit 2 → blocked globally
        await expect(
            checkRateLimit(requestFrom('203.0.113.99'), { prefix: 'verify', windowSeconds: 60, maxRequests: 2 }),
        ).resolves.toMatchObject({ success: false, remaining: 0 });
    });

    it('Retry-After is a positive integer on a blocked Upstash result', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response(upstashPipelineResponse(99, 30), { status: 200 }),
        );

        const store = createUpstashRateLimitStore()!;
        setRateLimitStoreForTests(store);

        const result = await checkRateLimit(requestFrom('6.6.6.6'), {
            prefix: 'verify',
            windowSeconds: 60,
            maxRequests: 10,
        });

        expect(result.success).toBe(false);
        expect(result.retryAfter).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(result.retryAfter)).toBe(true);
    });
});

// ─── Limiter Mode (Issue #229) ────────────────────────────────────────────────

import { getRateLimiterMode, reinitRateLimitStore } from '@/lib/rateLimit';

describe('Limiter Mode Reporting (Issue #229)', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const k of ENV_KEYS) saved[k] = process.env[k];
        for (const k of ENV_KEYS) delete process.env[k];
        resetRateLimitStore();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        for (const k of ENV_KEYS) {
            if (typeof saved[k] === 'undefined') delete process.env[k];
            else process.env[k] = saved[k];
        }
    });

    it('reports in-memory-unconfigured when UPSTASH vars are missing', () => {
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
        reinitRateLimitStore();
        
        expect(getRateLimiterMode()).toBe('in-memory-unconfigured');
    });

    it('reports distributed after a successful Upstash call', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
        reinitRateLimitStore();
        
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(upstashPipelineResponse(1, 60), { status: 200 }),
        );
        
        await checkRateLimit(requestFrom('1.1.1.1'), { prefix: 'test', windowSeconds: 60, maxRequests: 10 });
        expect(getRateLimiterMode()).toBe('distributed');
    });

    it('reports in-memory-fallback after a failed Upstash call', async () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://fake';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'fake';
        reinitRateLimitStore();
        
        vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));
        
        await checkRateLimit(requestFrom('2.2.2.2'), { prefix: 'test', windowSeconds: 60, maxRequests: 10 });
        expect(getRateLimiterMode()).toBe('in-memory-fallback');
    });
});
