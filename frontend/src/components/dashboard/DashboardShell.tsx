'use client';

import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { ConnectWallet } from '@/components/ui/ConnectWallet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { activeNetwork } from '@/lib/stellar';

interface DashboardTopbarProps {
    brandBadge?: string;
    brandBadgeClassName?: string;
    onSignOut: () => void;
    /**
     * Hides the wallet / settings / sign-out cluster from the top bar so a page
     * can present those actions inline in its own content instead.
     */
    hideTopbarActions?: boolean;
}

interface DashboardPageHeaderProps {
    title: ReactNode;
    subtitle?: ReactNode;
    icon?: ReactNode;
    className?: string;
}

interface DashboardShellProps extends DashboardTopbarProps, DashboardPageHeaderProps {
    children: ReactNode;
    contentClassName?: string;
}

export function DashboardTopbar({
    brandBadge,
    brandBadgeClassName,
    onSignOut,
    hideTopbarActions,
}: DashboardTopbarProps) {
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
            <div className="container-shell flex h-16 items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2.5" aria-label="Acredia home">
                    <Image
                        src="/Acredia.png"
                        alt=""
                        width={34}
                        height={34}
                        className="h-8 w-8 object-contain"
                    />
                    <div className="flex flex-col">
                        <span className="text-lg font-bold leading-none tracking-tight text-foreground">
                            Acredia
                        </span>
                        {activeNetwork.kind === 'testnet' && (
                            <span className="mt-1 w-fit rounded-sm bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-800">
                                Testnet
                            </span>
                        )}
                    </div>
                    {brandBadge && (
                        <span
                            className={cn(
                                'rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary',
                                brandBadgeClassName,
                            )}
                        >
                            {brandBadge}
                        </span>
                    )}
                </Link>

                {!hideTopbarActions && (
                    <div className="flex items-center gap-2 sm:gap-3">
                        <ConnectWallet />
                        <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            aria-label="Account settings"
                        >
                            <Link href="/dashboard/settings">
                                <Settings className="h-4 w-4" />
                                <span className="hidden sm:inline">Settings</span>
                            </Link>
                        </Button>
                        <Button
                            onClick={onSignOut}
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Sign out</span>
                        </Button>
                    </div>
                )}
            </div>
        </header>
    );
}

export function DashboardPageHeader({
    title,
    subtitle,
    icon,
    className,
}: DashboardPageHeaderProps) {
    return (
        <div className={cn('mb-8', className)}>
            <div className={cn(icon && 'flex items-center gap-3')}>
                {icon}
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {title}
                </h1>
            </div>
            {subtitle && <p className="mt-1.5 text-muted-foreground">{subtitle}</p>}
        </div>
    );
}

export function DashboardShell({
    children,
    contentClassName,
    title,
    subtitle,
    icon,
    className,
    brandBadge,
    brandBadgeClassName,
    onSignOut,
    hideTopbarActions,
}: DashboardShellProps) {
    return (
        <div className="min-h-screen bg-secondary/30">
            <DashboardTopbar
                brandBadge={brandBadge}
                brandBadgeClassName={brandBadgeClassName}
                onSignOut={onSignOut}
                hideTopbarActions={hideTopbarActions}
            />
            <main className={cn('container-shell py-8 sm:py-10', contentClassName)}>
                <DashboardPageHeader
                    title={title}
                    subtitle={subtitle}
                    icon={icon}
                    className={className}
                />
                {children}
            </main>
        </div>
    );
}
