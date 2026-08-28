'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function CredentialError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Credential could not be loaded"
            description="We encountered an issue retrieving the credential or verifying it with the blockchain network. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Return to Verification Portal"
            secondaryActionHref="/verify"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
