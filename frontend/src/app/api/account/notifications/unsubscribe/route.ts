import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/serverAuth';
import { structuredLog } from '@/lib/debug';
import { enforceRateLimit } from '@/lib/rateLimit';
import { verifyUnsubscribeToken } from '@/lib/notificationUnsubscribe';

// ACREDIA-STELLAR#235: this endpoint used to trust a bare `userId` from the
// query string with no authentication and no signed token, letting anyone
// silently disable any other user's notification emails. It's a one-click
// email link with no browser session attached, so it can't use
// `requireAuthenticatedRequest` — instead the link carries a token
// (`createUnsubscribeToken`) that is bound to that specific `userId` and
// expires, verified in constant time by `verifyUnsubscribeToken`.
//
// State only changes on POST. GET (what mail clients/prefetchers actually
// issue when scanning a link) only ever renders a confirmation page — it
// never mutates anything, valid token or not.

const UNSUBSCRIBE_RATE_LIMIT = {
    windowSeconds: 60,
    maxRequests: 10,
    prefix: 'unsubscribe',
} as const;

function settingsRedirect(request: NextRequest, query: string) {
    return NextResponse.redirect(new URL(`/dashboard/settings${query}`, request.url));
}

function confirmationPage(request: NextRequest, userId: string, token: string) {
    const actionUrl = new URL(request.url);
    actionUrl.searchParams.set('userId', userId);
    actionUrl.searchParams.set('token', token);

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Unsubscribe</title></head>
<body>
    <h1>Turn off credential email notifications?</h1>
    <p>Confirm to stop receiving credential notification emails.</p>
    <form method="POST" action="${actionUrl.pathname}${actionUrl.search}">
        <button type="submit">Confirm unsubscribe</button>
    </form>
</body>
</html>`;

    return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}

export async function GET(request: NextRequest) {
    const rateLimitResponse = await enforceRateLimit(request, UNSUBSCRIBE_RATE_LIMIT);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const token = searchParams.get('token');

    if (!userId || !token) {
        return settingsRedirect(request, '');
    }

    if (!verifyUnsubscribeToken(userId, token)) {
        structuredLog('WARN', 'Rejected unsubscribe link with invalid or expired token', 'system', {
            userId,
        });
        return settingsRedirect(request, '?error=true');
    }

    // Valid token, but GET never mutates — show the confirmation page.
    return confirmationPage(request, userId, token);
}

export async function POST(request: NextRequest) {
    const rateLimitResponse = await enforceRateLimit(request, UNSUBSCRIBE_RATE_LIMIT);
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const token = searchParams.get('token');

        if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
            structuredLog('WARN', 'Rejected unsubscribe POST with invalid or missing token', 'system', {
                userId: userId ?? null,
            });
            return NextResponse.json(
                { success: false, error: 'Invalid or expired unsubscribe link' },
                { status: 401 },
            );
        }

        const supabase = getServiceRoleClient();

        const { data: profile } = await supabase
            .from('profiles')
            .select('notification_preferences')
            .eq('id', userId)
            .single();

        if (profile) {
            const prefs =
                (profile.notification_preferences as Record<string, boolean> | null) ?? {};
            prefs.email_issued = false;
            prefs.email_revoked = false;
            prefs.email_verified = false;

            await supabase
                .from('profiles')
                .update({ notification_preferences: prefs })
                .eq('id', userId);
        }

        structuredLog('INFO', 'User unsubscribed from notification emails', 'system', { userId });

        return settingsRedirect(request, '?unsubscribed=true');
    } catch (error) {
        structuredLog('ERROR', 'Failed to unsubscribe', 'system', { error: String(error) });
        return settingsRedirect(request, '?error=true');
    }
}
