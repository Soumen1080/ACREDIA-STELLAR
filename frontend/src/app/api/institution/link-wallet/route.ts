import { StrKey } from '@stellar/stellar-sdk';
import { NextRequest, NextResponse } from 'next/server';
import {
    createUserScopedServerClient,
    getServiceRoleClient,
    hasServiceRoleEnv,
    requireAuthenticatedRequest,
} from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { structuredLog, captureException } from '@/lib/debug';
import { canWrite, resolveInstitutionForUser } from '@/lib/institutionMembership';

export const dynamic = 'force-dynamic';

const INSTITUTION_LINK_WALLET_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 30,
    prefix: 'institution-link-wallet',
} as const;

function getAccessToken(request: NextRequest): string {
    const authHeader = request.headers.get('authorization') || '';
    return authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : '';
}

export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || 'unknown';
    try {
        const rateLimitResponse = await enforceRateLimit(request, INSTITUTION_LINK_WALLET_RATE_LIMIT);
        if (rateLimitResponse) {
            return rateLimitResponse;
        }

        const authCheck = await requireAuthenticatedRequest(request);
        if (!authCheck.ok) {
            return NextResponse.json(
                { success: false, error: authCheck.error },
                { status: authCheck.status },
            );
        }

        const { walletAddress } = await request.json();
        const normalizedWallet =
            typeof walletAddress === 'string' ? walletAddress.trim() : '';

        if (!normalizedWallet) {
            return NextResponse.json(
                { success: false, error: 'Wallet address is required' },
                { status: 400 },
            );
        }

        if (!StrKey.isValidEd25519PublicKey(normalizedWallet)) {
            return NextResponse.json(
                { success: false, error: 'Wallet address must be a valid Stellar public key' },
                { status: 400 },
            );
        }

        const supabase = hasServiceRoleEnv()
            ? getServiceRoleClient()
            : createUserScopedServerClient(getAccessToken(request));

        const membership = await resolveInstitutionForUser(supabase, authCheck.userId);

        if (!membership) {
            return NextResponse.json(
                { success: false, error: 'Institution profile not found' },
                { status: 404 },
            );
        }

        // Linking a wallet re-scopes every credential the institution issues,
        // so it is a write action: read-only members may not perform it.
        if (!canWrite(membership.role)) {
            return NextResponse.json(
                { success: false, error: 'Your role does not permit changing the wallet' },
                { status: 403 },
            );
        }

        const { data: institution, error: findError } = await supabase
            .from('institutions')
            .select('id, wallet_address')
            .eq('id', membership.institutionId)
            .maybeSingle();

        if (findError) {
            structuredLog('ERROR', 'Error fetching institution', requestId, { error: findError });
            return NextResponse.json(
                { success: false, error: 'Failed to load institution profile' },
                { status: 500 },
            );
        }

        if (!institution) {
            return NextResponse.json(
                { success: false, error: 'Institution profile not found' },
                { status: 404 },
            );
        }

        if (institution.wallet_address?.toLowerCase() === normalizedWallet.toLowerCase()) {
            return NextResponse.json({
                success: true,
                walletAddress: institution.wallet_address,
                changed: false,
            });
        }

        const { data: updatedInstitution, error: updateError } = await supabase
            .from('institutions')
            .update({
                wallet_address: normalizedWallet,
                verified: false,
                status: 'pending',
                authorization_tx_hash: null,
            })
            .eq('id', institution.id)
            .select('id, wallet_address')
            .single();

        if (updateError) {
            structuredLog('ERROR', 'Error updating institution', requestId, { error: updateError });
            return NextResponse.json(
                { success: false, error: 'Failed to link institution wallet' },
                { status: 500 },
            );
        }

        return NextResponse.json({
            success: true,
            walletAddress: updatedInstitution.wallet_address,
            changed: true,
        });
    } catch (error) {
        captureException(error, { requestId, context: 'POST /api/institution/link-wallet' });
        return NextResponse.json(
            { success: false, error: 'Failed to link institution wallet' },
            { status: 500 },
        );
    }
}
