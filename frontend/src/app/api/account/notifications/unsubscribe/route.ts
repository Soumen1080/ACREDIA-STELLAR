import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/serverAuth';
import { structuredLog } from '@/lib/debug';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');

        if (!userId) {
            return NextResponse.redirect(new URL('/dashboard/settings', request.url));
        }

        const supabase = getServiceRoleClient();

        // Update preferences directly (this is a simple 1-click unsubscribe)
        // In a real production app, you might want to require a signed token,
        // but for now, we just turn off all emails if they click the link.
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

        // Redirect to a success page or dashboard settings
        const redirectUrl = new URL('/dashboard/settings?unsubscribed=true', request.url);
        return NextResponse.redirect(redirectUrl);
    } catch (error) {
        structuredLog('ERROR', 'Failed to unsubscribe', 'system', { error: String(error) });
        return NextResponse.redirect(new URL('/dashboard/settings?error=true', request.url));
    }
}
