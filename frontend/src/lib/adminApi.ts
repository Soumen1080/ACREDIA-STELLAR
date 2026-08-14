import { safeGetSession } from '@/lib/supabase';

export interface AdminInstitutionSummary {
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

export interface AdminInstitutionCredential {
    id: string;
    tokenId: string;
    studentWalletAddress: string | null;
    issuedAt: string | null;
    revoked: boolean;
    revokedAt: string | null;
    degree: string | null;
}

/**
 * Calls an admin API route with the caller's Supabase session attached.
 *
 * Admin routes are protected server-side (session + email allowlist + role), so
 * this only forwards credentials — it never decides access on its own.
 */
export async function adminFetch<T>(path: string): Promise<T> {
    const {
        data: { session },
    } = await safeGetSession();

    if (!session?.access_token) {
        throw new Error('Your session expired. Please sign in again.');
    }

    const response = await fetch(path, {
        headers: { Authorization: `Bearer ${session.access_token}` },
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Request failed');
    }

    return payload as T;
}

export function formatDate(value: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export function shortenAddress(value: string | null): string {
    if (!value) return '—';
    if (value.length <= 12) return value;
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

const STATUS_STYLES: Record<string, string> = {
    verified: 'bg-success/12 text-success border-success/25',
    pending: 'bg-warning/12 text-warning border-warning/25',
    suspended: 'bg-destructive/12 text-destructive border-destructive/25',
    rejected: 'bg-destructive/12 text-destructive border-destructive/25',
};

export function statusBadgeClass(status: string): string {
    return STATUS_STYLES[status] ?? 'bg-secondary text-muted-foreground border-border';
}
