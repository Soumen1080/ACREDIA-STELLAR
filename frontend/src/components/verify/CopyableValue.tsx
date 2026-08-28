'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * A long cryptographic identifier — hash, CID, contract or wallet address.
 *
 * These are the values most likely to blow out a 390px viewport, so the value
 * wraps (`break-all`) inside a `min-w-0` track and the controls never shrink.
 */
export function CopyableValue({
    label,
    value,
    href,
    hrefLabel = 'Open',
}: {
    label: string;
    value: string;
    /** Optional explorer / gateway link for this value. */
    href?: string;
    hrefLabel?: string;
}) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard access can be blocked; the value stays selectable.
        }
    };

    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs leading-5 text-foreground">
                    {value}
                </code>
                <div className="flex shrink-0 items-center gap-1 print:hidden">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={copy}
                        aria-label={copied ? `${label} copied` : `Copy ${label}`}
                    >
                        {copied ? (
                            <Check className="h-4 w-4 text-success" />
                        ) : (
                            <Copy className="h-4 w-4" />
                        )}
                    </Button>
                    {href && (
                        <Button variant="ghost" size="sm" asChild>
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={`${hrefLabel} ${label} in a new tab`}
                            >
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    )}
                </div>
            </dd>
        </div>
    );
}
