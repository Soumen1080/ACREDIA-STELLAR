import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRateLimitStore } from '@/lib/rateLimit';

const {
    mockRequireInstitutionRequest,
    mockPinFileToPinata,
    mockPinJsonToPinata,
} = vi.hoisted(() => ({
    mockRequireInstitutionRequest: vi.fn(),
    mockPinFileToPinata: vi.fn(),
    mockPinJsonToPinata: vi.fn(),
}));

vi.mock('../src/lib/serverAuth', () => ({
    requireInstitutionRequest: mockRequireInstitutionRequest,
}));

vi.mock('../src/lib/ipfsServer', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/lib/ipfsServer')>();
    return {
        ...actual,
        pinFileToPinata: mockPinFileToPinata,
        pinJsonToPinata: mockPinJsonToPinata,
    };
});

import { POST as postFile } from '../src/app/api/ipfs/file/route';
import { POST as postJson } from '../src/app/api/ipfs/json/route';

const INSTITUTION_AUTH = { ok: true, userId: 'institution-user', institutionId: 'institution-1' };

/** Distinct IPs keep the coarse per-IP limit out of the way of role assertions. */
let ipCounter = 0;
function nextIp(): string {
    ipCounter += 1;
    return `203.0.113.${ipCounter % 250}`;
}

function fileRequest(options: { ip?: string; file?: File } = {}): NextRequest {
    const file =
        options.file ??
        new File([new Uint8Array(64)], 'credential.pdf', { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', file, file.name);

    return new NextRequest('http://localhost:3000/api/ipfs/file', {
        method: 'POST',
        headers: { 'x-forwarded-for': options.ip ?? nextIp() },
        body: formData,
    });
}

function jsonRequest(options: { ip?: string; content?: unknown } = {}): NextRequest {
    return new NextRequest('http://localhost:3000/api/ipfs/json', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': options.ip ?? nextIp(),
        },
        body: JSON.stringify({
            content: 'content' in options ? options.content : { credential: 'metadata' },
        }),
    });
}

