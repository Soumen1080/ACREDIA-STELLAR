'use client';

import { useEffect, useState } from 'react';
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
 * A successful check is deliberately silent — every admin page already shows
 * owner status in the page itself, so a toast on each visit was pure noise.
 * Only a *failed* check warns, and only once per address: the tracking lives at
 * module scope rather than in a ref because navigating between admin pages
 * unmounts the hook, which would reset a ref and re-fire the warning.
 */
let warnedForAddress: string | null = null;

export function useContractOwner(): ContractOwnerState {
    const { address } = useStellarAccount();
    const [contractOwner, setContractOwner] = useState('');
    const [isOwner, setIsOwner] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

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

                if (ownerCheck) {
                    debugLog('Connected wallet verified as contract owner.');
                    // No toast: the page itself already shows owner status.
                    warnedForAddress = null;
                } else {
                    debugWarn('Connected wallet is not the contract owner.');
                    if (warnedForAddress !== address) {
                        warnedForAddress = address;
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
