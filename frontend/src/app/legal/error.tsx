'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function LegalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Legal document unavailable"
            description="We could not load the legal policies and documentation. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
