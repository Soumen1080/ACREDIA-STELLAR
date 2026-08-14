import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceRoleClient, requireAdminRequest } from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { structuredLog, captureException } from '@/lib/debug';

export const dynamic = 'force-dynamic';

const ADMIN_INSTITUTION_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 60,
    prefix: 'admin-institution',
} as const;

const idSchema = z.string().uuid();

const CREDENTIAL_PAGE_SIZE = 50;

/**
 * Returns one institution plus its most recent credentials, for the admin
 * institution detail page.
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const requestId = request.headers.get('x-request-id') || 'unknown';

    try {
        const rateLimitResponse = await enforceRateLimit(request, ADMIN_INSTITUTION_RATE_LIMIT);
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

        const { id } = await context.params;
        const parsedId = idSchema.safeParse(id);

        if (!parsedId.success) {
            return NextResponse.json(
                { success: false, error: 'Invalid institution id' },
                { status: 400 },
            );
        }

        const supabase = getServiceRoleClient();

        const { data: institution, error: institutionError } = await supabase
            .from('institutions')
            .select(
                'id, name, email, wallet_address, verified, status, authorization_tx_hash, created_at',
            )
            .eq('id', parsedId.data)
            .maybeSingle();

        if (institutionError) {
            structuredLog('ERROR', 'Error fetching institution', requestId, {
                error: institutionError,
            });
            return NextResponse.json(
                { success: false, error: 'Failed to load institution' },
                { status: 500 },
            );
        }

        if (!institution) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        const { data: credentials, error: credentialsError } = await supabase
            .from('credentials')
            .select('id, token_id, student_wallet_address, issued_at, revoked, revoked_at, metadata')
            .eq('institution_id', parsedId.data)
            .order('issued_at', { ascending: false })
            .limit(CREDENTIAL_PAGE_SIZE);

        if (credentialsError) {
            structuredLog('ERROR', 'Error fetching institution credentials', requestId, {
                error: credentialsError,
            });
        }

        const rows = credentials ?? [];

        return NextResponse.json({
            success: true,
            institution: {
                id: institution.id,
                name: institution.name,
                email: institution.email,
                walletAddress: institution.wallet_address ?? null,
                verified: Boolean(institution.verified),
                status: institution.status ?? 'pending',
                authorizationTxHash: institution.authorization_tx_hash ?? null,
                createdAt: institution.created_at ?? null,
                credentialCount: rows.length,
                activeCredentialCount: rows.filter((row) => !row.revoked).length,
            },
            credentials: rows.map((row) => ({
                id: row.id,
                tokenId: row.token_id,
                studentWalletAddress: row.student_wallet_address ?? null,
                issuedAt: row.issued_at ?? null,
                revoked: Boolean(row.revoked),
                revokedAt: row.revoked_at ?? null,
                degree:
                    (row.metadata as Record<string, unknown> | null)?.degree?.toString() ?? null,
            })),
        });
    } catch (error) {
        captureException(error, { context: 'adminInstitutionDetail' });
        return NextResponse.json(
            { success: false, error: 'Failed to load institution' },
            { status: 500 },
        );
    }
}
