'use client';

import Link from 'next/link';
import { Home, Printer, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CredentialFacts } from '@/components/verify/CredentialFacts';
import { TechnicalDetails } from '@/components/verify/TechnicalDetails';
import { VerificationSignals } from '@/components/verify/VerificationSignals';
import { VerificationVerdict } from '@/components/verify/VerificationVerdict';
import type {
    CredentialData,
    IntegrityStatus,
    VerificationDetail,
} from '@/hooks/useCredentialVerification';

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
}

/**
 * A completed verification, in strict priority order: the verdict, then the
 * human facts, then the signals behind it, then the cryptographic proof.
 */
export function VerificationReport({
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
    const revoked = credential.revoked;

    return (
        <div className="space-y-4">
            <VerificationVerdict
                kind={revoked ? 'revoked' : 'verified'}
                line={
                    revoked && credential.revoked_at
                        ? `This credential has been revoked by the issuing institution on ${formatDate(credential.revoked_at)} and should no longer be relied on.`
                        : undefined
                }
            />

            <CredentialFacts credential={credential} />

            <VerificationSignals
                credential={credential}
                integrityStatus={integrityStatus}
                detail={detail}
                checkedAt={checkedAt}
            />

            <TechnicalDetails credential={credential} />

            <div className="flex flex-wrap gap-3 pb-8 pt-2 print:hidden">
                <Button asChild>
                    <Link href="/verify">
                        <Shield className="h-4 w-4" />
                        Verify another
                    </Link>
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                    <Printer className="h-4 w-4" />
                    Print or save as PDF
                </Button>
                <Button variant="ghost" asChild>
                    <Link href="/">
                        <Home className="h-4 w-4" />
                        Return home
                    </Link>
                </Button>
            </div>
        </div>
    );
}
