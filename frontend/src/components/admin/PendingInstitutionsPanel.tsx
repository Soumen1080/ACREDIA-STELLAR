'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { adminFetch, type AdminInstitutionSummary } from '@/lib/adminApi';
import { captureException } from '@/lib/debug';

/**
 * Answers "what needs my attention?" on the admin landing screen
 * (ACREDIA-STELLAR#225).
 *
 * The count comes from the institution `status` column via the existing admin
 * institutions route — deliberately *not* from the overview's
 * `authorizedInstitutions` stat, which counts "has a wallet or has issued"
 * rather than "approved by an admin" and would make this claim untrue.
 */
export function PendingInstitutionsPanel({ refreshToken }: { refreshToken?: number }) {
    const [pending, setPending] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const data = await adminFetch<{ institutions: AdminInstitutionSummary[] }>(
                    '/api/admin/institutions',
                );
                if (cancelled) return;
                setPending(
                    (data.institutions ?? []).filter((item) => item.status === 'pending').length,
                );
                setFailed(false);
            } catch (error) {
                if (cancelled) return;
                // The overview already surfaces a toast when stats fail; this
                // panel stays silent and simply hides itself.
                captureException(error, { context: 'pendingInstitutionsPanel' });
                setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [refreshToken]);

    if (loading) {
        return (
            <Card className="p-5">
                <Skeleton className="h-5 w-64" />
            </Card>
        );
    }

    if (failed || pending === null) {
        return null;
    }

    if (pending === 0) {
        return (
            <Card className="flex items-center gap-3 p-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
                    <CheckCircle2 className="h-5 w-5" />
                </span>
                <p className="text-sm text-muted-foreground">
                    Nothing needs your attention — no institutions are awaiting review.
                </p>
            </Card>
        );
    }

    return (
        <Card className="border-warning/30 bg-warning/8 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                        <Clock className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-foreground">
                            {pending} {pending === 1 ? 'institution is' : 'institutions are'}{' '}
                            awaiting review
                        </h2>
                        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                            They cannot issue credentials until an admin approves them and
                            authorizes their wallet on-chain.
                        </p>
                    </div>
                </div>
                <Link
                    href="/admin/institutions"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:ml-auto"
                >
                    Review institutions
                    <ArrowRight className="h-4 w-4" />
                </Link>
            </div>
        </Card>
    );
}
