'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function SolutionsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Solutions page unavailable"
            description="We could not load the solutions overview. Please try again."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
