'use client';

import { RouteStateScreen } from '@/components/route-state/RouteStateScreen';

export default function AuthError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <RouteStateScreen
            title="Authentication service unavailable"
            description="We encountered an issue communicating with the authentication service. Please try again or return to the sign in page."
            actionLabel="Try again"
            secondaryActionLabel="Sign in"
            secondaryActionHref="/auth/login"
            onAction={reset}
            error={error}
            variant="error"
        />
    );
}
