'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function IssuersError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Issuer directory unavailable"
            description="We were unable to load the list of verified issuing institutions from the network. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
