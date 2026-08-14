'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Building2,
    LayoutDashboard,
    LogOut,
    Menu,
    Settings,
    ShieldCheck,
    X,
} from 'lucide-react';
import { ConnectWallet } from '@/components/ui/ConnectWallet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { activeNetwork } from '@/lib/stellar';

interface AdminNavItem {
    label: string;
    href: string;
    icon: typeof LayoutDashboard;
    description: string;
}

const ADMIN_NAV: AdminNavItem[] = [
    {
        label: 'Overview',
        href: '/admin',
        icon: LayoutDashboard,
        description: 'System statistics',
    },
    {
        label: 'Institutions',
        href: '/admin/institutions',
        icon: Building2,
        description: 'Registered issuers',
    },
    {
        label: 'Authorize issuer',
        href: '/admin/authorize',
        icon: ShieldCheck,
        description: 'Grant issuing rights',
    },
    {
        label: 'Settings',
        href: '/dashboard/settings',
        icon: Settings,
        description: 'Account settings',
    },
];

interface AdminShellProps {
    title: ReactNode;
    subtitle?: ReactNode;
    /** Rendered on the right of the page header — filters, refresh, etc. */
    actions?: ReactNode;
    children: ReactNode;
    onSignOut: () => void;
}

function isActivePath(pathname: string, href: string): boolean {
    // `/admin` must not light up for `/admin/institutions`, but
    // `/admin/institutions` should stay active on its detail pages.
    if (href === '/admin') {
        return pathname === '/admin';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
    const pathname = usePathname();

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
                <Link
                    href="/"
                    className="flex items-center gap-2.5"
                    aria-label="Acredia home"
                    onClick={onNavigate}
                >
                    <Image
                        src="/Acredia.png"
                        alt=""
                        width={34}
                        height={34}
                        className="h-8 w-8 object-contain"
                    />
                    <span className="text-lg font-bold leading-none tracking-tight text-foreground">
                        Acredia
                    </span>
                </Link>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Admin
                </span>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Admin navigation">
                {ADMIN_NAV.map((item) => {
                    const Icon = item.icon;
                    const active = isActivePath(pathname, item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={onNavigate}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                                active
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                            )}
                        >
                            <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold leading-tight">
                                    {item.label}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {item.description}
                                </span>
                            </span>
                        </Link>
                    );
                })}
            </nav>

            <div className="shrink-0 space-y-3 border-t border-border p-3">
                {activeNetwork.kind === 'testnet' && (
                    <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                        <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                            Stellar Testnet
                        </span>
                    </div>
                )}

                <div className="[&>*]:w-full">
                    <ConnectWallet />
                </div>

                <Button
                    onClick={onSignOut}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground hover:text-destructive"
                >
                    <LogOut className="h-4 w-4" />
                    Sign out
                </Button>
            </div>
        </div>
    );
}

export function AdminShell({ title, subtitle, actions, children, onSignOut }: AdminShellProps) {
    const pathname = usePathname();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close the drawer on navigation so the new page is not hidden behind it.
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    // Prevent the page behind the drawer from scrolling while it is open.
    useEffect(() => {
        if (!mobileOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [mobileOpen]);

    useEffect(() => {
        if (!mobileOpen) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMobileOpen(false);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [mobileOpen]);

    return (
        <div className="min-h-screen bg-secondary/30">
            {/* Desktop sidebar */}
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-background lg:block">
                <SidebarContent onSignOut={onSignOut} />
            </aside>

            {/* Mobile drawer */}
            {mobileOpen && (
                <div className="lg:hidden">
                    <button
                        type="button"
                        aria-label="Close navigation"
                        className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm"
                        onClick={() => setMobileOpen(false)}
                    />
                    <aside className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-background shadow-xl">
                        <SidebarContent
                            onSignOut={onSignOut}
                            onNavigate={() => setMobileOpen(false)}
                        />
                    </aside>
                </div>
            )}

            <div className="lg:pl-64">
                {/* Mobile top bar — only holds the drawer toggle. */}
                <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:hidden">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMobileOpen((open) => !open)}
                        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                        aria-expanded={mobileOpen}
                    >
                        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>
                    <Image
                        src="/Acredia.png"
                        alt=""
                        width={30}
                        height={30}
                        className="h-7 w-7 object-contain"
                    />
                    <span className="text-base font-bold tracking-tight text-foreground">
                        Acredia
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                        Admin
                    </span>
                </header>

                <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
                    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                {title}
                            </h1>
                            {subtitle && (
                                <p className="mt-1.5 text-muted-foreground">{subtitle}</p>
                            )}
                        </div>
                        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
                    </div>
                    {children}
                </main>
            </div>
        </div>
    );
}
