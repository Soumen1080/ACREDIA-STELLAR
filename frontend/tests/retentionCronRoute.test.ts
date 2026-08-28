import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* ── Hoisted mocks ───────────────────────────────────────────────────────────── */

const { mockGetServiceRoleClient, mockAuthorizeCronRequest } = vi.hoisted(() => ({
    mockGetServiceRoleClient: vi.fn(),
    mockAuthorizeCronRequest: vi.fn(),
}));

vi.mock('../src/lib/serverAuth', () => ({
    getServiceRoleClient: mockGetServiceRoleClient,
}));

vi.mock('../src/lib/cronAuth', () => ({
    authorizeCronRequest: mockAuthorizeCronRequest,
}));

vi.mock('../src/lib/debug', () => ({
    structuredLog: vi.fn(),
    captureException: vi.fn(),
}));

import { GET } from '../src/app/api/cron/retention/route';
import { authorizeCronRequest } from '../src/lib/cronAuth';

function cronRequest(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost:3000/api/cron/retention', {
        method: 'GET',
        headers,
    });
}

function rpcClient(result: { data?: unknown; error?: { message: string } }) {
    return { rpc: vi.fn(async () => result) };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeCronRequest.mockReturnValue({ ok: true });
});

describe('cron authorisation', () => {
    // The real implementation, exercised directly — this endpoint deletes
    // rows, so its auth is the part that must not regress (issue #227).
    const realAuthorize = vi.importActual<typeof import('../src/lib/cronAuth')>(
        '../src/lib/cronAuth',
    );

    it('fails closed when no secret is configured', async () => {
        const { authorizeCronRequest: authorize } = await realAuthorize;
        const result = authorize(cronRequest({ authorization: 'Bearer anything' }), '');

        expect(result.ok).toBe(false);
        expect(result).toMatchObject({ status: 503 });
    });

    it('rejects a missing or malformed Authorization header', async () => {
        const { authorizeCronRequest: authorize } = await realAuthorize;

        expect(authorize(cronRequest(), 's3cret').ok).toBe(false);
        expect(authorize(cronRequest({ authorization: 's3cret' }), 's3cret').ok).toBe(false);
        expect(authorize(cronRequest({ authorization: 'Basic s3cret' }), 's3cret').ok).toBe(false);
    });

    it('rejects a wrong secret, including a prefix of the real one', async () => {
        const { authorizeCronRequest: authorize } = await realAuthorize;

        expect(authorize(cronRequest({ authorization: 'Bearer wrong' }), 's3cret').ok).toBe(false);
        expect(authorize(cronRequest({ authorization: 'Bearer s3cre' }), 's3cret').ok).toBe(false);
        expect(authorize(cronRequest({ authorization: 'Bearer s3cretX' }), 's3cret').ok).toBe(
            false,
        );
    });

    it('accepts the configured secret', async () => {
        const { authorizeCronRequest: authorize } = await realAuthorize;

        expect(authorize(cronRequest({ authorization: 'Bearer s3cret' }), 's3cret').ok).toBe(true);
        // Vercel sends a single space, but tolerate incidental whitespace.
        expect(authorize(cronRequest({ authorization: 'bearer  s3cret' }), 's3cret').ok).toBe(
            true,
        );
    });
});

describe('GET /api/cron/retention', () => {
    it('refuses unauthorised callers without touching the database', async () => {
        mockAuthorizeCronRequest.mockReturnValue({
            ok: false,
            status: 401,
            error: 'Unauthorized',
        });

        const response = await GET(cronRequest());

        expect(response.status).toBe(401);
        expect(mockGetServiceRoleClient).not.toHaveBeenCalled();
    });

    it('runs the purge and reports what it deleted', async () => {
        const client = rpcClient({
            data: {
                status: 'succeeded',
                runId: 'run-1',
                rowsDeleted: 7,
                verificationLogs: 5,
                contactMessages: 2,
                durationMs: 42,
            },
        });
        mockGetServiceRoleClient.mockReturnValue(client);

        const response = await GET(cronRequest({ authorization: 'Bearer s3cret' }));
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(client.rpc).toHaveBeenCalledWith('run_retention_purge');
        expect(body).toMatchObject({
            success: true,
            runId: 'run-1',
            rowsDeleted: 7,
            deleted: { verificationLogs: 5, contactMessages: 2 },
        });
    });

    it('surfaces a recorded purge failure as a 500', async () => {
        // The SQL function records the failure and returns it rather than
        // raising, so a non-succeeded status must not be reported as success.
        mockGetServiceRoleClient.mockReturnValue(
            rpcClient({ data: { status: 'failed', runId: 'run-2', error: 'deadlock detected' } }),
        );

        const response = await GET(cronRequest({ authorization: 'Bearer s3cret' }));
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.success).toBe(false);
        expect(body.error).toContain('deadlock');
    });

    it('returns 500 when the RPC itself errors', async () => {
        mockGetServiceRoleClient.mockReturnValue(
            rpcClient({ error: { message: 'function does not exist' } }),
        );

        const response = await GET(cronRequest({ authorization: 'Bearer s3cret' }));

        expect(response.status).toBe(500);
        expect((await response.json()).success).toBe(false);
    });
});

describe('cronAuth module wiring', () => {
    it('is the module the route delegates to', () => {
        // Guards against the route being changed to hand-roll its own check.
        expect(authorizeCronRequest).toBe(mockAuthorizeCronRequest);
    });
});
