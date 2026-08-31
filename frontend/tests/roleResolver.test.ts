import { describe, expect, it } from 'vitest';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { resolveUserRole } from '../src/lib/roleResolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockState = {
    profileRole?: string | null;
    hasInstitutionRow?: boolean;
    hasStudentRow?: boolean;
};

function createMockClient(state: MockState) {
    // Institution affiliation is resolved through `institution_users` since
    // Issue #238, so the stub answers for it as well and every builder method
    // chains.
    const makeBuilder = (table: string) => {
        const resolve = async () => {
            if (table === 'profiles') {
                return {
                    data: state.profileRole ? { role: state.profileRole } : null,
                    error: null,
                };
            }
            if (table === 'institution_users') {
                return {
                    data: state.hasInstitutionRow
                        ? { institution_id: 'inst-1', role: 'owner', status: 'active' }
                        : null,
                    error: null,
                };
            }
            if (table === 'institutions') {
                return {
                    data: state.hasInstitutionRow ? { id: 'inst-1' } : null,
                    error: null,
                };
            }
            if (table === 'students') {
                return {
                    data: state.hasStudentRow ? { id: 'stu-1' } : null,
                    error: null,
                };
            }
            return { data: null, error: null };
        };

        const builder: Record<string, unknown> = {};
        for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
            builder[method] = () => builder;
        }
        builder.maybeSingle = resolve;
        builder.single = resolve;
        return builder;
    };

    return {
        from: (table: string) => makeBuilder(table),
    } as unknown as SupabaseClient;
}

function mockUser(overrides?: Partial<User>): User {
    return {
        id: 'user-1',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2024-01-01T00:00:00Z',
        ...overrides,
    } as User;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveUserRole', () => {
    // ---- Tier 1: profiles.role (DB source of truth) ----

    it('returns "admin" when profiles.role is "admin"', async () => {
        const client = createMockClient({ profileRole: 'admin' });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('admin');
    });

    it('returns "student" when profiles.role is "student"', async () => {
        const client = createMockClient({ profileRole: 'student' });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('student');
    });

    it('returns "institution" when profiles.role is "institution"', async () => {
        const client = createMockClient({ profileRole: 'institution' });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('institution');
    });

    // ---- Tier 2 & 3: table existence checks ----

    it('returns "institution" when no profile exists but an institutions row does', async () => {
        const client = createMockClient({ hasInstitutionRow: true });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('institution');
    });

    it('returns "student" when no profile exists but a students row does', async () => {
        const client = createMockClient({ hasStudentRow: true });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('student');
    });

    // ---- Tier 4: role not provisioned ----

    it('returns "unprovisioned" when no profile, no rows exist, even if metadata is present', async () => {
        const client = createMockClient({});
        const user = mockUser({ user_metadata: { role: 'admin' } });
        await expect(resolveUserRole(client, user)).resolves.toBe('unprovisioned');
    });

    // ---- Priority / precedence ----

    it('prefers profiles.role over metadata (DB wins)', async () => {
        const client = createMockClient({ profileRole: 'student' });
        const user = mockUser({ user_metadata: { role: 'admin' } });
        await expect(resolveUserRole(client, user)).resolves.toBe('student');
    });

    it('prefers profiles.role over institution row (profile takes priority)', async () => {
        const client = createMockClient({ profileRole: 'admin', hasInstitutionRow: true });
        await expect(resolveUserRole(client, mockUser())).resolves.toBe('admin');
    });

    // ---- Null user ----

    it('returns "unknown" for a null user', async () => {
        const client = createMockClient({});
        await expect(resolveUserRole(client, null)).resolves.toBe('unknown');
    });
});
