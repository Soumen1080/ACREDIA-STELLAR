import type { RoleState } from '@/types';

export interface E2eSessionUser {
    id: string;
    email: string;
    user_metadata?: Record<string, unknown>;
}

export interface E2eSession {
    user: E2eSessionUser;
    access_token: string;
    expires_at?: number;
}

export interface E2eIssuedCredential {
    id: string;
    token_id: string;
    ipfs_hash: string;
    blockchain_hash: string;
    metadata: {
        credentialData?: {
            studentName?: string;
            degree?: string;
            major?: string;
            gpa?: string;
            issueDate?: string;
            credentialType?: string;
        };
    } | null;
    issued_at: string;
    revoked: boolean;
    issuer_wallet_address: string;
    student_wallet_address: string;
}

export interface E2eAdminStats {
    totalInstitutions: number;
    authorizedInstitutions: number;
    totalCredentials: number;
    activeCredentials: number;
    totalStudents: number;
    verificationActivity: {
        totalAttempts: number;
        attemptsLast24h: number;
        resultCounts: Record<string, number>;
    };
}

export interface E2eAdminInstitution {
    id: string;
    name: string;
    email: string;
    walletAddress: string | null;
    verified: boolean;
    status: string;
    authorizationTxHash: string | null;
    createdAt: string | null;
    credentialCount: number;
    activeCredentialCount: number;
}

export interface E2eState {
    enabled?: boolean;
    session?: E2eSession | null;
    role?: RoleState;
    walletAddress?: string | null;
    contractOwner?: string;
    authorizedIssuers?: string[];
    institution?: {
        id: string;
        name: string;
        walletAddress: string;
    };
    stats?: E2eAdminStats;
    /** Rows served by the admin institutions route. */
    adminInstitutions?: E2eAdminInstitution[];
    nextTokenId?: number;
    issuedCredentials?: E2eIssuedCredential[];
}

declare global {
    interface Window {
        __ACREDIA_E2E__?: E2eState;
    }
}

export function getE2eState(): E2eState | null {
    if (typeof window === 'undefined') {
        return null;
    }

    return window.__ACREDIA_E2E__ ?? null;
}

export function updateE2eState(mutator: (state: E2eState) => void): E2eState | null {
    const state = getE2eState();
    if (!state) {
        return null;
    }

    mutator(state);
    if (typeof window !== 'undefined') {
        window.sessionStorage.setItem('__ACREDIA_E2E__', JSON.stringify(state));
    }
    return state;
}