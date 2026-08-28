import { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
    title: 'Verify Academic Credentials',
    description:
        'Instantly verify the cryptographic authenticity and on-chain status of academic credentials issued on the Stellar blockchain.',
    alternates: {
        canonical: '/verify',
    },
    openGraph: {
        title: 'Verify Academic Credentials | Acredia',
        description:
            'Instantly verify the cryptographic authenticity and on-chain status of academic credentials issued on the Stellar blockchain.',
        url: '/verify',
        images: [
            {
                url: '/verify1.png',
                width: 1200,
                height: 630,
                alt: 'Acredia Credential Verification Portal',
            },
        ],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Verify Academic Credentials | Acredia',
        description:
            'Instantly verify the cryptographic authenticity and on-chain status of academic credentials issued on the Stellar blockchain.',
        images: ['/verify1.png'],
    },
};

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