describe('IPFS upload routes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetRateLimitStore();
        mockRequireInstitutionRequest.mockResolvedValue(INSTITUTION_AUTH);
        mockPinFileToPinata.mockResolvedValue('file-cid');
        mockPinJsonToPinata.mockResolvedValue('json-cid');
    });

    describe('authorization', () => {
        it('rejects anonymous callers with 401 and never pins', async () => {
            mockRequireInstitutionRequest.mockResolvedValue({
                ok: false,
                status: 401,
                error: 'Missing access token',
            });

            const fileResponse = await postFile(fileRequest());
            const jsonResponse = await postJson(jsonRequest());

            expect(fileResponse.status).toBe(401);
            expect(jsonResponse.status).toBe(401);
            expect(await fileResponse.json()).toEqual({
                success: false,
                error: 'Missing access token',
            });
            expect(await jsonResponse.json()).toEqual({
                success: false,
                error: 'Missing access token',
            });
            expect(mockPinFileToPinata).not.toHaveBeenCalled();
            expect(mockPinJsonToPinata).not.toHaveBeenCalled();
        });

        it('rejects callers with an expired token with 401', async () => {
            mockRequireInstitutionRequest.mockResolvedValue({
                ok: false,
                status: 401,
                error: 'Invalid or expired access token',
            });

            const fileResponse = await postFile(fileRequest());
            const jsonResponse = await postJson(jsonRequest());

            expect(fileResponse.status).toBe(401);
            expect(jsonResponse.status).toBe(401);
            expect(mockPinFileToPinata).not.toHaveBeenCalled();
            expect(mockPinJsonToPinata).not.toHaveBeenCalled();
        });

        it('rejects authenticated non-institution callers with 403 and never pins', async () => {
            mockRequireInstitutionRequest.mockResolvedValue({
                ok: false,
                status: 403,
                error: 'Institution access required',
            });

            const fileResponse = await postFile(fileRequest());
            const jsonResponse = await postJson(jsonRequest());

            expect(fileResponse.status).toBe(403);
            expect(jsonResponse.status).toBe(403);
            expect(await fileResponse.json()).toEqual({
                success: false,
                error: 'Institution access required',
            });
            expect(await jsonResponse.json()).toEqual({
                success: false,
                error: 'Institution access required',
            });
            expect(mockPinFileToPinata).not.toHaveBeenCalled();
            expect(mockPinJsonToPinata).not.toHaveBeenCalled();
        });

        it('authorizes before reading the body, so oversize anonymous uploads are cheap', async () => {
            mockRequireInstitutionRequest.mockResolvedValue({
                ok: false,
                status: 403,
                error: 'Institution access required',
            });

            const oversize = new File([new Uint8Array(1024)], 'huge.txt', { type: 'text/plain' });
            const response = await postFile(fileRequest({ file: oversize }));

            // Rejected on identity, not on the 400-level content validation.
            expect(response.status).toBe(403);
        });

        it('allows institution callers to pin files and JSON', async () => {
            const fileResponse = await postFile(fileRequest());
            const jsonResponse = await postJson(jsonRequest());

            expect(fileResponse.status).toBe(200);
            expect(await fileResponse.json()).toEqual({ success: true, cid: 'file-cid' });
            expect(jsonResponse.status).toBe(200);
            expect(await jsonResponse.json()).toEqual({ success: true, cid: 'json-cid' });
            expect(mockPinFileToPinata).toHaveBeenCalledTimes(1);
            expect(mockPinJsonToPinata).toHaveBeenCalledTimes(1);
        });
    });

    describe('validation still applies to authorized callers', () => {
        it('rejects unsupported file types', async () => {
            const badFile = new File([new Uint8Array(16)], 'notes.txt', { type: 'text/plain' });
            const response = await postFile(fileRequest({ file: badFile }));

            expect(response.status).toBe(400);
            expect((await response.json()).error).toContain('Invalid file type');
            expect(mockPinFileToPinata).not.toHaveBeenCalled();
        });

        it('rejects non-object JSON payloads', async () => {
            const response = await postJson(jsonRequest({ content: 'just-a-string' }));

            expect(response.status).toBe(400);
            expect((await response.json()).error).toContain('must be an object');
            expect(mockPinJsonToPinata).not.toHaveBeenCalled();
        });
    });

    describe('quotas', () => {
        it('caps an institution per account, not per source address', async () => {
            // The per-user quota is 10/minute; every request here uses a fresh IP,
            // so only the account-keyed bucket can stop it.
            for (let i = 0; i < 10; i += 1) {
                const response = await postJson(jsonRequest());
                expect(response.status).toBe(200);
            }

            const blocked = await postJson(jsonRequest());

            expect(blocked.status).toBe(429);
            expect(blocked.headers.get('Retry-After')).toBeTruthy();
            expect(mockPinJsonToPinata).toHaveBeenCalledTimes(10);
        });

        it('does not let one institution consume another institution quota', async () => {
            for (let i = 0; i < 10; i += 1) {
                await postJson(jsonRequest());
            }

            mockRequireInstitutionRequest.mockResolvedValue({
                ok: true,
                userId: 'other-institution-user',
                institutionId: 'institution-2',
            });

            const response = await postJson(jsonRequest());

            expect(response.status).toBe(200);
        });

        it('applies the per-IP limit before authenticating', async () => {
            const ip = '198.51.100.7';
            mockRequireInstitutionRequest.mockResolvedValue({
                ok: false,
                status: 401,
                error: 'Missing access token',
            });

            // The per-IP limit is 20/minute for anonymous traffic from one address.
            for (let i = 0; i < 20; i += 1) {
                const response = await postJson(jsonRequest({ ip }));
                expect(response.status).toBe(401);
            }

            const blocked = await postJson(jsonRequest({ ip }));

            expect(blocked.status).toBe(429);
            // The 21st request never reached the auth check.
            expect(mockRequireInstitutionRequest).toHaveBeenCalledTimes(20);
        });
    });

    describe('filename sanitization (Issue #233)', () => {
        it('strips CRLF, control characters, quotes and path separators', async () => {
            const { sanitizePinataFilename } = await import('../src/lib/ipfsServer');
            expect(sanitizePinataFilename('test\r\nInjected: header.pdf')).toBe('test__Injected: header.pdf');
            expect(sanitizePinataFilename('../../../etc/passwd.png')).toBe('etc_passwd.png');
            expect(sanitizePinataFilename('file"with"quotes.jpg')).toBe('file_with_quotes.jpg');
            expect(sanitizePinataFilename('   ')).toBe('credential_file');
        });
    });
});

