import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient, requireAdminRequest } from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { structuredLog, captureException } from '@/lib/debug';

export const dynamic = 'force-dynamic';

const ADMIN_INSTITUTIONS_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 60,
    prefix: 'admin-institutions',
} as const;

export interface AdminInstitution {
    id: string;
    name: string;
    email: string;
    walletAddress: string | null;
    verified: boolean;
    status: string;
    authorizationTxHash: string | null;
    createdAt: string | null;
    credentialCount: number;
    activeCredentialCount: number;
}

/**
 * Lists every registered institution for the admin console.
 *
 * Credential totals are aggregated in one pass over the credentials index
 * rather than one query per institution, so the response cost stays flat as the
 * number of institutions grows.
 */
export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || 'unknown';

    try {
        const rateLimitResponse = await enforceRateLimit(request, ADMIN_INSTITUTIONS_RATE_LIMIT);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const adminCheck = await requireAdminRequest(request);
        if (!adminCheck.ok) {
            return NextResponse.json(
                { success: false, error: adminCheck.error },
                { status: adminCheck.status },
            );
        }

        const supabase = getServiceRoleClient();

        const { data: institutions, error: institutionsError } = await supabase
            .from('institutions')
            .select(
                'id, name, email, wallet_address, verified, status, authorization_tx_hash, created_at',
            )
            .order('created_at', { ascending: false });

        if (institutionsError) {
            structuredLog('ERROR', 'Error fetching institutions', requestId, {
                error: institutionsError,
            });
            return NextResponse.json(
                { success: false, error: 'Failed to load institutions' },
                { status: 500 },
            );
        }

        const { data: credentials, error: credentialsError } = await supabase
            .from('credentials')
            .select('institution_id, revoked');

        if (credentialsError) {
            structuredLog('ERROR', 'Error fetching credential counts', requestId, {
                error: credentialsError,
            });
        }

        const totals = new Map<string, { total: number; active: number }>();
        for (const credential of credentials ?? []) {
            const key = credential.institution_id;
            if (!key) continue;
            const entry = totals.get(key) ?? { total: 0, active: 0 };
            entry.total += 1;
            if (!credential.revoked) {
                entry.active += 1;
            }
            totals.set(key, entry);
        }

        const payload: AdminInstitution[] = (institutions ?? []).map((institution) => {
            const counts = totals.get(institution.id) ?? { total: 0, active: 0 };
            return {
                id: institution.id,
                name: institution.name,
                email: institution.email,
                walletAddress: institution.wallet_address ?? null,
                verified: Boolean(institution.verified),
                status: institution.status ?? 'pending',
                authorizationTxHash: institution.authorization_tx_hash ?? null,
                createdAt: institution.created_at ?? null,
                credentialCount: counts.total,
                activeCredentialCount: counts.active,
            };
        });

        return NextResponse.json({ success: true, institutions: payload });
    } catch (error) {
        captureException(error, { context: 'adminInstitutions' });
        return NextResponse.json(
            { success: false, error: 'Failed to load institutions' },
            { status: 500 },
        );
    }
}
