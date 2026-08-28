'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type {
    CredentialData,
    IntegrityStatus,
    VerificationDetail,
} from '@/hooks/useCredentialVerification';

type Tone = 'positive' | 'negative' | 'caution' | 'neutral';

const TONE_CLASS: Record<Tone, string> = {
    positive: 'border-success/30 bg-success/10 text-success',
    negative: 'border-destructive/30 bg-destructive/10 text-destructive',
    caution: 'border-warning/30 bg-warning/10 text-warning',
    neutral: 'border-border bg-secondary text-muted-foreground',
};

interface Signal {
    label: string;
    /** The verdict for this one signal, in the wording verifiers see. */
    state: string;
    tone: Tone;
    /** What this signal establishes. */
    means: string;
    /** What it explicitly does *not* establish — the part people get wrong. */
    doesNotMean: string;
}

function SignalRow({ signal }: { signal: Signal }) {
    return (
        <div className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h3 className="text-sm font-semibold text-foreground">{signal.label}</h3>
                <span
                    className={cn(
                        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                        TONE_CLASS[signal.tone],
                    )}
                >
                    {signal.state}
                </span>
            </div>
            <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
                {signal.means}{' '}
                <span className="text-foreground">It does not mean {signal.doesNotMean}</span>
            </p>
        </div>
    );
}

function integritySignal(status: IntegrityStatus): Signal {
    if (status === 'match') {
        return {
            label: 'Document integrity',
            state: 'Document Integrity: Authentic',
            tone: 'positive',
            means: 'The document was fetched from IPFS and its content hash exactly matches the hash recorded on-chain, so nothing about it has been altered since issuance.',
            doesNotMean: 'the credential is still valid — an untampered document can still have been revoked.',
        };
    }
    if (status === 'mismatch') {
        return {
            label: 'Document integrity',
            state: 'Document Integrity: Failed',
            tone: 'negative',
            means: 'The document retrieved from the on-chain IPFS CID does not hash to the value recorded on-chain. Do not rely on its contents.',
            doesNotMean: 'the credential was revoked — this is a separate failure of the document itself.',
        };
    }
    return {
        label: 'Document integrity',
        state: 'Document Integrity: Unavailable',
        tone: 'neutral',
        means: 'The IPFS-hosted document could not be retrieved, so its contents could not be checked against the on-chain hash.',
        doesNotMean: 'the credential is invalid — only that this one check could not run right now.',
    };
}

/**
 * The secondary tier: the independent signals behind the verdict.
 *
 * Revocation and document integrity are genuinely separate facts — a revoked
 * credential can still have a perfectly untampered document, and an
 * unrevoked one can have a document that fails its hash check. Presenting them
 * as one blended "status" is the mistake this layout exists to prevent, so each
 * gets its own label, its own state, and an explicit line on what it does *not*
 * establish (ACREDIA-STELLAR#163, #226).
 */
export function VerificationSignals({
    credential,
    integrityStatus,
    detail,
    checkedAt,
}: {
    credential: CredentialData;
    integrityStatus: IntegrityStatus | null;
    detail: VerificationDetail | null;
    checkedAt: string;
}) {
    const signals: Signal[] = [];

    if (detail) {
        const onChain = detail.onChainFound && detail.onChainMatch;
        signals.push({
            label: 'Blockchain record',
            state: onChain ? 'Blockchain Verified' : 'Not confirmed on-chain',
            tone: onChain ? 'positive' : 'negative',
            means: onChain
                ? 'A record for this token exists on the Stellar ledger and its issuer, holder, and document hash match what this page shows.'
                : 'The on-chain record for this token is missing or does not match the details held off-chain.',
            doesNotMean: onChain
                ? 'the document itself was checked — that is the integrity signal below.'
                : 'the document was tampered with — that is a separate check.',
        });
    }

    signals.push({
        label: 'Revocation status',
        state: credential.revoked ? 'Revoked' : 'Active',
        tone: credential.revoked ? 'caution' : 'positive',
        means: credential.revoked
            ? 'The issuing institution has withdrawn this credential.'
            : 'The issuing institution has not withdrawn this credential.',
        doesNotMean: credential.revoked
            ? 'the document was forged — revocation is a decision by the issuer, not a tampering signal.'
            : 'the document is untampered — that is the integrity signal below.',
    });

    if (integrityStatus) {
        signals.push(integritySignal(integrityStatus));
    }

    signals.push({
        label: 'Issuer authorization',
        state:
            credential.issuer_authorized === true
                ? 'Authorized'
                : credential.issuer_authorized === false
                  ? 'Not authorized'
                  : 'Unknown',
        tone:
            credential.issuer_authorized === true
                ? 'positive'
                : credential.issuer_authorized === false
                  ? 'caution'
                  : 'neutral',
        means:
            credential.issuer_authorized === true
                ? 'The institution that issued this credential is currently authorized to issue on-chain.'
                : credential.issuer_authorized === false
                  ? 'The issuing institution is no longer authorized to issue new credentials.'
                  : 'The issuer’s current authorization could not be determined.',
        doesNotMean:
            credential.issuer_authorized === false
                ? 'this credential is void — it was validly issued at the time.'
                : 'anything about whether this particular credential was revoked.',
    });

    return (
        <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Verification signals
                </h2>
                <p className="text-xs text-muted-foreground">Checked {checkedAt}</p>
            </div>

            <div className="mt-4 divide-y divide-border">
                {signals.map((signal) => (
                    <SignalRow key={signal.label} signal={signal} />
                ))}
            </div>
        </Card>
    );
}
