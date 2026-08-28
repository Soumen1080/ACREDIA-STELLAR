'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function AboutError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="About page unavailable"
            description="We were unable to render the About page content right now. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
