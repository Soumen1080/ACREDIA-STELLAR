import { NextRequest, NextResponse } from 'next/server';
import {
    getServiceRoleClient,
    hasServiceRoleEnv,
    requireAuthenticatedRequest,
} from '@/lib/serverAuth';
import { enforceRateLimit } from '@/lib/rateLimit';
import { toCsv } from '@/lib/analyticsAggregation';
import { captureException } from '@/lib/debug';
import { resolveInstitutionForUser } from '@/lib/institutionMembership';

// CSV export streams the full credential set; treat it as expensive as analytics.
const INSTITUTION_EXPORT_IP_LIMIT = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'institution-export-ip',
} as const;

const INSTITUTION_EXPORT_USER_QUOTA = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'institution-export-user',
} as const;

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') ?? 'unknown';
    try {
        const ipRateLimitResponse = await enforceRateLimit(request, INSTITUTION_EXPORT_IP_LIMIT);
        if (ipRateLimitResponse) return ipRateLimitResponse;

        const authCheck = await requireAuthenticatedRequest(request);
        if (!authCheck.ok) {
            return NextResponse.json(
                { success: false, error: authCheck.error },
                { status: authCheck.status },
            );
        }

        const userRateLimitResponse = await enforceRateLimit(request, {
            ...INSTITUTION_EXPORT_USER_QUOTA,
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

        const { data: credentials, error: credErr } = await supabase
            .from('credentials')
            .select('token_id, issued_at, revoked, metadata')
            .eq('institution_id', inst.id)
            .order('issued_at', { ascending: false });

        if (credErr) throw credErr;

        const csv = toCsv(credentials ?? []);
        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': 'attachment; filename="credentials.csv"',
            },
        });
    } catch (err) {
        captureException(err, { requestId, context: 'GET /api/institution/export' });
        return NextResponse.json(
            { success: false, error: 'Failed to export credentials' },
            { status: 500 },
        );
    }
}
