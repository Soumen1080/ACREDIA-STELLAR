import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
    title: 'Terms of Service — Acredia',
    description: 'Terms and conditions governing use of the Acredia academic credential platform.',
};

const LAST_UPDATED = '28 July 2026';

export default function TermsOfServicePage() {
    return (
        <div className="container-shell py-16 sm:py-24">
            <div className="mx-auto max-w-3xl">
                {/* Header */}
                <div className="mb-12">
                    <p className="text-sm font-medium text-muted-foreground">Legal</p>
                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
                        Terms of Service
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Last updated: {LAST_UPDATED}
                    </p>
                </div>

                <div className="space-y-10 text-foreground">

                    <section aria-labelledby="acceptance">
                        <h2 id="acceptance" className="text-2xl font-semibold">1. Acceptance of terms</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            By creating an account or otherwise using the Acredia platform ("Service") you
                            agree to be bound by these Terms of Service ("Terms"). If you do not agree, do
                            not use the Service. These Terms apply to all users — students, institutions, and
                            verifiers.
                        </p>
                    </section>

                    <section aria-labelledby="description">
                        <h2 id="description" className="text-2xl font-semibold">2. Service description</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            Acredia is a blockchain-based academic credential platform running on the Stellar
                            network. It allows verified institutions to issue tamper-proof credentials to
                            students, who may share them with verifiers. Credential hashes are anchored
                            on-chain; documents are stored on IPFS.
                        </p>
                    </section>

                    <section aria-labelledby="eligibility">
                        <h2 id="eligibility" className="text-2xl font-semibold">3. Eligibility</h2>
                        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>You must be at least 16 years old to use the Service.</li>
                            <li>
                                Institutions must be accredited educational organisations or authorised
                                issuers. Acredia reserves the right to verify institution eligibility
                                before enabling credential issuance.
                            </li>
                            <li>
                                You are responsible for maintaining the security of your account
                                credentials and Stellar wallet.
                            </li>
                        </ul>
                    </section>

                    <section aria-labelledby="user-obligations">
                        <h2 id="user-obligations" className="text-2xl font-semibold">4. User obligations</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">You agree not to:</p>
                        <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>Issue false or fraudulent credentials.</li>
                            <li>Impersonate an institution or individual.</li>
                            <li>Attempt to tamper with, reverse-engineer, or attack the platform or blockchain contracts.</li>
                            <li>Use the Service for any illegal purpose or in violation of any applicable law.</li>
                            <li>Upload malicious files or attempt to circumvent file-type or size restrictions.</li>
                        </ul>
                    </section>

                    <section aria-labelledby="on-chain">
                        <h2 id="on-chain" className="text-2xl font-semibold">5. On-chain data &amp; immutability</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            When a credential is issued, a cryptographic hash is written to the Stellar
                            blockchain. <strong>This record is permanent and cannot be deleted</strong>, even
                            if you later request account deletion. The hash does not contain personal data —
                            it is a one-way fingerprint of the credential document. You acknowledge this
                            immutability by using the issuance feature.
                        </p>
                        <p className="mt-3 leading-7 text-muted-foreground">
                            Credential documents stored on IPFS are encrypted and will be unpinned on
                            account deletion, rendering them inaccessible. The on-chain hash will remain.
                        </p>
                    </section>

                    <section aria-labelledby="ip">
                        <h2 id="ip" className="text-2xl font-semibold">6. Intellectual property</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            The Acredia platform, including its source code (licensed under MIT), design, and
                            branding, is owned by Acredia. Credential documents and metadata submitted by
                            institutions and students remain their intellectual property.
                        </p>
                    </section>

                    <section aria-labelledby="disclaimer">
                        <h2 id="disclaimer" className="text-2xl font-semibold">7. Disclaimer of warranties</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            The Service is provided "as is" without warranty of any kind. Acredia does not
                            guarantee uninterrupted availability, and is not liable for any loss arising from
                            blockchain network outages, IPFS gateway downtime, or Stellar network fees.
                        </p>
                    </section>

                    <section aria-labelledby="limitation">
                        <h2 id="limitation" className="text-2xl font-semibold">8. Limitation of liability</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            To the maximum extent permitted by applicable law, Acredia shall not be liable for
                            any indirect, incidental, special, or consequential damages arising out of or in
                            connection with these Terms or the Service.
                        </p>
                    </section>

                    <section aria-labelledby="termination">
                        <h2 id="termination" className="text-2xl font-semibold">9. Termination</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            You may delete your account at any time via Dashboard → Settings → Delete Account.
                            Acredia reserves the right to suspend or terminate accounts that violate these
                            Terms. On-chain data cannot be removed upon termination (see §5).
                        </p>
                    </section>

                    <section aria-labelledby="governing-law">
                        <h2 id="governing-law" className="text-2xl font-semibold">10. Governing law</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            These Terms are governed by the laws of India. Any disputes shall be resolved in
                            the courts of West Bengal, India, unless applicable law requires otherwise.
                        </p>
                    </section>

                    <section aria-labelledby="changes">
                        <h2 id="changes" className="text-2xl font-semibold">11. Changes to these Terms</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            We may update these Terms from time to time. We will notify registered users via
                            email at least 14 days before material changes take effect. Continued use after
                            the effective date constitutes acceptance of the revised Terms.
                        </p>
                    </section>

                    <section aria-labelledby="contact">
                        <h2 id="contact" className="text-2xl font-semibold">12. Contact</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            Questions about these Terms?{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                                {CONTACT_EMAIL}
                            </a>
                        </p>
                    </section>

                    {/* Related links */}
                    <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8 text-sm text-muted-foreground">
                        <Link href="/legal/privacy" className="text-primary underline hover:text-primary/80">
                            Privacy Policy →
                        </Link>
                        <Link href="/legal/dpa" className="text-primary underline hover:text-primary/80">
                            Data Processing Agreement →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
