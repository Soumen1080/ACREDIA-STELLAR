'use client';

import { BarChart2, FileSpreadsheet, List, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import {
    InfoField,
    InstitutionProfileSkeleton,
    InstitutionUnavailableCard,
    WalletPromptCard,
    WalletStatus,
} from '@/components/console/ConsoleCards';
import { ConsoleQuickLink } from '@/components/console/overview/ConsoleQuickLink';
import { useInstitutionProfile } from '@/hooks/useInstitutionProfile';
import { useAuth } from '@/contexts/AuthContext';

function statusToneClass(status: string): string {
    if (status === 'verified') return 'text-success';
    if (status === 'pending') return 'text-warning';
    if (status === 'rejected' || status === 'suspended') return 'text-destructive';
    return 'text-muted-foreground';
}

/** Landing section of the institution console — account state and shortcuts. */
export function InstitutionOverview() {
    const { user } = useAuth();
    const profile = useInstitutionProfile();

    if (profile.loading) {
        return <InstitutionProfileSkeleton />;
    }

    if (!profile.institutionId) {
        return <InstitutionUnavailableCard unlinked={profile.unlinked} />;
    }

    return (
        <div className="space-y-6">
            <Card className="p-6">
                <h2 className="mb-5 text-base font-semibold text-foreground">
                    Account information
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                    <InfoField label="Email">{user?.email}</InfoField>
                    <InfoField label="Role">
                        <span className="capitalize">institution</span>
                    </InfoField>
                    <InfoField label="Wallet status">
                        <WalletStatus address={profile.address} linking={profile.linkingWallet} />
                    </InfoField>
                    <InfoField label="Verification status">
                        <span
                            className={`inline-flex items-center gap-1.5 font-semibold capitalize ${statusToneClass(profile.status)}`}
                        >
                            {profile.status}
                        </span>
                    </InfoField>
                </div>
            </Card>

            {!profile.address && (
                <WalletPromptCard message="Connect your wallet to issue credentials on the blockchain — use the “Connect Wallet” button in the sidebar." />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ConsoleQuickLink
                    href="/dashboard/issue"
                    icon={Upload}
                    title="Issue credential"
                    description="Upload a document and mint a single credential on-chain."
                    cta="Issue a credential"
                />
                <ConsoleQuickLink
                    href="/dashboard/batch-import"
                    icon={FileSpreadsheet}
                    iconClassName="bg-gold/12 text-gold"
                    title="Batch import"
                    description="Issue many credentials at once from a CSV file."
                    cta="Start a batch"
                />
                <ConsoleQuickLink
                    href="/dashboard/issued"
                    icon={List}
                    title="Issued credentials"
                    description="Search everything you have issued, and revoke when needed."
                    cta="View issued credentials"
                />
                <ConsoleQuickLink
                    href="/dashboard/analytics"
                    icon={BarChart2}
                    iconClassName="bg-gold/12 text-gold"
                    title="Analytics"
                    description="Issuance volume and verification activity over time."
                    cta="Open analytics"
                />
            </div>
        </div>
    );
}
