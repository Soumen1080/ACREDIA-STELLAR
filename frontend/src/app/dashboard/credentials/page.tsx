'use client';

import { Suspense } from 'react';
import { ConsoleShell } from '@/components/console/ConsoleShell';
import { WalletPromptCard } from '@/components/console/ConsoleCards';
import StudentCredentialsList from '@/components/student/StudentCredentialsList';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CONSOLE_NAV } from '@/lib/consoleNav';
import { useStellarAccount } from '@/contexts/StellarContext';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

function ListFallback() {
    return (
        <Card className="space-y-4 p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
        </Card>
    );
}

/** Credentials issued to the signed-in student — /dashboard/credentials. */
function StudentCredentialsContent() {
    const { user } = useAuth();
    const { address } = useStellarAccount();

    return (
        <ConsoleShell
            nav={CONSOLE_NAV.student}
            title="My credentials"
            subtitle="Every credential issued to you"
        >
            <div className="space-y-6">
                {!address && (
                    <WalletPromptCard message="Connect your wallet to view your credentials on the blockchain — use the “Connect Wallet” button in the sidebar." />
                )}

                <Suspense fallback={<ListFallback />}>
                    <StudentCredentialsList
                        studentId={user?.id || ''}
                        studentWallet={address || undefined}
                    />
                </Suspense>
            </div>
        </ConsoleShell>
    );
}

export default function StudentCredentialsPage() {
    return (
        <ProtectedRoute allowedRoles={['student']}>
            <StudentCredentialsContent />
        </ProtectedRoute>
    );
}
