import type { Metadata } from 'next';
import { getServiceRoleClient } from '@/lib/serverAuth';
import { CredentialClientView } from './CredentialClientView';

interface Props {
    params: Promise<{
        token: string;
    }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { token } = await params;
    const cleanToken = token?.trim();

    if (!cleanToken) {
        return {
            title: 'Academic Credential',
            description: 'Verify and view academic credentials on the Stellar blockchain.',
        };
    }

    try {
        const supabase = getServiceRoleClient();
        const { data: credential } = await supabase
            .from('credentials')
            .select(
                `
                token_id,
                metadata,
                revoked,
                institution:institutions!credentials_institution_id_fkey (
                    name
                )
            `,
            )
            .eq('token_id', cleanToken)
            .maybeSingle();

        if (credential) {
            const rawMeta = (credential.metadata as Record<string, unknown> | null) ?? {};
            const credData = (rawMeta.credentialData as Record<string, unknown> | null) ?? {};

            const degree =
                (credData.degree as string) ||
                (credData.credentialType as string) ||
                'Academic Credential';
            const instData = Array.isArray(credential.institution)
                ? credential.institution[0]
                : credential.institution;
            const institutionName =
                instData?.name ||
                (credData.institutionName as string) ||
                'Authorized Institution';
            const studentName = (credData.studentName as string) || 'Credential Holder';
            const isRevoked = Boolean(credential.revoked);

            const title = `${degree} — ${institutionName}`;
            const description = isRevoked
                ? `Academic credential issued to ${studentName} by ${institutionName} (Revoked). Verified on Stellar blockchain.`
                : `Verified ${degree} issued to ${studentName} by ${institutionName}. Tamper-proof and authenticated on the Stellar blockchain.`;

            return {
                title: `${degree} | Verified Credential`,
                description,
                alternates: {
                    canonical: `/credentials/${encodeURIComponent(cleanToken)}`,
                },
                openGraph: {
                    title,
                    description,
                    url: `/credentials/${encodeURIComponent(cleanToken)}`,
                    siteName: 'Acredia',
                    type: 'article',
                },
                twitter: {
                    card: 'summary_large_image',
                    title,
                    description,
                },
            };
        }
    } catch {
        // Fall back gracefully if DB is unreachable during crawler request
    }

    return {
        title: `Academic Credential #${cleanToken}`,
        description: `View and verify academic credential token #${cleanToken} on the Stellar blockchain.`,
        alternates: {
            canonical: `/credentials/${encodeURIComponent(cleanToken)}`,
        },
        openGraph: {
            title: `Academic Credential #${cleanToken} | Acredia`,
            description: `View and verify academic credential token #${cleanToken} on the Stellar blockchain.`,
            url: `/credentials/${encodeURIComponent(cleanToken)}`,
            siteName: 'Acredia',
            type: 'website',
        },
        twitter: {
            card: 'summary_large_image',
            title: `Academic Credential #${cleanToken} | Acredia`,
            description: `View and verify academic credential token #${cleanToken} on the Stellar blockchain.`,
        },
    };
}

export default async function PublicCredentialPage({ params }: Props) {
    const { token } = await params;
    return <CredentialClientView token={token} />;
}
