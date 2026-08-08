import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit';
import { getServiceRoleClient } from '@/lib/serverAuth';
import { hashAuditValue } from '@/lib/verificationAudit';
import { captureException, structuredLog } from '@/lib/debug';

/**
 * Public contact form endpoint.
 *
 * Anti-abuse layers (in order):
 *   1. Rate limit per IP (shared Redis store when configured).
 *   2. Honeypot field that real users never see or fill.
 *   3. Minimum time-to-submit — bots post instantly.
 *   4. Strict schema validation (length bounds + email shape).
 *   5. Per-IP flood check against recent rows in the database.
 *
 * Rows are inserted with the service-role client because the table has no
 * public INSERT policy — the browser can never write to it directly.
 */
const CONTACT_RATE_LIMIT = {
    windowSeconds: 600, // 10 minutes
    maxRequests: 3, // 3 submissions per IP per window
    prefix: 'contact',
};

/** Max submissions from one IP within the flood window, enforced in the DB. */
const FLOOD_WINDOW_MINUTES = 60;
const FLOOD_MAX_MESSAGES = 5;

/** Bots typically submit in well under this many milliseconds. */
const MIN_FILL_MS = 2_000;

const ContactSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, 'Please enter your name (at least 2 characters).')
        .max(100, 'Name must be 100 characters or fewer.'),
    email: z
        .string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(254, 'Email must be 254 characters or fewer.')
        .email('Please enter a valid email address.'),
    message: z
        .string()
        .trim()
        .min(10, 'Please write at least 10 characters so we can help.')
        .max(5000, 'Message must be 5000 characters or fewer.'),
    /**
     * Honeypot — hidden from real users, so it must stay empty.
     *
     * Deliberately permissive here: if the schema rejected a filled value the
     * response would tell a bot the field is a trap. It is accepted, then
     * silently discarded below with a 200.
     */
    company: z.string().optional(),
    /** Client timestamp (ms) of when the form was rendered. */
    startedAt: z.number().int().positive().optional(),
});

export async function POST(request: NextRequest) {
    const requestId = request.headers.get('x-request-id') || 'unknown';

    try {
        // 1. Rate limit before doing any work.
        const limited = await enforceRateLimit(request, CONTACT_RATE_LIMIT);
        if (limited) {
            return limited;
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') {
            return NextResponse.json(
                { success: false, error: 'Invalid request body.' },
                { status: 400 },
            );
        }

        const parsed = ContactSchema.safeParse(body);
        if (!parsed.success) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of parsed.error.issues) {
                const key = String(issue.path[0] ?? 'form');
                if (!fieldErrors[key]) fieldErrors[key] = issue.message;
            }
            return NextResponse.json(
                { success: false, error: 'Please check the form and try again.', fieldErrors },
                { status: 400 },
            );
        }

        const { name, email, message, company, startedAt } = parsed.data;

        // 2. Honeypot: a filled hidden field means a bot. Respond 200 so the
        //    bot cannot distinguish success from rejection, but store nothing.
        if (company && company.trim().length > 0) {
            structuredLog('WARN', 'Contact honeypot triggered', requestId, {});
            return NextResponse.json({ success: true });
        }

        // 3. Submitted implausibly fast — almost certainly automated.
        if (startedAt && Date.now() - startedAt < MIN_FILL_MS) {
            structuredLog('WARN', 'Contact submitted too quickly', requestId, {});
            return NextResponse.json({ success: true });
        }

        const ipHash = hashAuditValue(getClientIp(request));
        const userAgent = request.headers.get('user-agent')?.slice(0, 500) ?? null;

        let supabase;
        try {
            supabase = getServiceRoleClient();
        } catch (error) {
            captureException(error, { requestId, context: 'POST /api/contact' });
            return NextResponse.json(
                { success: false, error: 'Server configuration error.' },
                { status: 500 },
            );
        }

        // 4. Flood check: cap how many messages one IP can leave per hour even
        //    if it rotates through the in-memory limiter (e.g. across instances).
        if (ipHash) {
            const since = new Date(Date.now() - FLOOD_WINDOW_MINUTES * 60_000).toISOString();
            const { count, error: countError } = await supabase
                .from('contact_messages')
                .select('id', { count: 'exact', head: true })
                .eq('ip_hash', ipHash)
                .gte('created_at', since);

            if (!countError && (count ?? 0) >= FLOOD_MAX_MESSAGES) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'You have sent several messages recently. Please try again later.',
                    },
                    { status: 429, headers: { 'Retry-After': String(FLOOD_WINDOW_MINUTES * 60) } },
                );
            }
        }

        const { error: insertError } = await supabase.from('contact_messages').insert({
            name,
            email,
            message,
            ip_hash: ipHash,
            user_agent: userAgent,
        });

        if (insertError) {
            captureException(insertError, { requestId, context: 'POST /api/contact insert' });
            return NextResponse.json(
                { success: false, error: 'Could not send your message. Please try again.' },
                { status: 500 },
            );
        }

        structuredLog('INFO', 'Contact message received', requestId, {});

        return NextResponse.json({ success: true });
    } catch (error) {
        captureException(error, { requestId, context: 'POST /api/contact' });
        return NextResponse.json(
            { success: false, error: 'Internal server error.' },
            { status: 500 },
        );
    }
}
