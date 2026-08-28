import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

type MockDbState = {
    institution: { id: string; name: string; email: string; auth_user_id: string } | null;
    auditLogs: Array<Record<string, unknown>>;
    authUserEmail: string;
    profileRole: string;
};

const state: MockDbState = {
    institution: {
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Cambridge University',
        email: 'poc@cambridge.edu',
        auth_user_id: 'user-cambridge-poc',
    },
    auditLogs: [],
    authUserEmail: 'admin@example.com',
    profileRole: 'admin',
};

vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn((_url: string, key: string) => {
        if (key === 'anon-key') {
            return {
                auth: {
                    getUser: vi.fn(async () => ({
                        data: { user: { id: 'admin-user-id' } },
                        error: null,
                    })),
                },
            };
        }

        return {
            auth: {
                admin: {
                    getUserById: vi.fn(async () => ({
                        data: { user: { email: state.authUserEmail } },
                        error: null,
                    })),
                    generateLink: vi.fn(async ({ type, email }: { type: string; email: string }) => ({
                        data: {
                            properties: {
                                action_link: `https://example.supabase.co/auth/v1/verify?token=single-use-${type}&type=${type}&redirect_to=http://localhost:3000/auth/reset-password`,
                            },
                        },
                        error: null,
                    })),
                },
            },
            from: vi.fn((tableName: string) => ({
                select: vi.fn(() => ({
                    eq: vi.fn((col: string, val: string) => ({
                        maybeSingle: vi.fn(async () => {
                            if (tableName === 'profiles') {
                                if (col === 'id' && val === 'admin-user-id') {
                                    return { data: { role: state.profileRole }, error: null };
                                }
                            }
                            if (tableName === 'institutions') {
                                return { data: state.institution, error: null };
                            }
                            return { data: null, error: null };
                        }),
                    })),
                })),
                insert: vi.fn(async (data: Record<string, unknown>) => {
                    if (tableName === 'admin_audit_logs') {
                        state.auditLogs.push(data);
                    }
                    return { error: null };
                }),
            })),
        };
    }),
}));

describe('POST /api/admin/institutions/[id]/recovery-link', () => {
    beforeEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
        process.env.ADMIN_EMAIL_ALLOWLIST = 'admin@example.com';

        state.institution = {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'Cambridge University',
            email: 'poc@cambridge.edu',
            auth_user_id: 'user-cambridge-poc',
        };
        state.auditLogs = [];
    });

    it('generates a single-use recovery link and creates an audit record', async () => {
        const { POST } = await import(
            '../src/app/api/admin/institutions/[id]/recovery-link/route'
        );

        const request = new NextRequest(
            'http://localhost:3000/api/admin/institutions/22222222-2222-2222-2222-222222222222/recovery-link',
            {
                method: 'POST',
                headers: new Headers({
                    authorization: 'Bearer valid-admin-token',
                    'content-type': 'application/json',
                }),
                body: JSON.stringify({
                    type: 'recovery',
                    reason: 'University firewall blocked reset email',
                }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }),
        });

        const json = await response.json();
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.link).toContain('single-use-recovery');
        expect(json.expiresInHours).toBe(24);

        expect(state.auditLogs.length).toBe(1);
        expect(state.auditLogs[0]).toMatchObject({
            action: 'generate_recovery_link',
            target_institution_id: '22222222-2222-2222-2222-222222222222',
            new_poc_email: 'poc@cambridge.edu',
        });
    });

    it('generates an invite link when requested', async () => {
        const { POST } = await import(
            '../src/app/api/admin/institutions/[id]/recovery-link/route'
        );

        const request = new NextRequest(
            'http://localhost:3000/api/admin/institutions/22222222-2222-2222-2222-222222222222/recovery-link',
            {
                method: 'POST',
                headers: new Headers({
                    authorization: 'Bearer valid-admin-token',
                    'content-type': 'application/json',
                }),
                body: JSON.stringify({
                    type: 'invite',
                    reason: 'Initial POC onboarding fallback link',
                }),
            },
        );

        const response = await POST(request, {
            params: Promise.resolve({ id: '22222222-2222-2222-2222-222222222222' }),
        });

        const json = await response.json();
        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.link).toContain('single-use-invite');
    });
});
