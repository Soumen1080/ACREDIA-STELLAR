'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Building2, FileText, Mail, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin/AdminShell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { captureException } from '@/lib/debug';
import {
    adminFetch,
    formatDate,
    statusBadgeClass,
    type AdminInstitutionCredential,
    type AdminInstitutionSummary,
} from '@/lib/adminApi';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

interface DetailResponse {
    institution: AdminInstitutionSummary;
    credentials: AdminInstitutionCredential[];
}

function DetailRow({
    icon: Icon,
    label,
    children,
}: {
    icon: typeof Mail;
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                </p>
                <div className="mt-1 break-all text-sm text-foreground">{children}</div>
            </div>
        </div>
    );
}

function InstitutionDetailContent() {
    const { signOut } = useAuth();
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const institutionId = params?.id;

    const [data, setData] = useState<DetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!institutionId) return;

        try {
            setLoading(true);
            const response = await adminFetch<DetailResponse>(
                `/api/admin/institutions/${institutionId}`,
            );
            setData(response);
            setError('');
        } catch (err) {
            captureException(err, { context: 'adminInstitutionDetail' });
            const message = err instanceof Error ? err.message : 'Failed to load institution';
            setError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [institutionId]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const institution = data?.institution;

    return (
        <AdminShell
            title={institution?.name ?? 'Institution'}
            subtitle={institution?.email ?? 'Institution details'}
            onSignOut={handleSignOut}
            actions={
                <Button asChild variant="outline" size="sm">
                    <Link href="/admin/institutions">
                        <ArrowLeft className="h-4 w-4" />
                        All institutions
                    </Link>
                </Button>
            }
        >
            {loading ? (
                <div className="space-y-4">
                    <Card className="p-6">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="mt-4 h-4 w-72" />
                        <Skeleton className="mt-2 h-4 w-56" />
                    </Card>
                    <Card className="p-6">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="mt-4 h-4 w-full" />
                    </Card>
                </div>
            ) : error || !institution ? (
                <Card className="border-destructive/25 bg-destructive/8 p-6">
                    <p className="text-sm font-semibold text-destructive">
                        {error || 'Institution not found'}
                    </p>
                    <div className="mt-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={load}>
                            Try again
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                            <Link href="/admin/institutions">Back to list</Link>
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    <Card className="p-6">
                        <div className="mb-6 flex flex-wrap items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Building2 className="h-5 w-5" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <h2 className="truncate text-lg font-bold text-foreground">
                                    {institution.name}
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Registered {formatDate(institution.createdAt)}
                                </p>
                            </div>
                            <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusBadgeClass(institution.status)}`}
                            >
                                {institution.status}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                            <DetailRow icon={Mail} label="Email">
                                {institution.email}
                            </DetailRow>
                            <DetailRow icon={Wallet} label="Wallet address">
                                {institution.walletAddress ? (
                                    <span className="font-mono text-xs">
                                        {institution.walletAddress}
                                    </span>
                                ) : (
                                    <span className="text-warning">Not linked</span>
                                )}
                            </DetailRow>
                            <DetailRow icon={FileText} label="Authorization transaction">
                                {institution.authorizationTxHash ? (
                                    <span className="font-mono text-xs">
                                        {institution.authorizationTxHash}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">
                                        Not authorized on-chain
                                    </span>
                                )}
                            </DetailRow>
                            <DetailRow icon={Building2} label="Verified">
                                {institution.verified ? (
                                    <span className="text-success">Yes</span>
                                ) : (
                                    <span className="text-warning">No</span>
                                )}
                            </DetailRow>
                        </div>
                    </Card>

                    <Card className="overflow-hidden">
                        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
                            <h3 className="text-base font-semibold text-foreground">
                                Credentials issued
                            </h3>
                            <span className="text-sm text-muted-foreground">
                                {institution.credentialCount} total ·{' '}
                                {institution.activeCredentialCount} active
                            </span>
                        </div>

                        {data.credentials.length === 0 ? (
                            <div className="px-6 py-10 text-center">
                                <p className="text-sm text-muted-foreground">
                                    This institution has not issued any credentials yet.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-border bg-secondary/40">
                                        <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="px-6 py-3 font-semibold">Token</th>
                                            <th className="px-6 py-3 font-semibold">Degree</th>
                                            <th className="px-6 py-3 font-semibold">Issued</th>
                                            <th className="px-6 py-3 font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {data.credentials.map((credential) => (
                                            <tr key={credential.id}>
                                                <td className="px-6 py-3 font-mono text-xs text-foreground">
                                                    {credential.tokenId}
                                                </td>
                                                <td className="px-6 py-3 text-foreground">
                                                    {credential.degree ?? '—'}
                                                </td>
                                                <td className="px-6 py-3 text-muted-foreground">
                                                    {formatDate(credential.issuedAt)}
                                                </td>
                                                <td className="px-6 py-3">
                                                    {credential.revoked ? (
                                                        <span className="font-semibold text-destructive">
                                                            Revoked
                                                        </span>
                                                    ) : (
                                                        <span className="font-semibold text-success">
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>
            )}
        </AdminShell>
    );
}

export default function AdminInstitutionDetailPage() {
    return (
        <ProtectedRoute allowedRoles={['admin']}>
            <InstitutionDetailContent />
        </ProtectedRoute>
    );
}
