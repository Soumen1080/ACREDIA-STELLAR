'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { captureException } from '@/lib/debug';
import {
    adminFetch,
    formatDate,
    shortenAddress,
    statusBadgeClass,
    type AdminInstitutionSummary,
} from '@/lib/adminApi';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(status)}`}
        >
            {status}
        </span>
    );
}

function InstitutionsContent() {
    const { signOut } = useAuth();
    const router = useRouter();
    const [institutions, setInstitutions] = useState<AdminInstitutionSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');

    const load = useCallback(async (silent = false) => {
        try {
            if (silent) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }

            const data = await adminFetch<{ institutions: AdminInstitutionSummary[] }>(
                '/api/admin/institutions',
            );
            setInstitutions(data.institutions);
            setError('');
        } catch (err) {
            captureException(err, { context: 'adminInstitutionsList' });
            const message = err instanceof Error ? err.message : 'Failed to load institutions';
            setError(message);
            if (!silent) {
                toast.error(message);
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (!term) return institutions;
        return institutions.filter(
            (institution) =>
                institution.name.toLowerCase().includes(term) ||
                institution.email.toLowerCase().includes(term) ||
                (institution.walletAddress ?? '').toLowerCase().includes(term),
        );
    }, [institutions, query]);

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    return (
        <AdminShell
            title="Institutions"
            subtitle="Every organisation registered on Acredia"
            onSignOut={handleSignOut}
            actions={
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => load(true)}
                    disabled={refreshing || loading}
                >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            }
        >
            <Card className="mb-6 p-4">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by name, email, or wallet address"
                        className="pl-9"
                        aria-label="Search institutions"
                    />
                </div>
            </Card>

            {loading ? (
                <div className="space-y-3">
                    {[0, 1, 2].map((index) => (
                        <Card key={index} className="p-5">
                            <Skeleton className="h-5 w-48" />
                            <Skeleton className="mt-3 h-4 w-64" />
                        </Card>
                    ))}
                </div>
            ) : error ? (
                <Card className="border-destructive/25 bg-destructive/8 p-6">
                    <p className="text-sm font-semibold text-destructive">{error}</p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => load()}>
                        Try again
                    </Button>
                </Card>
            ) : filtered.length === 0 ? (
                <Card className="p-10 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                        <Building2 className="h-6 w-6" />
                    </span>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                        {institutions.length === 0
                            ? 'No institutions registered yet'
                            : 'No institutions match your search'}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {institutions.length === 0
                            ? 'Institutions appear here as soon as they create an account.'
                            : 'Try a different name, email, or wallet address.'}
                    </p>
                </Card>
            ) : (
                <>
                    {/* Desktop: table. Mobile: stacked cards (below). */}
                    <Card className="hidden overflow-hidden lg:block">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-border bg-secondary/40">
                                    <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="px-5 py-3 font-semibold">Institution</th>
                                        <th className="px-5 py-3 font-semibold">Status</th>
                                        <th className="px-5 py-3 font-semibold">Wallet</th>
                                        <th className="px-5 py-3 font-semibold">Credentials</th>
                                        <th className="px-5 py-3 font-semibold">Registered</th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {filtered.map((institution) => (
                                        <tr
                                            key={institution.id}
                                            className="transition-colors hover:bg-secondary/40"
                                        >
                                            <td className="px-5 py-4">
                                                <p className="font-semibold text-foreground">
                                                    {institution.name}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {institution.email}
                                                </p>
                                            </td>
                                            <td className="px-5 py-4">
                                                <StatusBadge status={institution.status} />
                                            </td>
                                            <td className="px-5 py-4 font-mono text-xs text-muted-foreground">
                                                {shortenAddress(institution.walletAddress)}
                                            </td>
                                            <td className="px-5 py-4 text-foreground">
                                                {institution.credentialCount}
                                                <span className="text-xs text-muted-foreground">
                                                    {' '}
                                                    ({institution.activeCredentialCount} active)
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-muted-foreground">
                                                {formatDate(institution.createdAt)}
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <Link
                                                    href={`/admin/institutions/${institution.id}`}
                                                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                                                >
                                                    View
                                                    <ArrowRight className="h-4 w-4" />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    <div className="space-y-3 lg:hidden">
                        {filtered.map((institution) => (
                            <Link
                                key={institution.id}
                                href={`/admin/institutions/${institution.id}`}
                                className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold text-foreground">
                                            {institution.name}
                                        </p>
                                        <p className="truncate text-xs text-muted-foreground">
                                            {institution.email}
                                        </p>
                                    </div>
                                    <StatusBadge status={institution.status} />
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <dt className="text-muted-foreground">Wallet</dt>
                                        <dd className="mt-0.5 font-mono text-foreground">
                                            {shortenAddress(institution.walletAddress)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Credentials</dt>
                                        <dd className="mt-0.5 text-foreground">
                                            {institution.credentialCount} (
                                            {institution.activeCredentialCount} active)
                                        </dd>
                                    </div>
                                </dl>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </AdminShell>
    );
}

export default function AdminInstitutionsPage() {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <InstitutionsContent />
        </ProtectedRoute>
    );
}
