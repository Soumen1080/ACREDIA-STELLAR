'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getContractOwner } from '@/lib/contracts';
import { debugLog, debugWarn, captureException } from '@/lib/debug';
import { useStellarAccount } from '@/contexts/StellarContext';

interface ContractOwnerState {
    /** The contract's owner address, or '' if it could not be read. */
    contractOwner: string;
    /** True when the connected wallet is the contract owner. */
    isOwner: boolean;
    /** True while the on-chain ownership check is in flight. */
    isChecking: boolean;
    /** The currently connected wallet address, if any. */
    address: string | null;
}

/**
 * Resolves whether the connected wallet owns the credential contract.
 *
 * Ownership gates on-chain admin actions (authorizing issuers). It is checked
 * against the contract itself rather than any database field, so a compromised
 * app-level admin account still cannot authorize issuers.
 *
 * Toasts fire once per connected address: without this guard, remounting an
 * admin page — or navigating between them — re-announced the same result.
 */
export function useContractOwner(): ContractOwnerState {
    const { address } = useStellarAccount();
    const [contractOwner, setContractOwner] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [isChecking, setIsChecking] = useState(true);
    const announcedFor = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const checkOwnership = async () => {
            if (!address) {
                setIsChecking(false);
                setIsOwner(false);
                setContractOwner('');
                return;
            }

            setIsChecking(true);

            try {
                const owner = await getContractOwner(address);
                if (cancelled) return;

                const ownerCheck = address.toLowerCase() === owner.toLowerCase();
                setContractOwner(owner);
                setIsOwner(ownerCheck);

                if (announcedFor.current !== address) {
                    announcedFor.current = address;

                    if (ownerCheck) {
                        debugLog('Connected wallet verified as contract owner.');
                        toast.success('Verified as contract owner');
                    } else {
                        debugWarn('Connected wallet is not the contract owner.');
                        toast.error('This wallet is not the contract owner');
                    }
                }
            } catch (error) {
                if (cancelled) return;
                captureException(error, { context: 'useContractOwner' });
                toast.error(
                    'Failed to verify ownership: ' +
                        (error instanceof Error ? error.message : 'unknown error'),
                );
            } finally {
                if (!cancelled) {
                    setIsChecking(false);
                }
            }
        };

        checkOwnership();

        return () => {
            cancelled = true;
        };
    }, [address]);

    return { contractOwner, isOwner, isChecking, address };
}
