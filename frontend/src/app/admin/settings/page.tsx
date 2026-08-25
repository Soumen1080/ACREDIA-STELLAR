'use client';

import { ConsoleShell } from '@/components/console/ConsoleShell';
import { AccountSettingsPanels } from '@/components/settings/AccountSettingsPanels';
import { CONSOLE_NAV } from '@/lib/consoleNav';
import { ProtectedRoute } from '@/contexts/AuthContext';

/**
 * Admin account settings — /admin/settings
 *
 * Same panels as the member settings page, kept inside the admin console so the
 * sidebar stays available. The page header is omitted deliberately: the sidebar
 * already marks "Settings" as the current page, so a heading would only repeat
 * it.
 */
export default function AdminSettingsPage() {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <ConsoleShell nav={CONSOLE_NAV.admin}>
                <AccountSettingsPanels />
            </ConsoleShell>
        </ProtectedRoute>
    );
}
