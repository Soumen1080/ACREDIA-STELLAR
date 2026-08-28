'use client';

import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { adminFetch } from '@/lib/adminApi';
import { captureException } from '@/lib/debug';

interface TableRetention {
    total: number;
    overdue: number;
    oldest: string | null;
}

interface RetentionStatus {
    verificationLogs: TableRetention & { retentionDays: number };
    contactMessages: TableRetention & { retentionMonths: number };
    lastSuccess: { finishedAt: string | null; rowsDeleted: number | null } | null;
    lastFailure: { finishedAt: string | null; error: string | null } | null;
    stale: boolean;
    staleAfterHours: number;
    overdueRows: number;
}

function relative(timestamp: string | null | undefined): string {
    if (!timestamp) return 'never';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'unknown';
    return formatDistanceToNow(date, { addSuffix: true });
}

function TableRow({
    name,
    rows,
    policy,
}: {
    name: string;
    rows: TableRetention;
    policy: string;
}) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{name}</p>
                <p className="text-xs text-muted-foreground">Kept {policy}</p>
            </div>
            <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-foreground">
                    {rows.total.toLocaleString()} rows
                </p>
                <p
                    className={
                        rows.overdue > 0
                            ? 'text-xs font-semibold text-destructive'
                            : 'text-xs text-muted-foreground'
                    }
                >
                    {rows.overdue > 0
                        ? `${rows.overdue.toLocaleString()} past retention`
                        : 'none past retention'}
                </p>
            </div>
        </div>
    );
}

/**
 * Retention health on the admin landing screen.
 *
 * The purge used to be entirely silent — nothing reported whether it was
 * scheduled or when it last ran, so a policy published to users could quietly
 * stop being true. This panel is the thing that makes that visible
 * (ACREDIA-STELLAR#227).
 */
export function RetentionPanel({ refreshToken }: { refreshToken?: number }) {
    const [status, setStatus] = useState<RetentionStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const data = await adminFetch<{ retention: RetentionStatus }>(
                    '/api/admin/retention',
                );
                if (cancelled) return;
                setStatus(data.retention);
                setFailed(false);
            } catch (error) {
                if (cancelled) return;
                captureException(error, { context: 'retentionPanel' });
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
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-4 h-16 w-full" />
            </Card>
        );
    }

    if (failed || !status) {
        return null;
    }

    const unhealthy = status.stale || status.overdueRows > 0;

    return (
        <Card className={unhealthy ? 'border-destructive/30 bg-destructive/8 p-5' : 'p-5'}>
            <div className="flex items-center gap-3">
                <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        unhealthy
                            ? 'bg-destructive/12 text-destructive'
                            : 'bg-success/12 text-success'
                    }`}
                >
                    {unhealthy ? (
                        <AlertTriangle className="h-5 w-5" />
                    ) : (
                        <Trash2 className="h-5 w-5" />
                    )}
                </span>
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-muted-foreground">Data retention</h2>
                    <p className="text-xs text-muted-foreground">
                        Last purge {relative(status.lastSuccess?.finishedAt)}
                        {status.lastSuccess?.rowsDeleted != null &&
                            ` · ${status.lastSuccess.rowsDeleted.toLocaleString()} rows deleted`}
                    </p>
                </div>
            </div>

            {unhealthy && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-card p-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="max-w-prose text-sm text-foreground">
                        {status.stale
                            ? `No retention purge has succeeded in over ${status.staleAfterHours} hours. The retention periods published in the privacy policy are not being enforced.`
                            : `${status.overdueRows.toLocaleString()} rows are past their published retention period.`}
                        {status.lastFailure?.error && (
                            <span className="mt-1 block text-xs text-muted-foreground">
                                Last failure: {status.lastFailure.error}
                            </span>
                        )}
                    </p>
                </div>
            )}

            {!unhealthy && (
                <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    Every governed table is within its published retention period.
                </p>
            )}

            <div className="mt-4 divide-y divide-border border-t border-border pt-1">
                <TableRow
                    name="Verification logs"
                    rows={status.verificationLogs}
                    policy={`${status.verificationLogs.retentionDays} days`}
                />
                <TableRow
                    name="Contact messages"
                    rows={status.contactMessages}
                    policy={`${status.contactMessages.retentionMonths} months from last correspondence`}
                />
            </div>
        </Card>
    );
}
