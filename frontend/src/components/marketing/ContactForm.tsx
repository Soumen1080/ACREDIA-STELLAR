'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Fields = { name: string; email: string; message: string };
type Errors = Partial<Record<keyof Fields | 'form', string>>;

const MESSAGE_MAX = 5000;

/** Mirrors the server schema so users get instant feedback before a round-trip. */
function validate({ name, email, message }: Fields): Errors {
    const errors: Errors = {};

    const trimmedName = name.trim();
    if (trimmedName.length < 2) errors.name = 'Please enter your name (at least 2 characters).';
    else if (trimmedName.length > 100) errors.name = 'Name must be 100 characters or fewer.';

    const trimmedEmail = email.trim();
    if (!trimmedEmail) errors.email = 'Please enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail))
        errors.email = 'Please enter a valid email address.';
    else if (trimmedEmail.length > 254) errors.email = 'Email must be 254 characters or fewer.';

    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 10)
        errors.message = 'Please write at least 10 characters so we can help.';
    else if (trimmedMessage.length > MESSAGE_MAX)
        errors.message = `Message must be ${MESSAGE_MAX} characters or fewer.`;

    return errors;
}

export function ContactForm() {
    const [fields, setFields] = useState<Fields>({ name: '', email: '', message: '' });
    const [errors, setErrors] = useState<Errors>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
    /** Honeypot — hidden from humans; bots fill it in. */
    const [company, setCompany] = useState('');
    const startedAt = useRef<number>(0);

    useEffect(() => {
        startedAt.current = Date.now();
    }, []);

    const update = (key: keyof Fields) => (value: string) => {
        setFields((prev) => ({ ...prev, [key]: value }));
        if (touched[key]) {
            setErrors(validate({ ...fields, [key]: value }));
        }
    };

    const blur = (key: keyof Fields) => () => {
        setTouched((prev) => ({ ...prev, [key]: true }));
        setErrors(validate(fields));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        const nextErrors = validate(fields);
        setErrors(nextErrors);
        setTouched({ name: true, email: true, message: true });
        if (Object.keys(nextErrors).length > 0) return;

        setStatus('sending');
        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: fields.name.trim(),
                    email: fields.email.trim(),
                    message: fields.message.trim(),
                    company,
                    startedAt: startedAt.current,
                }),
            });

            const payload = await response.json().catch(() => ({}));

            if (!response.ok || !payload?.success) {
                setErrors({
                    ...(payload?.fieldErrors ?? {}),
                    form:
                        payload?.error ??
                        (response.status === 429
                            ? 'Too many messages. Please try again later.'
                            : 'Could not send your message. Please try again.'),
                });
                setStatus('idle');
                return;
            }

            setStatus('sent');
            setFields({ name: '', email: '', message: '' });
            setTouched({});
            setErrors({});
        } catch {
            setErrors({ form: 'Network error. Please check your connection and try again.' });
            setStatus('idle');
        }
    };

    if (status === 'sent') {
        return (
            <div
                className="rounded-2xl border border-success/25 bg-success/8 p-8 text-center"
                role="status"
                aria-live="polite"
            >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
                    <Send className="h-6 w-6 text-success" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-foreground">Message sent</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                    Thanks for reaching out — we&apos;ll reply to your email as soon as we can.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => setStatus('idle')}>
                    Send another message
                </Button>
            </div>
        );
    }

    const remaining = MESSAGE_MAX - fields.message.length;

    return (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {errors.form && (
                <div
                    className="rounded-lg border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
                    role="alert"
                >
                    {errors.form}
                </div>
            )}

            <div className="space-y-2">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                    id="contact-name"
                    name="name"
                    autoComplete="name"
                    placeholder="Jane Doe"
                    value={fields.name}
                    onChange={(e) => update('name')(e.target.value)}
                    onBlur={blur('name')}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={errors.name ? 'contact-name-error' : undefined}
                />
                {errors.name && (
                    <p id="contact-name-error" className="text-sm text-destructive">
                        {errors.name}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                    id="contact-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={fields.email}
                    onChange={(e) => update('email')(e.target.value)}
                    onBlur={blur('email')}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'contact-email-error' : undefined}
                />
                {errors.email && (
                    <p id="contact-email-error" className="text-sm text-destructive">
                        {errors.email}
                    </p>
                )}
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="contact-message">Message</Label>
                    <span
                        className={cn(
                            'text-xs',
                            remaining < 0 ? 'text-destructive' : 'text-muted-foreground',
                        )}
                    >
                        {fields.message.length}/{MESSAGE_MAX}
                    </span>
                </div>
                <Textarea
                    id="contact-message"
                    name="message"
                    rows={6}
                    placeholder="Tell us how we can help…"
                    value={fields.message}
                    onChange={(e) => update('message')(e.target.value)}
                    onBlur={blur('message')}
                    aria-invalid={Boolean(errors.message)}
                    aria-describedby={errors.message ? 'contact-message-error' : undefined}
                />
                {errors.message && (
                    <p id="contact-message-error" className="text-sm text-destructive">
                        {errors.message}
                    </p>
                )}
            </div>

            {/* Honeypot: visually hidden and skipped by assistive tech + tab order. */}
            <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] opacity-0">
                <label htmlFor="contact-company">Company (leave blank)</label>
                <input
                    id="contact-company"
                    name="company"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                />
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? (
                    <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Sending…
                    </>
                ) : (
                    <>
                        <Send className="h-4 w-4" />
                        Send message
                    </>
                )}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
                We only use your email to reply. See our{' '}
                <a href="/legal/privacy" className="underline hover:text-foreground">
                    Privacy Policy
                </a>
                .
            </p>
        </form>
    );
}
