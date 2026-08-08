import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { CONTACT_MAILTO, GITHUB_REPO_URL } from '@/lib/contact';

function GithubMark({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.2-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.75.81 1.2 1.84 1.2 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
        </svg>
    );
}

const footerNav: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
        heading: 'Product',
        links: [
            { label: 'Verified Issuers', href: '/issuers' },
            { label: 'Verify a credential', href: '/verify' },
            { label: 'For institutions', href: '/solutions/institutions' },
            { label: 'For students', href: '/solutions/students' },
            { label: 'About', href: '/about' },
        ],
    },
    {
        heading: 'Account',
        links: [
            { label: 'Sign in', href: '/auth/login' },
            { label: 'Create account', href: '/auth/register' },
            { label: 'Dashboard', href: '/dashboard' },
        ],
    },
    {
        heading: 'Resources',
        links: [
            { label: 'GitHub', href: GITHUB_REPO_URL, external: true },
            { label: 'Stellar Network', href: 'https://stellar.org', external: true },
            { label: 'Stellar Explorer', href: 'https://stellar.expert', external: true },
            { label: 'Contact us', href: CONTACT_MAILTO, external: true },
        ],
    },
    {
        heading: 'Legal',
        links: [
            { label: 'Privacy Policy', href: '/legal/privacy' },
            { label: 'Terms of Service', href: '/legal/terms' },
            { label: 'Data Processing Agreement', href: '/legal/dpa' },
        ],
    },
];

export function SiteFooter() {
    return (
        <footer className="border-t border-border bg-secondary/40">
            <div className="container-shell py-14">
                <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
                    <div className="max-w-xs">
                        <Link href="/" className="flex items-center gap-2.5" aria-label="Acredia home">
                            <Image
                                src="/Acredia.png"
                                alt=""
                                width={36}
                                height={36}
                                className="h-9 w-9 object-contain"
                            />
                            <span className="text-lg font-bold tracking-tight text-foreground">
                                Acredia
                            </span>
                        </Link>
                        <p className="mt-4 text-sm leading-6 text-muted-foreground">
                            Tamper-proof academic credentials on the Stellar network — issued by
                            institutions, owned by students, verifiable by anyone in seconds.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                            </span>
                            Live on Stellar Testnet
                        </div>
                    </div>

                    {footerNav.map((column) => (
                        <div key={column.heading}>
                            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
                                {column.heading}
                            </h3>
                            <ul className="mt-4 space-y-3">
                                {column.links.map((link) => (
                                    <li key={link.label}>
                                        {link.external ? (
                                            <a
                                                href={link.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link
                                                href={link.href}
                                                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} Acredia. All rights reserved.
                    </p>
                    <div className="flex items-center gap-5">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <ShieldCheck className="h-4 w-4 text-success" />
                            Blockchain-secured
                        </span>
                        <a
                            href={GITHUB_REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Acredia on GitHub"
                        >
                            <GithubMark className="h-4 w-4" />
                            GitHub
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
