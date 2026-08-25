'use client';

import { Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InfoField } from '@/components/console/ConsoleCards';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Overview for a session whose role has not resolved, or resolved to one the
 * console has no sections for. Previously these users saw an empty page.
 */
export function PendingRoleOverview({ resolving }: { resolving?: boolean }) {
    const { user } = useAuth();

    if (resolving) {
        return (
            <Card className="p-6">
                <Skeleton className="mb-4 h-7 w-48" />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-5 w-32" />
                </div>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            <Card className="border-warning/25 bg-warning/8 p-6">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                        <Clock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-foreground">
                            Your account is not set up yet
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            We could not determine what kind of account this is. Sign out and back
                            in to retry, or contact support if this keeps happening.
                        </p>
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <h2 className="mb-5 text-base font-semibold text-foreground">
                    Account information
                </h2>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <InfoField label="Email">{user?.email}</InfoField>
                    <InfoField label="Name">{user?.user_metadata?.name || 'Not set'}</InfoField>
                </div>
            </Card>
        </div>
    );
}
