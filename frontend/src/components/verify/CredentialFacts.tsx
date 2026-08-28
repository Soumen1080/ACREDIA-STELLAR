'use client';

import { Card } from '@/components/ui/card';
import type { CredentialData } from '@/hooks/useCredentialVerification';

function formatDate(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

function shortenAddress(address: string): string {
    return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-6)}` : address;
}

function Fact({
    label,
    value,
    mono,
}: {
    label: string;
    value: string;
    mono?: boolean;
}) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd
                className={
                    mono
                        ? 'mt-1 break-all font-mono text-sm font-medium text-foreground'
                        : 'mt-1 text-base font-semibold text-foreground'
                }
            >
                {value}
            </dd>
        </div>
    );
}

/**
 * The primary tier: what a human actually needs to read off the credential.
 *
 * No icons per row and no accent borders — a verification record should read
 * like a document, not a marketing panel.
 */
export function CredentialFacts({ credential }: { credential: CredentialData }) {
    const data = credential.metadata?.credentialData;
    const institution = credential.institution?.name || data?.institutionName || '—';
    const holderWallet = credential.student_wallet_address;

    return (
        <Card className="p-5 sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Credential
            </h2>

            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
                {/* The public verify API does not publish the holder's name —
                    on an unauthenticated, token-addressable endpoint the wallet
                    is the identity anchor it does disclose. Rendering a name
                    field here would show a permanent blank. */}
                {data?.studentName ? (
                    <Fact label="Student" value={data.studentName} />
                ) : holderWallet ? (
                    <Fact label="Credential holder" value={shortenAddress(holderWallet)} mono />
                ) : null}

                <Fact label="Issuing institution" value={institution} />
                <Fact label="Credential" value={data?.degree || data?.credentialType || '—'} />
                {data?.major && <Fact label="Field of study" value={data.major} />}
                <Fact
                    label="Issue date"
                    value={formatDate(data?.issueDate ?? credential.issued_at)}
                />
                <Fact label="Token ID" value={`#${credential.token_id}`} />
            </dl>

            {!data?.studentName && holderWallet && (
                <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                    This public record identifies the holder by Stellar address only. Ask the
                    credential holder to share their credential directly if you need to confirm
                    their name.
                </p>
            )}
        </Card>
    );
}
