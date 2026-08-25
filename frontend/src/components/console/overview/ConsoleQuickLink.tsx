'use client';

import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

/** Card-sized shortcut into another console section. */
export function ConsoleQuickLink({
    href,
    icon: Icon,
    iconClassName = 'bg-primary/10 text-primary',
    title,
    description,
    cta,
}: {
    href: string;
    icon: LucideIcon;
    iconClassName?: string;
    title: string;
    description: string;
    cta: string;
}) {
    return (
        <Link
            href={href}
            className="group block rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2"
        >
            <span
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${iconClassName}`}
            >
                <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 font-semibold text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                {cta}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
        </Link>
    );
}
