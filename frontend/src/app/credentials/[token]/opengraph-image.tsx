import { ImageResponse } from 'next/og';
import { getServiceRoleClient } from '@/lib/serverAuth';

export const runtime = 'edge';
export const alt = 'Verified Academic Credential';
export const size = {
    width: 1200,
    height: 630,
};
export const contentType = 'image/png';

export default async function Image({
    params,
}: {
    params: Promise<{ token: string }>;
}) {
    const { token } = await params;
    const cleanToken = token?.trim() || '';

    let degree = 'Academic Credential';
    let institutionName = 'Authorized Institution';
    let studentName = 'Credential Holder';
    let isRevoked = false;
    let issueDate = '';

    try {
        const supabase = getServiceRoleClient();
        const { data: credential } = await supabase
            .from('credentials')
            .select(
                `
                token_id,
                metadata,
                revoked,
                issued_at,
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

            degree =
                (credData.degree as string) ||
                (credData.credentialType as string) ||
                'Academic Credential';
            const instData = Array.isArray(credential.institution)
                ? credential.institution[0]
                : credential.institution;
            institutionName =
                instData?.name ||
                (credData.institutionName as string) ||
                'Authorized Institution';
            studentName = (credData.studentName as string) || 'Credential Holder';
            isRevoked = Boolean(credential.revoked);
            issueDate = (credData.issueDate as string) || (credential.issued_at ? String(credential.issued_at).slice(0, 10) : '');
        }
    } catch {
        // Use defaults if db is unreachable
    }

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    backgroundColor: '#090D16',
                    backgroundImage:
                        'radial-gradient(circle at 25% 25%, #1E293B 0%, #090D16 65%), radial-gradient(circle at 75% 75%, #1E1B4B 0%, #090D16 70%)',
                    padding: '60px 70px',
                    fontFamily: 'sans-serif',
                    color: '#F8FAFC',
                }}
            >
                {/* Header: Brand and Verified Status Badge */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}
                    >
                        <div
                            style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '22px',
                                fontWeight: 'bold',
                                color: '#FFFFFF',
                            }}
                        >
                            A
                        </div>
                        <span
                            style={{
                                fontSize: '26px',
                                fontWeight: '800',
                                letterSpacing: '0.05em',
                                background: 'linear-gradient(135deg, #FFFFFF 0%, #94A3B8 100%)',
                                backgroundClip: 'text',
                                color: 'transparent',
                            }}
                        >
                            ACREDIA
                        </span>
                        <span
                            style={{
                                fontSize: '13px',
                                color: '#64748B',
                                borderLeft: '1px solid #334155',
                                paddingLeft: '12px',
                                letterSpacing: '0.08em',
                                textTransform: 'uppercase',
                            }}
                        >
                            Stellar Blockchain
                        </span>
                    </div>

                    {/* Status Pill */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: isRevoked ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            border: `1px solid ${isRevoked ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                            borderRadius: '9999px',
                            padding: '8px 18px',
                            color: isRevoked ? '#F87171' : '#34D399',
                            fontSize: '15px',
                            fontWeight: '600',
                            letterSpacing: '0.04em',
                        }}
                    >
                        <span>{isRevoked ? '✕ REVOKED' : '✓ VERIFIED ON-CHAIN'}</span>
                    </div>
                </div>

                {/* Main Body: Degree & Recipient Info */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        maxWidth: '1000px',
                    }}
                >
                    <div
                        style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: '#38BDF8',
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                        }}
                    >
                        Academic Credential #{cleanToken}
                    </div>

                    <div
                        style={{
                            fontSize: degree.length > 35 ? '44px' : '52px',
                            fontWeight: '800',
                            color: '#FFFFFF',
                            lineHeight: 1.15,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {degree}
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '30px',
                            marginTop: '8px',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', color: '#94A3B8', textTransform: 'uppercase' }}>
                                Recipient
                            </span>
                            <span style={{ fontSize: '22px', fontWeight: '700', color: '#F1F5F9' }}>
                                {studentName}
                            </span>
                        </div>

                        <div
                            style={{
                                width: '1px',
                                height: '36px',
                                backgroundColor: '#334155',
                            }}
                        />

                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', color: '#94A3B8', textTransform: 'uppercase' }}>
                                Issuing Institution
                            </span>
                            <span style={{ fontSize: '22px', fontWeight: '700', color: '#F1F5F9' }}>
                                {institutionName}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Footer: Verification & Date */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderTop: '1px solid #1E293B',
                        paddingTop: '20px',
                        width: '100%',
                    }}
                >
                    <span style={{ fontSize: '14px', color: '#64748B' }}>
                        Cryptographically sealed and independently verifiable
                    </span>

                    {issueDate ? (
                        <span style={{ fontSize: '14px', color: '#94A3B8' }}>
                            Issued: {issueDate}
                        </span>
                    ) : null}
                </div>
            </div>
        ),
        {
            ...size,
        },
    );
}
