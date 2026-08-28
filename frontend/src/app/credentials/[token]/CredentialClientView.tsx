'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SiteNavbar } from '@/components/marketing/SiteNavbar';
import {
    PublicCredentialCard,
    type PublicCredentialCardData,
} from '@/components/student/PublicCredentialCard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getE2eState } from '@/lib/e2e';
import { AlertCircle } from 'lucide-react';

interface CredentialClientViewProps {
    token: string;
}

export function CredentialClientView({ token }: CredentialClientViewProps) {
    const [loading, setLoading] = useState(true);
    const [credential, setCredential] = useState<PublicCredentialCardData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function fetchPublicCredential() {
            setLoading(true);
            setError(null);

            // E2E mock mode fallback
            const e2eState = getE2eState();
            if (e2eState?.enabled) {
                const found = e2eState.issuedCredentials?.find((c) => c.token_id === token);
                if (found) {
                    if (mounted) {
                        setCredential({
                            tokenId: found.token_id,
                            studentName: found.metadata?.credentialData?.studentName || 'Student',
                            degree: found.metadata?.credentialData?.degree || 'Academic Degree',
                            credentialType:
                                found.metadata?.credentialData?.credentialType || 'diploma',
                            institutionName: 'Acredia Academy',
                            issueDate: found.metadata?.credentialData?.issueDate || '2024-01-01',
                            revoked: found.revoked,
                            blockchainHash: found.blockchain_hash,
                            ipfsHash: found.ipfs_hash,
                            isPublic: true,
                        });
                        setLoading(false);
                    }
                    return;
                }
            }

            try {
                const res = await fetch(`/api/verify/${encodeURIComponent(token)}`);
                const data = await res.json();

                if (!res.ok || !data?.success || !data?.credential) {
                    throw new Error(data?.error || 'Credential not found.');
                }

                const c = data.credential;
                if (mounted) {
                    setCredential({
                        tokenId: c.tokenId,
                        studentName: c.studentName || 'Credential Holder',
                        studentWallet: c.studentWallet || undefined,
                        degree: c.degree || 'Academic Credential',
                        credentialType: c.credentialType || 'diploma',
                        institutionName: c.institutionName || 'Issuing Institution',
                        issuerWallet: c.institutionWallet || undefined,
                        issueDate: c.issueDate || '2024-01-01',
                        revoked: Boolean(c.revoked),
                        blockchainHash: c.blockchainHash,
                        ipfsHash: c.ipfsHash,
                        onChainHash: c.onChainHash || undefined,
                        metadataSchemaVersion: c.metadataSchemaVersion ?? undefined,
                        hashAlgorithm: c.hashAlgorithm || undefined,
                        isPublic: true,
                    });
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to load public credential.',
                    );
                }
            } finally {
                if (mounted) setLoading(false);
            }
        }

        void fetchPublicCredential();

        return () => {
            mounted = false;
        };
    }, [token]);

    return (
        <div className="min-h-screen bg-secondary/30">
            <SiteNavbar />

            <main className="container mx-auto px-4 py-12">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="text-center space-y-2">
                        <h1 className="text-3xl font-bold text-foreground">
                            Verified Academic Credential
                        </h1>
                        <p className="text-muted-foreground">
                            Public credential showcase backed by Stellar blockchain verification
                        </p>
                    </div>

                    {loading ? (
                        <Card className="p-8 space-y-6">
                            <Skeleton className="h-8 w-2/3" />
                            <Skeleton className="h-4 w-1/3" />
                            <div className="grid grid-cols-2 gap-4 pt-4">
                                <Skeleton className="h-16 w-full" />
                                <Skeleton className="h-16 w-full" />
                            </div>
                        </Card>
                    ) : error || !credential ? (
                        <Card className="p-8 text-center space-y-4">
                            <div className="flex justify-center">
                                <AlertCircle className="h-12 w-12 text-destructive" />
                            </div>
                            <h2 className="text-2xl font-bold text-foreground">
                                Credential Unavailable
                            </h2>
                            <p className="text-muted-foreground">
                                {error || 'This credential token could not be found.'}
                            </p>
                            <Link
                                href="/verify"
                                className="inline-block mt-4 text-sm font-semibold text-primary underline"
                            >
                                Return to Verification Portal
                            </Link>
                        </Card>
                    ) : (
                        <PublicCredentialCard credential={credential} />
                    )}
                </div>
            </main>
        </div>
    );
}
