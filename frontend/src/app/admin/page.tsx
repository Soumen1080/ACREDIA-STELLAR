'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Activity,
    ArrowRight,
    Building2,
    CheckCircle2,
    RefreshCw,
    Shield,
    ShieldAlert,
    Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { ConnectWalletNotice } from '@/components/admin/ConnectWalletNotice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { debugLog, captureException } from '@/lib/debug';
import { adminFetch } from '@/lib/adminApi';
import { runtimeConfig } from '@/lib/runtimeConfig';
import { useContractOwner } from '@/hooks/useContractOwner';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

interface AdminStats {
    totalInstitutions: number;
    authorizedInstitutions: number;
    totalCredentials: number;
    activeCredentials: number;
    totalStudents: number;
    verificationActivity: {
        totalAttempts: number;
        attemptsLast24h: number;
    };
}

const EMPTY_STATS: AdminStats = {
    totalInstitutions: 0,
    authorizedInstitutions: 0,
    totalCredentials: 0,
    activeCredentials: 0,
    totalStudents: 0,
    verificationActivity: {
        totalAttempts: 0,
        attemptsLast24h: 0,
    },
};

const REFRESH_INTERVAL_MS = 30_000;

function StatCard({
    icon: Icon,
    iconClassName,
    label,
    value,
    caption,
    loading,
}: {
    icon: typeof Users;
    iconClassName: string;
    label: string;
    value: number;
    caption: string;
    loading: boolean;
}) {
    return (
        <Card className="p-5">
            <div className="flex items-center gap-3">
                <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}
                >
                    <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
            </div>

            {/* Only the first load shows a skeleton. Background refreshes replace
                the number in place so it never blinks out. */}
            {loading ? (
                <Skeleton className="mt-4 h-9 w-16" />
            ) : (
                <p className="mt-4 text-3xl font-bold tabular-nums text-foreground">{value}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{loading ? ' ' : caption}</p>
        </Card>
    );
}

function AdminDashboardContent() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const { address, isOwner, isChecking, contractOwner } = useContractOwner();

    const [stats, setStats] = useState<AdminStats>(EMPTY_STATS);
    const [loadingStats, setLoadingStats] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStats = useCallback(async (silent = false) => {
        try {
            if (silent) {
                setRefreshing(true);
            } else {
                setLoadingStats(true);
            }

            const data = await adminFetch<{ stats: AdminStats }>('/api/admin/stats');
            setStats(data.stats);
            debugLog('Admin statistics loaded.');
        } catch (error) {
            captureException(error, { context: 'fetchStats' });
            // A failed background poll keeps the last good numbers on screen
            // instead of nagging every 30 seconds.
            if (!silent) {
                toast.error(
                    error instanceof Error ? error.message : 'Failed to load statistics',
                );
            }
        } finally {
            setLoadingStats(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        if (!isOwner) return;

        fetchStats();
        const interval = setInterval(() => fetchStats(true), REFRESH_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isOwner, fetchStats]);

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const revokedCredentials = Math.max(stats.totalCredentials - stats.activeCredentials, 0);

    return (
        <AdminShell
            title="Overview"
            subtitle="System statistics and contract status"
            onSignOut={handleSignOut}
            actions={
                isOwner ? (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchStats(true)}
                        disabled={refreshing || loadingStats}
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                ) : undefined
            }
        >
            {!address ? (
                <ConnectWalletNotice message="Connect the contract owner wallet to load system statistics and manage issuer authorizations." />
            ) : (
                <div className="space-y-6">
                    {isChecking ? (
                        <Card className="p-6">
                            <Skeleton className="h-5 w-56" />
                            <Skeleton className="mt-4 h-4 w-full max-w-md" />
                        </Card>
                    ) : !isOwner ? (
                        <Card className="border-warning/25 bg-warning/8 p-6">
                            <div className="flex items-start gap-3">
                                <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-warning" />
                                <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-foreground">
                                        Read-only mode — not the contract owner
                                    </h3>
                                    <p className="mt-1.5 text-sm text-muted-foreground">
                                        Statistics stay hidden and issuer authorization is disabled
                                        until you connect the wallet that deployed the contract.
                                    </p>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        Connected:{' '}
                                        <span className="break-all font-mono text-foreground">
                                            {address}
                                        </span>
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Contract owner:{' '}
                                        <span className="break-all font-mono text-foreground">
                                            {contractOwner || 'Could not fetch'}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </Card>
                    ) : null}

                    <Card className="p-6">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/12 text-success">
                                <CheckCircle2 className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-foreground">
                                    {isOwner ? 'Contract owner' : 'Signed in as admin'}
                                </h3>
                                <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                    <div className="min-w-0">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Email
                                        </dt>
                                        <dd className="mt-1 truncate text-sm text-foreground">
                                            {user?.email}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Wallet address
                                        </dt>
                                        <dd className="mt-1 break-all font-mono text-xs text-foreground">
                                            {address}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                            Contract address
                                        </dt>
                                        <dd className="mt-1 break-all font-mono text-xs text-foreground">
                                            {runtimeConfig.contracts.CREDENTIAL_NFT}
                                        </dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </Card>

                    {isOwner && (
                        <>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard
                                    icon={Users}
                                    iconClassName="bg-primary/10 text-primary"
                                    label="Total institutions"
                                    value={stats.totalInstitutions}
                                    caption="Registered institutions"
                                    loading={loadingStats}
                                />
                                <StatCard
                                    icon={CheckCircle2}
                                    iconClassName="bg-success/12 text-success"
                                    label="Authorized"
                                    value={stats.authorizedInstitutions}
                                    caption="Authorized to issue"
                                    loading={loadingStats}
                                />
                                <StatCard
                                    icon={Shield}
                                    iconClassName="bg-primary/10 text-primary"
                                    label="Total credentials"
                                    value={stats.totalCredentials}
                                    caption={`${stats.activeCredentials} active, ${revokedCredentials} revoked`}
                                    loading={loadingStats}
                                />
                                <StatCard
                                    icon={Activity}
                                    iconClassName="bg-gold/12 text-gold"
                                    label="Verification checks"
                                    value={stats.verificationActivity.totalAttempts}
                                    caption={`${stats.verificationActivity.attemptsLast24h} in last 24h`}
                                    loading={loadingStats}
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <Link
                                    href="/admin/institutions"
                                    className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                                        <Building2 className="h-5 w-5" />
                                    </span>
                                    <h3 className="mt-4 font-semibold text-foreground">
                                        Institutions
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Browse every registered institution and inspect the
                                        credentials it has issued.
                                    </p>
                                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                                        View institutions
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                </Link>

                                <Link
                                    href="/admin/authorize"
                                    className="group rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                                >
                                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/12 text-gold transition-transform group-hover:scale-105">
                                        <Shield className="h-5 w-5" />
                                    </span>
                                    <h3 className="mt-4 font-semibold text-foreground">
                                        Authorize issuer
                                    </h3>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        Grant a wallet permission to issue credentials on-chain.
                                    </p>
                                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                                        Open authorization
                                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            )}
        </AdminShell>
    );
}

export default function AdminDashboardPage() {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboardContent />
        </ProtectedRoute>
    );
}
