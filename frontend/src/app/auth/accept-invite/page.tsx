'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/auth/AuthShell';
import { cn } from '@/lib/utils';
import {
    getErrorMessage,
    getPasswordRequirements,
    getPasswordValidationError,
    sanitizeAuthRedirect,
} from '@/lib/authFlow';
import { safeGetSession, supabase, updatePassword } from '@/lib/supabase';
import { captureException } from '@/lib/debug';

/**
 * Invite acceptance for an institution POC.
 *
 * The admin console provisions the account with no password and issues a
 * single-use invite link; following it establishes a session, and this page is
 * where the POC chooses their own password. Acredia staff never see it.
 */
function AcceptInviteForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const nextRedirect = sanitizeAuthRedirect(searchParams.get('next'));

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [checkingSession, setCheckingSession] = useState(true);
    const [hasInviteSession, setHasInviteSession] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [accepted, setAccepted] = useState(false);

    const passwordRequirements = getPasswordRequirements(password);

    useEffect(() => {
        let mounted = true;
        let sessionTimeout: ReturnType<typeof setTimeout> | undefined;

        const finishChecking = (ready: boolean) => {
            if (!mounted) {
                return;
            }

            setHasInviteSession(ready);
            setCheckingSession(false);
        };

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || session?.user) {
                finishChecking(true);
            }
        });

        safeGetSession()
            .then(({ data: { session } }) => {
                if (session?.user) {
                    finishChecking(true);
                    return;
                }

                sessionTimeout = setTimeout(() => finishChecking(false), 1500);
            })
            .catch(() => {
                sessionTimeout = setTimeout(() => finishChecking(false), 1500);
            });

        return () => {
            mounted = false;
            subscription.unsubscribe();
            if (sessionTimeout) {
                clearTimeout(sessionTimeout);
            }
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const passwordError = getPasswordValidationError(password);
        if (passwordError) {
            setError(passwordError);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await updatePassword(password);

            if (updateError) {
                setError(updateError.message);
                return;
            }

            setPassword('');
            setConfirmPassword('');
            setAccepted(true);

            // Record that onboarding completed. A failure here must not block
            // the POC — their password is already set and they can sign in.
            try {
                const {
                    data: { session },
                } = await safeGetSession();

                if (session?.access_token) {
                    await fetch('/api/auth/accept-invite', {
                        method: 'POST',
                        headers: {
                            Authorization: `Bearer ${session.access_token}`,
                        },
                    });
                }
            } catch (markError) {
                captureException(markError, { context: 'acceptInviteMark' });
            }
        } catch (err: unknown) {
            setError(getErrorMessage(err, 'Unable to set your password'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthShell
            title="Set up your Acredia account"
            subtitle="Choose a password to finish activating your institution's account."
            footer={
                <p className="text-center text-sm text-muted-foreground">
                    <Link
                        href={`/auth/login?next=${encodeURIComponent(nextRedirect)}`}
                        className="font-semibold text-primary hover:underline"
                    >
                        Back to sign in
                    </Link>
                </p>
            }
        >
            {checkingSession && (
                <div
                    className="rounded-lg border border-info/25 bg-info/8 px-4 py-3 text-sm text-info"
                    role="status"
                >
                    Checking your invite link…
                </div>
            )}

            {!checkingSession && !hasInviteSession && (
                <div
                    className="rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
                    role="alert"
                >
                    This invite link is invalid, has already been used, or has expired. Contact your
                    Acredia administrator to have a new invite issued.
                </div>
            )}

            {!checkingSession && hasInviteSession && !accepted && (
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="password">Choose a password</Label>
                        <Input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            aria-describedby="password-requirements"
                        />
                        <ul id="password-requirements" className="mt-2 grid gap-1.5 text-sm">
                            {passwordRequirements.map((requirement) => (
                                <li
                                    key={requirement.id}
                                    className={cn(
                                        'flex items-center gap-2',
                                        requirement.isMet ? 'text-success' : 'text-muted-foreground',
                                    )}
                                >
                                    <CheckCircle2
                                        className={cn(
                                            'h-4 w-4',
                                            requirement.isMet
                                                ? 'text-success'
                                                : 'text-muted-foreground/40',
                                        )}
                                        aria-hidden="true"
                                    />
                                    <span>{requirement.label}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirm password</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            aria-invalid={Boolean(confirmPassword) && password !== confirmPassword}
                        />
                    </div>

                    {error && (
                        <div
                            className="rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <Button type="submit" size="lg" disabled={loading} className="w-full">
                        {loading ? 'Activating account…' : 'Activate account'}
                    </Button>
                </form>
            )}

            {accepted && (
                <div className="space-y-4">
                    <div
                        className="rounded-lg border border-success/25 bg-success/8 px-4 py-3 text-sm text-success"
                        role="status"
                    >
                        Your account is active. Your institution's wallet still needs to be
                        authorized by Acredia before you can issue credentials.
                    </div>
                    <Button
                        type="button"
                        size="lg"
                        onClick={() => router.push(nextRedirect)}
                        className="w-full"
                    >
                        Continue to your dashboard
                    </Button>
                </div>
            )}
        </AuthShell>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-background">
                    <div className="text-muted-foreground">Loading…</div>
                </div>
            }
        >
            <AcceptInviteForm />
        </Suspense>
    );
}
