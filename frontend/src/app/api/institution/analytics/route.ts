import { NextRequest, NextResponse } from 'next/server';
import {
    getServiceRoleClient,
    hasServiceRoleEnv,
    requireAuthenticatedRequest,
} from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { last12Months, groupByMonth, fillMonths, topVerified } from '@/lib/analyticsAggregation';
import { captureException } from '@/lib/debug';
import { resolveInstitutionForUser } from '@/lib/institutionMembership';

// Analytics aggregates the full credential + verification log set for an institution.
// Each request is relatively expensive, so limits are tighter than the credential list.
const INSTITUTION_ANALYTICS_IP_LIMIT = {
    windowSeconds: 60,
    maxRequests: 20,
    prefix: 'institution-analytics-ip',
} as const;

const INSTITUTION_ANALYTICS_USER_QUOTA = {
    windowSeconds: 60,
    maxRequests: 20,
    prefix: 'institution-analytics-user',
} as const;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') ?? 'unknown';
    try {
        const ipRateLimitResponse = await enforceRateLimit(request, INSTITUTION_ANALYTICS_IP_LIMIT);
        if (ipRateLimitResponse) return ipRateLimitResponse;

        const authCheck = await requireAuthenticatedRequest(request);
        if (!authCheck.ok) {
            return NextResponse.json(
                { success: false, error: authCheck.error },
                { status: authCheck.status },
            );
        }

        const userRateLimitResponse = await enforceRateLimit(request, {
            ...INSTITUTION_ANALYTICS_USER_QUOTA,
            identifier: authCheck.userId,
        });
        if (userRateLimitResponse) return userRateLimitResponse;

        const supabase = hasServiceRoleEnv()
            ? getServiceRoleClient()
            : (() => {
                  throw new Error('Service role key required');
              })();

        const membership = await resolveInstitutionForUser(supabase, authCheck.userId);

        if (!membership) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        const inst = { id: membership.institutionId };

        // Fetch credentials — lightweight select, no pagination (analytics needs full set)
        // TODO: swap this query to the indexer once issue #11 is implemented
        // Note: the subsequent .in('credential_id', credIds) is unbounded; safe up to ~500 credentials
        const { data: credentials, error: credErr } = await supabase
            .from('credentials')
            .select('id, token_id, issued_at, revoked, metadata')
            .eq('institution_id', inst.id);

        if (credErr) throw credErr;

        const creds = credentials ?? [];
        const months = last12Months();

        const issuedOverTime = fillMonths(groupByMonth(creds.map((c) => c.issued_at)), months);
        const active = creds.filter((c) => !c.revoked).length;
        const statusBreakdown = { active, revoked: creds.length - active, total: creds.length };

        let verificationsOverTime: { month: string; count: number }[] = months.map((m) => ({
            month: m,
            count: 0,
        }));
        let topVerifiedCredentials: {
            tokenId: string;
            credentialType: string;
            studentName: string;
            count: number;
        }[] = [];

        if (creds.length > 0) {
            const credIds = creds.map((c) => c.id);
            const { data: logs, error: logsErr } = await supabase
                .from('verification_logs')
                .select('credential_id, created_at')
                .in('credential_id', credIds);

            if (logsErr) throw logsErr;

            const logRows = logs ?? [];
            verificationsOverTime = fillMonths(
                groupByMonth(logRows.map((l) => l.created_at ?? '')),
                months,
            );

            const credMap = new Map(
                creds.map((c) => [
                    c.id,
                    {
                        tokenId: c.token_id,
                        credentialType:
                            (c.metadata as { credentialData?: { credentialType?: string } } | null)
                                ?.credentialData?.credentialType ?? 'Unknown',
                        studentName:
                            (c.metadata as { credentialData?: { studentName?: string } } | null)
                                ?.credentialData?.studentName ?? 'Unknown',
                    },
                ]),
            );
            topVerifiedCredentials = topVerified(logRows, credMap);
        }

        return NextResponse.json({
            success: true,
            issuedOverTime,
            statusBreakdown,
            verificationsOverTime,
            topVerifiedCredentials,
        });
    } catch (err) {
        captureException(err, { requestId, context: 'GET /api/institution/analytics' });
        return NextResponse.json(
            { success: false, error: 'Failed to fetch analytics' },
            { status: 500 },
        );
    }
}
