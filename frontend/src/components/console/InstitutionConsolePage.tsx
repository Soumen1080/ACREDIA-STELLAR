'use client';

import type { ReactNode } from 'react';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import {
    InstitutionProfileSkeleton,
    InstitutionUnavailableCard,
    VerificationRequiredCard,
    WalletPromptCard,
} from '@/components/console/ConsoleCards';
import { CONSOLE_NAV } from '@/lib/consoleNav';
import { useInstitutionProfile, type InstitutionProfile } from '@/hooks/useInstitutionProfile';

/** An institution profile that is known to exist. */
export type LoadedInstitutionProfile = InstitutionProfile;

interface InstitutionConsolePageProps {
    title: ReactNode;
    subtitle?: ReactNode;
    actions?: ReactNode;
    /**
     * Replace the page body with the "Verification Required" notice unless the
     * institution is KYB-verified. Issuance routes need this; read-only routes
     * such as the issued list and analytics do not.
     */
    requireVerified?: boolean;
    /** Shown above the body while no wallet is connected. */
    walletPrompt?: string;
    children: (profile: LoadedInstitutionProfile) => ReactNode;
}

/**
 * Shared frame for every institution console route: the console shell with the
 * institution sidebar, plus the loading / missing-profile / unverified states
 * that each section would otherwise re-implement.
 */
export function InstitutionConsolePage({
    title,
    subtitle,
    actions,
    requireVerified,
    walletPrompt,
    children,
}: InstitutionConsolePageProps) {
    const profile = useInstitutionProfile();

    const body = () => {
        if (profile.loading) {
            return <InstitutionProfileSkeleton />;
        }
        if (!profile.institutionId) {
            return <InstitutionUnavailableCard unlinked={profile.unlinked} />;
        }
        if (requireVerified && profile.status !== 'verified') {
            return <VerificationRequiredCard status={profile.status} />;
        }
        return children(profile);
    };

    const showWalletPrompt =
        Boolean(walletPrompt) && !profile.loading && Boolean(profile.institutionId) && !profile.address;

    return (
        <ConsoleShell nav={CONSOLE_NAV.institution} title={title} subtitle={subtitle} actions={actions}>
            <div className="space-y-6">
                {showWalletPrompt && <WalletPromptCard message={walletPrompt as string} />}
                {body()}
            </div>
        </ConsoleShell>
    );
}
