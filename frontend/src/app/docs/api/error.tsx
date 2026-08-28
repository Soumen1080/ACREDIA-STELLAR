'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function DocsApiError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="API Documentation unavailable"
            description="We were unable to render the API reference documentation. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
