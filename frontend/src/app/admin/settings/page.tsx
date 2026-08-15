'use client';

import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { AccountSettingsPanels } from '@/components/settings/AccountSettingsPanels';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

/**
 * Admin account settings — /admin/settings
 *
 * Same panels as the member settings page, kept inside the admin console so the
 * sidebar stays available. The page header is omitted deliberately: the sidebar
 * already marks "Settings" as the current page, so a heading would only repeat
 * it.
 */
function AdminSettingsContent() {
    const { signOut } = useAuth();
    const router = useRouter();

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    return (
        <AdminShell onSignOut={handleSignOut}>
            <AccountSettingsPanels />
        </AdminShell>
    );
}

export default function AdminSettingsPage() {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <AdminSettingsContent />
        </ProtectedRoute>
    );
}
