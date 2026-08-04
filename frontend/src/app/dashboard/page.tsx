'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart2, FileSpreadsheet, List, Shield, Upload, User, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { CredentialUploadForm } from '@/components/institution/CredentialUploadForm';
import { BatchCredentialImport } from '@/components/institution/BatchCredentialImport';
import { InstitutionAnalytics } from '@/components/institution/InstitutionAnalytics';
import { IssuedCredentialsList } from '@/components/institution/IssuedCredentialsList';
import StudentCredentialsList from '@/components/student/StudentCredentialsList';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { debugLog, debugWarn, captureException } from '@/lib/debug';
import { safeGetSession, supabase } from '@/lib/supabase';
import { useStellarAccount } from '@/contexts/StellarContext';
import { ProtectedRoute, useAuth } from '@/contexts/AuthContext';

function InfoField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </p>
            <p className="mt-1 font-medium text-foreground">{children}</p>
        </div>
    );
}

function WalletStatus({ address, linking }: { address: string | null; linking?: boolean }) {
    if (!address) {
        return <span className="text-warning">Not connected</span>;
    }
    return (
        <span className="inline-flex items-center gap-2 text-success">
            <span className="flex h-2 w-2 rounded-full bg-success" />
            {linking ? 'Linking' : 'Connected'}: {address.slice(0, 6)}…{address.slice(-4)}
        </span>
    );
}

function WalletPromptCard({ message }: { message: string }) {
    return (
        <Card className="border-warning/25 bg-warning/8 p-6">
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                    <Wallet className="h-5 w-5" />
                </span>
                <div>
                    <h3 className="text-base font-semibold text-foreground">Connect your wallet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{message}</p>
                </div>
            </div>
        </Card>
    );
}

