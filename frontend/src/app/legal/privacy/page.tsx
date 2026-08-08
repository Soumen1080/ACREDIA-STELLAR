import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
    title: 'Privacy Policy — Acredia',
    description:
        'How Acredia collects, uses, and protects your personal data, your GDPR rights, and how on-chain immutability is handled.',
};

const LAST_UPDATED = '28 July 2026';

export default function PrivacyPolicyPage() {
    return (
        <div className="container-shell py-16 sm:py-24">
            <div className="mx-auto max-w-3xl">
                {/* Header */}
                <div className="mb-12">
                    <p className="text-sm font-medium text-muted-foreground">Legal</p>
                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
                        Privacy Policy
                    </h1>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Last updated: {LAST_UPDATED}
                    </p>
                </div>

                <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10 text-foreground">

                    {/* 1 - Who we are */}
                    <section aria-labelledby="who-we-are">
                        <h2 id="who-we-are" className="text-2xl font-semibold">1. Who we are</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            Acredia ("<strong>Acredia</strong>", "we", "us", or "our") is the data controller
                            for personal data processed through this platform. You can reach our privacy
                            team at{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                                {CONTACT_EMAIL}
                            </a>.
                        </p>
                    </section>

                    {/* 2 - Data we collect */}
                    <section aria-labelledby="data-collected">
                        <h2 id="data-collected" className="text-2xl font-semibold">2. Personal data we collect</h2>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Category</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Data</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Lawful basis</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Where stored</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground">
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Account</td>
                                        <td className="px-4 py-3">Email address, display name, role (student / institution)</td>
                                        <td className="px-4 py-3">Contract (Art. 6(1)(b))</td>
                                        <td className="px-4 py-3">Supabase DB (EU region)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Wallet</td>
                                        <td className="px-4 py-3">Stellar public key (wallet address)</td>
                                        <td className="px-4 py-3">Contract</td>
                                        <td className="px-4 py-3">Supabase DB + Stellar blockchain</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Credential metadata</td>
                                        <td className="px-4 py-3">Student name, degree, grade, institution name (in JSONB metadata field)</td>
                                        <td className="px-4 py-3">Contract</td>
                                        <td className="px-4 py-3">Supabase DB + encrypted IPFS (Pinata)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Verification logs</td>
                                        <td className="px-4 py-3">Verifier-supplied email / organisation (optional), verification outcome</td>
                                        <td className="px-4 py-3">Legitimate interest (fraud prevention, Art. 6(1)(f))</td>
                                        <td className="px-4 py-3">Supabase DB — purged after 90 days</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">On-chain record</td>
                                        <td className="px-4 py-3">SHA-256 hash of credential metadata + IPFS CID pointer</td>
                                        <td className="px-4 py-3">Public interest / legal obligation (Art. 6(1)(e), 17(3)(b))</td>
                                        <td className="px-4 py-3">Stellar blockchain — immutable (see §6)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 3 - How we use data */}
                    <section aria-labelledby="how-used">
                        <h2 id="how-used" className="text-2xl font-semibold">3. How we use your data</h2>
                        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>Create and manage your account and session.</li>
                            <li>Issue and display academic credentials to students.</li>
                            <li>Allow institutions to issue credentials to their students.</li>
                            <li>Enable third-party verifiers to confirm credential authenticity.</li>
                            <li>Detect and prevent fraud, abuse, and unauthorised access.</li>
                            <li>Comply with legal obligations.</li>
                        </ul>
                    </section>

                    {/* 4 - Data sharing */}
                    <section aria-labelledby="data-sharing">
                        <h2 id="data-sharing" className="text-2xl font-semibold">4. Data sharing &amp; sub-processors</h2>
                        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>
                                <strong className="text-foreground">Supabase</strong> — database and authentication
                                (EU-hosted). We have a Data Processing Agreement (DPA) in place.
                            </li>
                            <li>
                                <strong className="text-foreground">Pinata / IPFS</strong> — decentralised file
                                storage for encrypted credential documents. Content is only accessible via the
                                CID (content address); without the encryption key it is unreadable.
                            </li>
                            <li>
                                <strong className="text-foreground">Stellar Network</strong> — public, permissionless
                                blockchain. Only non-PII hashes and wallet addresses (which you control) are written
                                on-chain.
                            </li>
                        </ul>
                        <p className="mt-4 text-muted-foreground leading-7">
                            We do not sell personal data to third parties.
                        </p>
                    </section>

                    {/* 5 - Retention */}
                    <section aria-labelledby="retention">
                        <h2 id="retention" className="text-2xl font-semibold">5. Data retention</h2>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Data</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Retention</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground">
                                    <tr>
                                        <td className="px-4 py-3">Account profile &amp; credentials</td>
                                        <td className="px-4 py-3">Lifetime of account; deleted on erasure request</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">Verification logs</td>
                                        <td className="px-4 py-3">90 days (automatic nightly purge)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">IPFS credential documents</td>
                                        <td className="px-4 py-3">Unpinned on erasure request (content becomes inaccessible)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">On-chain hash record</td>
                                        <td className="px-4 py-3">Permanent (see §6)</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">Erasure request records</td>
                                        <td className="px-4 py-3">7 years (legal compliance)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* 6 - On-chain immutability */}
                    <section aria-labelledby="on-chain">
                        <h2 id="on-chain" className="text-2xl font-semibold">6. On-chain data &amp; immutability</h2>
                        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
                            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                Important notice about blockchain data
                            </p>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                When a credential is issued, a <strong>SHA-256 hash</strong> of the credential
                                metadata is written to the <strong>Stellar blockchain</strong>. This hash is
                                cryptographically irreversible — it does not reveal the credential content — and
                                is considered <strong>non-personal data</strong> under GDPR Recital 26 (data
                                that, without disproportionate effort, cannot be attributed to an identified
                                natural person without additional information).
                            </p>
                            <p className="mt-3 text-sm leading-7 text-muted-foreground">
                                Because blockchain records are technically immutable, this data cannot be erased.
                                We rely on the exemption in <strong>Art. 17(3)(b) GDPR</strong> (necessity for
                                compliance with a legal obligation and the exercise of official authority) and
                                the design principle of pseudonymisation to justify retention. The hash alone
                                reveals nothing about the credential holder without the original document,
                                which is either deleted from IPFS or remains encrypted.
                            </p>
                        </div>
                        <p className="mt-4 text-sm leading-7 text-muted-foreground">
                            See{' '}
                            <a
                                href="https://github.com/soumen0818/ACREDIA-STELLAR/blob/main/docs/legal/data-model.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                            >
                                docs/legal/data-model.md
                            </a>{' '}
                            for the full technical data-model documentation.
                        </p>
                    </section>

                    {/* 7 - Your rights */}
                    <section aria-labelledby="your-rights">
                        <h2 id="your-rights" className="text-2xl font-semibold">7. Your rights</h2>
                        <p className="mt-4 text-muted-foreground leading-7">
                            Under GDPR you have the following rights:
                        </p>
                        <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li><strong className="text-foreground">Access</strong> — request a copy of your personal data.</li>
                            <li><strong className="text-foreground">Rectification</strong> — correct inaccurate personal data.</li>
                            <li>
                                <strong className="text-foreground">Erasure</strong> — delete your account via
                                Dashboard → Settings → Delete Account. This removes your profile, credentials
                                metadata, and IPFS documents. On-chain hashes are not PII and are retained
                                (see §6).
                            </li>
                            <li><strong className="text-foreground">Portability</strong> — export your credential data in JSON/PDF via the dashboard.</li>
                            <li><strong className="text-foreground">Restriction</strong> — restrict processing in certain circumstances.</li>
                            <li><strong className="text-foreground">Objection</strong> — object to processing based on legitimate interest.</li>
                        </ul>
                        <p className="mt-4 text-muted-foreground leading-7">
                            To exercise any right, email{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                                {CONTACT_EMAIL}
                            </a>. We will respond within 30 days.
                        </p>
                    </section>

                    {/* 8 - Cookies */}
                    <section aria-labelledby="cookies">
                        <h2 id="cookies" className="text-2xl font-semibold">8. Cookies &amp; analytics</h2>
                        <p className="mt-4 text-muted-foreground leading-7">
                            Acredia uses only strictly-necessary session cookies required for authentication
                            (Supabase auth tokens stored in browser localStorage). No third-party analytics
                            or advertising cookies are currently deployed. If analytics are added in future,
                            this policy will be updated and a consent banner will be displayed.
                        </p>
                    </section>

                    {/* 9 - Security */}
                    <section aria-labelledby="security">
                        <h2 id="security" className="text-2xl font-semibold">9. Security</h2>
                        <p className="mt-4 text-muted-foreground leading-7">
                            All data in transit is encrypted with TLS. Credential documents stored on IPFS
                            are encrypted with AES-256-GCM before upload. Database access is protected by
                            Row Level Security (RLS) policies. We follow responsible disclosure — see{' '}
                            <a
                                href="https://github.com/soumen0818/ACREDIA-STELLAR/blob/main/SECURITY.md"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                            >
                                SECURITY.md
                            </a>.
                        </p>
                    </section>

                    {/* 10 - Contact */}
                    <section aria-labelledby="contact">
                        <h2 id="contact" className="text-2xl font-semibold">10. Contact &amp; complaints</h2>
                        <p className="mt-4 text-muted-foreground leading-7">
                            For any privacy-related query, contact us at{' '}
                            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                                {CONTACT_EMAIL}
                            </a>.
                            If you believe we have not addressed your concern, you have the right to lodge a
                            complaint with your local supervisory authority (e.g. the ICO in the UK or the
                            relevant EU data protection authority).
                        </p>
                    </section>

                    {/* Related links */}
                    <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8 text-sm text-muted-foreground">
                        <Link href="/legal/terms" className="text-primary underline hover:text-primary/80">
                            Terms of Service →
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
