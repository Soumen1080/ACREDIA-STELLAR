'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { captureException, debugLog, debugWarn } from '@/lib/debug';
import { safeGetSession, supabase } from '@/lib/supabase';
import { useStellarAccount } from '@/contexts/StellarContext';
import { useAuth } from '@/contexts/AuthContext';
import { resolveInstitutionIdForUser } from '@/lib/institutionMembership';

export interface InstitutionProfile {
    /** Empty until the institution row has been loaded or created. */
    institutionId: string;
    institutionName: string;
    /** The connected wallet, which is what issuance signs with. */
    institutionWallet: string;
    /** KYB status: `pending` | `verified` | `rejected` | `suspended`. */
    status: string;
    /** Wallet address persisted on the institution row. */
    linkedWalletAddress: string | null;
    /** Currently connected wallet address, or `null`. */
    address: string | null;
    loading: boolean;
    linkingWallet: boolean;
}

/**
 * Loads (and, for a first-time signup, creates) the signed-in user's
 * institution row, and keeps the connected wallet linked to it.
 *
 * This used to live inline in `/dashboard`; every institution console route
 * needs it now that the tabs became real pages.
 */
export function useInstitutionProfile(): InstitutionProfile {
    const { user, userRole } = useAuth();
    const { address } = useStellarAccount();

    const [institutionId, setInstitutionId] = useState('');
    const [institutionWalletAddress, setInstitutionWalletAddress] = useState<string | null>(null);
    const [institutionStatus, setInstitutionStatus] = useState<string>('pending');
    const [loadingInstitution, setLoadingInstitution] = useState(true);
    const [linkingInstitutionWallet, setLinkingInstitutionWallet] = useState(false);
    const walletLinkInFlight = useRef<string | null>(null);

    useEffect(() => {
        const fetchInstitutionId = async () => {
            if (!user || userRole !== 'institution') {
                setInstitutionId('');
                setInstitutionWalletAddress(null);
                setInstitutionStatus('pending');
                // A still-resolving role is not a final answer — keep the
                // loading state so callers do not flash an error card.
                setLoadingInstitution(userRole === 'loading');
                return;
            }

            try {
                const institutionId = await resolveInstitutionIdForUser(supabase, user.id);

                const { data, error } = institutionId
                    ? await supabase
                          .from('institutions')
                          .select('id, wallet_address, status')
                          .eq('id', institutionId)
                          .maybeSingle()
                    : { data: null, error: null };

                if (error) {
                    captureException(error, { context: 'fetchInstitutionId' });
                    toast.error('Failed to load institution data');
                    return;
                }

                if (data) {
                    setInstitutionId(data.id);
                    setInstitutionWalletAddress(data.wallet_address ?? null);
                    setInstitutionStatus(data.status || 'pending');
                    debugLog('Institution profile loaded for dashboard.');
                    return;
                }

                debugWarn('Institution record was missing and will be created.');
                toast.warning('Institution record not found. Creating profile...');

                const { data: newInstitution, error: createError } = await supabase
                    .from('institutions')
                    .insert([
                        {
                            auth_user_id: user.id,
                            email: user.email,
                            name: user.email?.split('@')[0] || 'Institution',
                        },
                    ])
                    .select('id, wallet_address, status')
                    .single();

                if (!createError && newInstitution?.id) {
                    await supabase.from('institution_users').insert([
                        {
                            institution_id: newInstitution.id,
                            auth_user_id: user.id,
                            role: 'owner',
                            status: 'active',
                        },
                    ]);
                }

                if (createError) {
                    captureException(createError, { context: 'createInstitution' });
                    toast.error('Failed to create institution profile');
                    return;
                }

                if (newInstitution) {
                    setInstitutionId(newInstitution.id);
                    setInstitutionWalletAddress(newInstitution.wallet_address ?? null);
                    setInstitutionStatus(newInstitution.status || 'pending');
                    toast.success('Institution profile created');
                }
            } catch (error) {
                captureException(error, { context: 'fetchInstitutionId_catch' });
                toast.error('An unexpected error occurred');
            } finally {
                setLoadingInstitution(false);
            }
        };

        fetchInstitutionId();
    }, [user, userRole]);

    useEffect(() => {
        const linkConnectedWallet = async () => {
            if (!user?.id || userRole !== 'institution' || !institutionId || !address) {
                return;
            }

            if (institutionWalletAddress?.toLowerCase() === address.toLowerCase()) {
                return;
            }

            if (walletLinkInFlight.current === address) {
                return;
            }

            walletLinkInFlight.current = address;
            setLinkingInstitutionWallet(true);

            try {
                const {
                    data: { session },
                    error: sessionError,
                } = await safeGetSession();

                if (sessionError || !session?.access_token) {
                    throw new Error('Your session expired. Please sign in again.');
                }

                const response = await fetch('/api/institution/link-wallet', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ walletAddress: address }),
                });
                const payload = await response.json();

                if (!response.ok || !payload?.success) {
                    throw new Error(payload?.error || 'Failed to link institution wallet');
                }

                // Always sync local state with the persisted wallet address so
                // the mismatch guard does not keep re-triggering on re-renders,
                // regardless of whether the DB row actually changed.
                setInstitutionWalletAddress(payload.walletAddress ?? address);
                debugLog('Connected wallet linked to institution profile.');
                if (payload.changed) {
                    toast.success('Institution wallet linked');
                }
            } catch (error) {
                captureException(error, { context: 'linkConnectedWallet' });
                toast.error('Failed to link connected wallet to your institution');
            } finally {
                // Always clear the in-flight guard so a failed or interrupted
                // attempt never permanently blocks future link attempts
                // (e.g. after React StrictMode double-invocation or a transient error).
                walletLinkInFlight.current = null;
                setLinkingInstitutionWallet(false);
            }
        };

        linkConnectedWallet();
    }, [address, institutionId, institutionWalletAddress, user?.id, userRole]);

    return {
        institutionId,
        institutionName: user?.user_metadata?.name || 'Institution',
        institutionWallet: address || '',
        status: institutionStatus,
        linkedWalletAddress: institutionWalletAddress,
        address,
        loading: loadingInstitution,
        linkingWallet: linkingInstitutionWallet,
    };
}