function DashboardContent() {
    const { user, userRole, signOut } = useAuth();
    const router = useRouter();
    const { address } = useStellarAccount();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [institutionId, setInstitutionId] = useState('');
    const [institutionWalletAddress, setInstitutionWalletAddress] = useState<string | null>(null);
    const [institutionStatus, setInstitutionStatus] = useState<string>('pending');
    const [loadingInstitution, setLoadingInstitution] = useState(true);
    const [linkingInstitutionWallet, setLinkingInstitutionWallet] = useState(false);
    const walletLinkInFlight = useRef<string | null>(null);

    useEffect(() => {
        const fetchInstitutionId = async () => {
            if (!user || userRole !== 'institution') {
                setInstitutionId('');
                setInstitutionWalletAddress(null);
                setInstitutionStatus('pending');
                setLoadingInstitution(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('institutions')
                    .select('id, wallet_address, status')
                    .eq('auth_user_id', user.id)
                    .maybeSingle();

                if (error) {
                    captureException(error, { context: 'fetchInstitutionId' });
                    toast.error('Failed to load institution data');
                    return;
                }

                if (data) {
                    setInstitutionId(data.id);
                    setInstitutionWalletAddress(data.wallet_address ?? null);
                    setInstitutionStatus(data.status || 'pending');
                    debugLog('Institution profile loaded for dashboard.');
                    return;
                }

                debugWarn('Institution record was missing and will be created.');
                toast.warning('Institution record not found. Creating profile...');

                const { data: newInstitution, error: createError } = await supabase
                    .from('institutions')
                    .insert([
                        {
                            auth_user_id: user.id,
                            email: user.email,
                            name: user.email?.split('@')[0] || 'Institution',
                        },
                    ])
                    .select('id, wallet_address, status')
                    .single();

                if (createError) {
                    captureException(createError, { context: 'createInstitution' });
                    toast.error('Failed to create institution profile');
                    return;
                }

                if (newInstitution) {
                    setInstitutionId(newInstitution.id);
                    setInstitutionWalletAddress(newInstitution.wallet_address ?? null);
                    setInstitutionStatus(newInstitution.status || 'pending');
                    toast.success('Institution profile created');
                }
            } catch (error) {
                captureException(error, { context: 'fetchInstitutionId_catch' });
                toast.error('An unexpected error occurred');
            } finally {
                setLoadingInstitution(false);
            }
        };

        fetchInstitutionId();
    }, [user, userRole]);

    useEffect(() => {
        const linkConnectedWallet = async () => {
            if (!user?.id || userRole !== 'institution' || !institutionId || !address) {
                return;
            }

            if (institutionWalletAddress?.toLowerCase() === address.toLowerCase()) {
                return;
            }

            if (walletLinkInFlight.current === address) {
                return;
            }

            walletLinkInFlight.current = address;
            setLinkingInstitutionWallet(true);

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await safeGetSession();

                if (sessionError || !session?.access_token) {
                    throw new Error('Your session expired. Please sign in again.');
                }

                const response = await fetch('/api/institution/link-wallet', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ walletAddress: address }),
                });
                const payload = await response.json();

                if (!response.ok || !payload?.success) {
                    throw new Error(payload?.error || 'Failed to link institution wallet');
                }

                // Always sync local state with the persisted wallet address so
                // the mismatch guard does not keep re-triggering on re-renders,
                // regardless of whether the DB row actually changed.
                setInstitutionWalletAddress(payload.walletAddress ?? address);
                debugLog('Connected wallet linked to institution profile.');
                if (payload.changed) {
                    toast.success('Institution wallet linked');
                }
            } catch (error) {
                captureException(error, { context: 'linkConnectedWallet' });
                toast.error('Failed to link connected wallet to your institution');
            } finally {
                // Always clear the in-flight guard so a failed or interrupted
                // attempt never permanently blocks future link attempts
                // (e.g. after React StrictMode double-invocation or a transient error).
                walletLinkInFlight.current = null;
                setLinkingInstitutionWallet(false);
            }
        };

        linkConnectedWallet();
    }, [address, institutionId, institutionWalletAddress, user?.id, userRole]);

    const handleSignOut = async () => {
        await signOut();
        router.push('/');
    };

    const handleCredentialIssued = () => {
        setRefreshTrigger((previous) => previous + 1);
        toast.success('Credential list will refresh!');
    };

    const institutionName = user?.user_metadata?.name || 'Institution';
    const institutionWallet = address || '';

    return (
        <DashboardShell
            title={<>Welcome, {user?.user_metadata?.name || 'User'}</>}
            subtitle={<span className="capitalize">{userRole} dashboard</span>}
            brandBadge={
                userRole && userRole !== 'loading' ? String(userRole).toUpperCase() : undefined
            }
            onSignOut={handleSignOut}
        >
            {userRole === 'institution' && (
                <div className="space-y-6">
                    {loadingInstitution && (
                        <Card className="p-6">
                            <Skeleton className="mb-4 h-7 w-48" />
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                {[0, 1, 2].map((i) => (
                                    <div key={i} className="space-y-2">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-5 w-32" />
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {institutionId && (
                        <Card className="p-6">
                            <h3 className="mb-5 text-base font-semibold text-foreground">
                                Account information
                            </h3>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                                <InfoField label="Email">{user?.email}</InfoField>
                                <InfoField label="Role">
                                    <span className="capitalize">{userRole}</span>
                                </InfoField>
                                <InfoField label="Wallet status">
                                    <WalletStatus
                                        address={address}
                                        linking={linkingInstitutionWallet}
                                    />
                                </InfoField>
                                <InfoField label="Verification Status">
                                    <span className={`inline-flex items-center gap-1.5 font-semibold capitalize ${
                                        institutionStatus === 'verified' ? 'text-success' :
                                        institutionStatus === 'pending' ? 'text-warning' :
                                        institutionStatus === 'rejected' ? 'text-destructive' :
                                        'text-muted-foreground'
                                    }`}>
                                        {institutionStatus}
                                    </span>
                                </InfoField>
                            </div>
                        </Card>
                    )}

                    {institutionId && !address && (
                        <WalletPromptCard message="Connect your wallet to issue credentials on the blockchain — use the “Connect Wallet” button in the top right." />
                    )}

                    {institutionId && (
                        <Tabs defaultValue="issue" className="w-full">
                            <TabsList className="grid w-full max-w-2xl grid-cols-4">
                                <TabsTrigger value="issue" className="gap-2">
                                    <Upload className="h-4 w-4" />
                                    Issue credential
                                </TabsTrigger>
                                <TabsTrigger value="bulk-import" className="gap-2">
                                    <FileSpreadsheet className="h-4 w-4" />
                                    Bulk import
                                </TabsTrigger>
                                <TabsTrigger value="view" className="gap-2">
                                    <List className="h-4 w-4" />
                                    View issued
                                </TabsTrigger>
                                <TabsTrigger value="analytics" className="gap-2">
                                    <BarChart2 className="h-4 w-4" />
                                    Analytics
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="issue" className="mt-6">
                                {institutionStatus === 'verified' ? (
                                    <CredentialUploadForm
                                        institutionId={institutionId}
                                        institutionName={institutionName}
                                        institutionWallet={institutionWallet}
                                        account={address}
                                        onSuccess={handleCredentialIssued}
                                    />
                                ) : (
                                    <Card className="p-8 text-center border-warning/25 bg-warning/8">
                                        <Shield className="mx-auto mb-4 h-12 w-12 text-warning" />
                                        <h3 className="text-lg font-bold text-foreground">Verification Required</h3>
                                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                                            Your institution account status is currently <strong>{institutionStatus}</strong>.
                                            You must be approved by an administrator and verified on-chain before you can issue academic credentials.
                                        </p>
                                    </Card>
                                )}
                            </TabsContent>

                            <TabsContent value="bulk-import" className="mt-6">
                                {institutionStatus === 'verified' ? (
                                    <BatchCredentialImport
                                        institutionId={institutionId}
                                        institutionName={institutionName}
                                        institutionWallet={institutionWallet}
                                        account={address}
                                        onSuccess={handleCredentialIssued}
                                    />
                                ) : (
                                    <Card className="p-8 text-center border-warning/25 bg-warning/8">
                                        <Shield className="mx-auto mb-4 h-12 w-12 text-warning" />
                                        <h3 className="text-lg font-bold text-foreground">Verification Required</h3>
                                        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                                            Your institution account status is currently <strong>{institutionStatus}</strong>.
                                            You must be approved by an administrator and verified on-chain before you can issue academic credentials.
                                        </p>
                                    </Card>
                                )}
                            </TabsContent>

                            <TabsContent value="view" className="mt-6">
                                <IssuedCredentialsList
                                    institutionId={institutionId}
                                    refreshTrigger={refreshTrigger}
                                />
                            </TabsContent>

                            <TabsContent value="analytics" className="mt-6">
                                <InstitutionAnalytics />
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            )}

            {userRole === 'admin' && (
                <div className="space-y-6">
                    <Card className="p-8">
                        <div className="flex items-center gap-4">
                            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Shield className="h-7 w-7" />
                            </span>
                            <div>
                                <h2 className="text-xl font-bold text-foreground">
                                    You&apos;re an admin
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Access the admin panel to manage institutions and authorize
                                    issuers.
                                </p>
                            </div>
                        </div>
                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Link
                                href="/admin"
                                className="group block rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
                            >
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                                    <Shield className="h-6 w-6" />
                                </span>
                                <h3 className="mt-4 font-semibold text-foreground">Admin dashboard</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Authorize institutions, view system stats, and manage the
                                    contract.
                                </p>
                                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                                    Open admin panel
                                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                </span>
                            </Link>
                            <div className="rounded-xl border border-border bg-card p-6">
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/12 text-gold">
                                    <User className="h-6 w-6" />
                                </span>
                                <h3 className="mt-4 font-semibold text-foreground">
                                    Connected wallet
                                </h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Your Stellar address:
                                </p>
                                <p className="mt-2 break-all font-mono text-xs text-foreground">
                                    {address || (
                                        <span className="text-warning">
                                            Not connected — click “Connect Wallet” above
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {userRole === 'student' && (
                <div className="space-y-6">
                    <Card className="p-6">
                        <h3 className="mb-5 text-base font-semibold text-foreground">
                            Account information
                        </h3>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            <InfoField label="Email">{user?.email}</InfoField>
                            <InfoField label="Name">
                                {user?.user_metadata?.name || 'Not set'}
                            </InfoField>
                            <InfoField label="Wallet status">
                                <WalletStatus address={address} />
                            </InfoField>
                        </div>
                    </Card>

                    {!address && (
                        <WalletPromptCard message="Connect your wallet to view your credentials on the blockchain — use the “Connect Wallet” button in the top right." />
                    )}

                    <StudentCredentialsList
                        studentId={user?.id || ''}
                        studentWallet={address || undefined}
                    />
                </div>
            )}
        </DashboardShell>
    );
}

export default function DashboardPage() {
    return (
        <ProtectedRoute>
            <DashboardContent />
        </ProtectedRoute>
    );
}
