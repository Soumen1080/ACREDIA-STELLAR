import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServiceRoleClient, requireAdminRequest } from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { structuredLog, captureException } from '@/lib/debug';

export const dynamic = 'force-dynamic';

const ADMIN_RECOVERY_LINK_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 30,
    prefix: 'admin-recovery-link',
} as const;

const idSchema = z.string().uuid();

const requestSchema = z.object({
    type: z.enum(['recovery', 'invite']).default('recovery'),
    reason: z.string().max(500).optional(),
    requesterEmail: z.string().email().optional(),
});

/**
 * Generates a direct single-use, expiring recovery (password-reset) or invite link
 * for an institution's POC.
 *
 * This provides an admin fallback when email deliverability is delayed, filtered into spam,
 * or when the Supabase mail quota is throttled.
 *
 * Generating a new recovery link in Supabase updates the user's recovery token hash,
 * automatically invalidating any previously issued recovery links.
 */
export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> },
) {
    const requestId = request.headers.get('x-request-id') || 'unknown';

    try {
        const rateLimitResponse = await enforceRateLimit(request, ADMIN_RECOVERY_LINK_RATE_LIMIT);
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

        const body = await request.json().catch(() => ({}));
        const parsedBody = requestSchema.safeParse(body);

        if (!parsedBody.success) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Invalid request parameters',
                    details: parsedBody.error.flatten(),
                },
                { status: 400 },
            );
        }

        const supabase = getServiceRoleClient();

        // 1. Fetch institution
        const { data: institution, error: institutionError } = await supabase
            .from('institutions')
            .select('id, name, email, auth_user_id')
            .eq('id', parsedId.data)
            .maybeSingle();

        if (institutionError) {
            structuredLog('ERROR', 'Failed to fetch institution for recovery link', requestId, {
                error: institutionError,
                institutionId: parsedId.data,
            });
            return NextResponse.json(
                { success: false, error: 'Failed to find institution' },
                { status: 500 },
            );
        }

        if (!institution) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        if (!institution.email) {
            return NextResponse.json(
                { success: false, error: 'Institution does not have a registered email' },
                { status: 400 },
            );
        }

        // 2. Determine redirect destination
        const origin = request.nextUrl.origin || 'http://localhost:3000';
        const redirectTo = `${origin}/auth/reset-password?next=/dashboard`;

        const linkType = parsedBody.data.type;

        // 3. Generate single-use link via Supabase Auth Admin API
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
            type: linkType,
            email: institution.email,
            options: {
                redirectTo,
            },
        });

        if (linkError || !linkData?.properties?.action_link) {
            structuredLog('ERROR', 'Supabase link generation failed', requestId, {
                error: linkError,
                email: institution.email,
                type: linkType,
            });
            return NextResponse.json(
                {
                    success: false,
                    error:
                        linkError?.message ||
                        'Failed to generate recovery link. Ensure the user exists in authentication.',
                },
                { status: 500 },
            );
        }

        const actionLink = linkData.properties.action_link;

        // 4. Record audit log
        const auditAction =
            linkType === 'invite' ? 'generate_invite_link' : 'generate_recovery_link';

        const { error: auditError } = await supabase.from('admin_audit_logs').insert({
            action: auditAction,
            actor_admin_id: adminCheck.userId,
            target_institution_id: institution.id,
            requester_email: parsedBody.data.requesterEmail || null,
            new_poc_email: institution.email,
            details: {
                reason: parsedBody.data.reason || 'Admin fallback link generation',
                linkType,
                singleUse: true,
                expiresInHours: 24,
            },
        });

        if (auditError) {
            structuredLog('WARN', 'Failed to write admin audit log for link generation', requestId, {
                error: auditError,
            });
        }

        structuredLog('INFO', 'Generated recovery link for institution POC', requestId, {
            institutionId: institution.id,
            email: institution.email,
            linkType,
            adminId: adminCheck.userId,
        });

        return NextResponse.json({
            success: true,
            link: actionLink,
            type: linkType,
            email: institution.email,
            expiresInHours: 24,
            message: `Single-use ${linkType} link generated. Any previously generated link has been invalidated.`,
        });
    } catch (error) {
        captureException(error, { context: 'adminRecoveryLink', requestId });
        return NextResponse.json(
            { success: false, error: 'Failed to generate link' },
            { status: 500 },
        );
    }
}
