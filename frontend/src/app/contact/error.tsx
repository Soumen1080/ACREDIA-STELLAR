'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function ContactError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Contact form unavailable"
            description="We could not load the contact interface. You can try reloading or reach us directly at contact@acredia.io."
            actionLabel="Try again"
            secondaryActionLabel="Back to Home"
            secondaryActionHref="/"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
