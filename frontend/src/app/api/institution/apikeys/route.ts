import { NextResponse, NextRequest } from 'next/server';
import { getServiceRoleClient, requireInstitutionRequest } from '@/lib/serverAuth';
import { hashApiKey } from '@/lib/apiKey';
import { captureException } from '@/lib/debug';
import { enforceRateLimit } from '@/lib/rateLimit';
import { randomBytes } from 'crypto';

// Coarse per-IP guard against anonymous floods before auth runs.
const INSTITUTION_APIKEYS_IP_LIMIT = {
    windowSeconds: 60,
    maxRequests: 30,
    prefix: 'institution-apikeys-ip',
} as const;

// Each key is a long-lived credential; keep creation tightly bounded per
// institution so a compromised or careless account cannot mint an unbounded
// number of them.
const INSTITUTION_APIKEYS_CREATE_QUOTA = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'institution-apikeys-user',
} as const;

function generateRandomKey() {
    return 'sk_acredia_' + randomBytes(24).toString('base64url');
}

export async function GET(request: NextRequest) {
    try {
        const auth = await requireInstitutionRequest(request);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
        }
        if (!auth.institutionId) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        const supabase = getServiceRoleClient();
        const { data: apiKeys, error } = await supabase
            .from('api_keys')
            .select('id, key_prefix, name, revoked, created_at')
            .eq('institution_id', auth.institutionId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true, apiKeys });
    } catch (err) {
        captureException(err, { context: 'GET /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const ipRateLimitResponse = await enforceRateLimit(request, INSTITUTION_APIKEYS_IP_LIMIT);
        if (ipRateLimitResponse) return ipRateLimitResponse;

        const auth = await requireInstitutionRequest(request);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
        }
        if (!auth.institutionId) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        const quotaRateLimitResponse = await enforceRateLimit(request, {
            ...INSTITUTION_APIKEYS_CREATE_QUOTA,
            identifier: auth.institutionId,
        });
        if (quotaRateLimitResponse) return quotaRateLimitResponse;

        const body = await request.json().catch(() => ({}));
        const name = body.name?.trim();
        if (!name) {
            return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
        }

        const supabase = getServiceRoleClient();
        const cleartextKey = generateRandomKey();
        const keyHash = await hashApiKey(cleartextKey);
        const keyPrefix = cleartextKey.substring(0, 15) + '...';

        const { data: newKey, error } = await supabase
            .from('api_keys')
            .insert({
                institution_id: auth.institutionId,
                name,
                key_prefix: keyPrefix,
                key_hash: keyHash,
            })
            .select('id, key_prefix, name, revoked, created_at')
            .single();

        if (error) {
            throw error;
        }

        return NextResponse.json({
            success: true,
            apiKey: newKey,
            cleartextKey, // Only returned once
        });
    } catch (err) {
        captureException(err, { context: 'POST /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireInstitutionRequest(request);
        if (!auth.ok) {
            return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
        }
        if (!auth.institutionId) {
            return NextResponse.json(
                { success: false, error: 'Institution not found' },
                { status: 404 },
            );
        }

        const body = await request.json().catch(() => ({}));
        const id = body.id;
        if (!id) {
            return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
        }

        const supabase = getServiceRoleClient();
        const { error } = await supabase
            .from('api_keys')
            .update({ revoked: true })
            .eq('id', id)
            .eq('institution_id', auth.institutionId);

        if (error) {
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        captureException(err, { context: 'DELETE /api/institution/apikeys' });
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
