'use client';

import { Wallet } from 'lucide-react';
import { AdminGate } from '@/components/admin/AdminGate';
import { ConnectWallet } from '@/components/ui/ConnectWallet';

/**
 * The wallet gate for admin pages whose work cannot start without a connected
 * wallet. The sidebar keeps its own Connect Wallet control, so the action stays
 * reachable from either place.
 */
export function ConnectWalletNotice({ message }: { message: string }) {
    return (
        <AdminGate icon={Wallet} title="Wallet connection required" message={message}>
            <div className="flex justify-center">
                <ConnectWallet />
            </div>
        </AdminGate>
    );
}
