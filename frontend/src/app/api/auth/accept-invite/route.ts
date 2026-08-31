import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient, requireAuthenticatedRequest } from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { structuredLog, captureException } from '@/lib/debug';

export const dynamic = 'force-dynamic';

const ACCEPT_INVITE_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'accept-invite',
} as const;

/**
 * Marks a POC's invite as consumed, once they have exchanged the invite link
 * for a session and set their own password.
 *
 * Only the invited POC can call this: the institution is resolved from the
 * caller's own verified session, never from the request body, so one POC can
 * never consume another institution's invite.
 */
export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || 'unknown';

    try {
        const rateLimitResponse = await enforceRateLimit(request, ACCEPT_INVITE_RATE_LIMIT);
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

        const supabase = getServiceRoleClient();

        const { data: institution, error: institutionError } = await supabase
            .from('institutions')
            .select('id, name, invited_at, invite_expires_at, invite_accepted_at')
            .eq('auth_user_id', authCheck.userId)
            .maybeSingle();

        if (institutionError) {
            structuredLog('ERROR', 'Failed to load institution for invite acceptance', requestId, {
                error: institutionError,
            });
            return NextResponse.json(
                { success: false, error: 'Failed to complete onboarding' },
                { status: 500 },
            );
        }

        if (!institution) {
            return NextResponse.json(
                { success: false, error: 'No institution is linked to this account' },
                { status: 404 },
            );
        }

        // Already accepted — treat as success so a refreshed acceptance page
        // does not present the POC with an error for work already done.
        if (institution.invite_accepted_at) {
            return NextResponse.json({
                success: true,
                alreadyAccepted: true,
                institution: { id: institution.id, name: institution.name },
            });
        }

        const acceptedAt = new Date().toISOString();

        const { error: updateError } = await supabase
            .from('institutions')
            .update({ invite_accepted_at: acceptedAt })
            .eq('id', institution.id);

        if (updateError) {
            structuredLog('ERROR', 'Failed to mark the invite as accepted', requestId, {
                error: updateError,
                institutionId: institution.id,
            });
            return NextResponse.json(
                { success: false, error: 'Failed to complete onboarding' },
                { status: 500 },
            );
        }

        const { error: auditError } = await supabase.from('admin_audit_logs').insert({
            action: 'accept_invite',
            target_institution_id: institution.id,
            new_poc_id: authCheck.userId,
            new_poc_email: authCheck.user.email ?? null,
            details: {
                acceptedAt,
                invitedAt: institution.invited_at ?? null,
                inviteExpiresAt: institution.invite_expires_at ?? null,
            },
        });

        if (auditError) {
            structuredLog('WARN', 'Failed to record the invite acceptance audit log', requestId, {
                error: auditError,
            });
        }

        structuredLog('INFO', 'Institution POC accepted their invite', requestId, {
            institutionId: institution.id,
            userId: authCheck.userId,
        });

        return NextResponse.json({
            success: true,
            alreadyAccepted: false,
            institution: { id: institution.id, name: institution.name },
        });
    } catch (error) {
        captureException(error, { context: 'acceptInvite', requestId });
        return NextResponse.json(
            { success: false, error: 'Failed to complete onboarding' },
            { status: 500 },
        );
    }
}
