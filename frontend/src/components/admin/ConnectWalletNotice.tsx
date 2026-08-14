'use client';

import { Wallet } from 'lucide-react';
import { ConnectWallet } from '@/components/ui/ConnectWallet';
import { Card } from '@/components/ui/card';

/**
 * Shown inside the admin content area when no wallet is connected.
 *
 * Rendered within the shell rather than as a full-screen block, so the sidebar
 * stays available and the admin is not stranded on a dead end.
 */
export function ConnectWalletNotice({ message }: { message: string }) {
    return (
        <Card className="p-8 text-center sm:p-10">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Wallet className="h-7 w-7" />
            </span>
            <h2 className="mt-5 text-lg font-bold text-foreground">Connect your wallet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
            <div className="mt-6 flex justify-center">
                <ConnectWallet />
            </div>
        </Card>
    );
}
