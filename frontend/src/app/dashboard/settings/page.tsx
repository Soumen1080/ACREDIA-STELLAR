'use client';

import { useRouter } from 'next/navigation';
import { Settings } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { AccountSettingsPanels } from '@/components/settings/AccountSettingsPanels';
import { ProtectedRoute } from '@/contexts/AuthContext';
import { signOut } from '@/lib/supabase';

/**
 * Dashboard Settings page — /dashboard/settings
 *
 * Provides the GDPR Art. 17 "Delete My Account" feature (right to erasure).
 * The deletion flow:
 *   1. User reads the warning about on-chain immutability.
 *   2. User types "DELETE" to confirm intent.
 *   3. Client POSTs /api/account/erase with the current bearer token.
 *   4. On 204, the client signs out and redirects to the home page.
 */
function SettingsContent() {
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    return (
        <DashboardShell
            title="Account Settings"
            subtitle="Manage your account preferences and data rights."
            icon={
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Settings className="h-5 w-5" />
                </span>
            }
            onSignOut={handleSignOut}
        >
            <AccountSettingsPanels />
        </DashboardShell>
    );
}

export default function DashboardSettingsPage() {
    return (
        <ProtectedRoute>
            <SettingsContent />
        </ProtectedRoute>
    );
}
