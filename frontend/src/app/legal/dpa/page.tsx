import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
    title: 'Data Processing Agreement — Acredia',
    description:
        'Data Processing Agreement (DPA) template for institutions using Acredia as a data processor.',
};

const LAST_UPDATED = '28 July 2026';

export default function DpaPage() {
    return (
        <div className="container-shell py-16 sm:py-24">
            <div className="mx-auto max-w-3xl">
                {/* Header */}
                <div className="mb-12">
                    <p className="text-sm font-medium text-muted-foreground">Legal</p>
                    <h1 className="mt-2 text-4xl font-bold tracking-tight text-foreground">
                        Data Processing Agreement
                    </h1>
                    <p className="mt-3 text-muted-foreground leading-7">
                        This Data Processing Agreement ("DPA") template applies between Acredia
                        ("<strong>Processor</strong>") and an institution using the Acredia platform
                        ("<strong>Controller</strong>"). To execute a binding DPA, contact us at{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                            {CONTACT_EMAIL}
                        </a>.
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Template version: {LAST_UPDATED}
                    </p>

                    <div className="mt-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4 text-sm text-muted-foreground">
                        <strong className="text-foreground">Note:</strong> This is a template for
                        illustrative purposes. Institutions should have legal counsel review any DPA
                        before execution. Contact{' '}
                        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">
                            {CONTACT_EMAIL}
                        </a>{' '}
                        to request a countersigned copy.
                    </div>
                </div>

                <div className="space-y-10 text-foreground">

                    <section aria-labelledby="definitions">
                        <h2 id="definitions" className="text-2xl font-semibold">1. Definitions</h2>
                        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li><strong className="text-foreground">"Controller"</strong> — the institution that determines the purposes and means of processing student personal data.</li>
                            <li><strong className="text-foreground">"Processor"</strong> — Acredia, which processes personal data on behalf of the Controller.</li>
                            <li><strong className="text-foreground">"Personal Data"</strong> — any information relating to an identified or identifiable natural person, as defined in GDPR Art. 4(1).</li>
                            <li><strong className="text-foreground">"Processing"</strong> — any operation performed on personal data, including storage, retrieval, and deletion.</li>
                            <li><strong className="text-foreground">"Sub-processor"</strong> — a third party engaged by the Processor to process personal data (see Schedule B).</li>
                        </ul>
                    </section>

                    <section aria-labelledby="scope">
                        <h2 id="scope" className="text-2xl font-semibold">2. Subject matter &amp; scope</h2>
                        <p className="mt-4 leading-7 text-muted-foreground">
                            Acredia processes student personal data solely to provide the credential
                            issuance and verification services described in the Terms of Service. The
                            categories of personal data processed and the purposes of processing are set
                            out in <strong>Schedule A</strong>.
                        </p>
                    </section>

                    <section aria-labelledby="processor-obligations">
                        <h2 id="processor-obligations" className="text-2xl font-semibold">3. Processor obligations</h2>
                        <p className="mt-4 text-muted-foreground leading-7">Acredia shall:</p>
                        <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>Process personal data only on documented instructions from the Controller, unless required by law.</li>
                            <li>Ensure that persons authorised to process personal data have committed to confidentiality.</li>
                            <li>Implement appropriate technical and organisational security measures (Art. 32 GDPR).</li>
                            <li>Not engage sub-processors without prior general or specific written authorisation.</li>
                            <li>Assist the Controller in fulfilling data-subject rights requests.</li>
                            <li>Delete or return all personal data upon termination of the agreement, subject to legal retention requirements.</li>
                            <li>Make available all information necessary to demonstrate compliance and allow audits.</li>
                        </ul>
                    </section>

                    <section aria-labelledby="controller-obligations">
                        <h2 id="controller-obligations" className="text-2xl font-semibold">4. Controller obligations</h2>
                        <p className="mt-4 text-muted-foreground leading-7">The Controller shall:</p>
                        <ul className="mt-2 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>Ensure there is a valid lawful basis to issue credentials containing student personal data.</li>
                            <li>Provide accurate data and promptly notify Acredia of corrections.</li>
                            <li>Inform students that their credential data will be stored on Acredia and anchored on the Stellar blockchain.</li>
                        </ul>
                    </section>

                    <section aria-labelledby="on-chain-immutability">
                        <h2 id="on-chain-immutability" className="text-2xl font-semibold">5. On-chain data &amp; erasure</h2>
                        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
                            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                                Blockchain immutability notice
                            </p>
                            <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                Credential issuance writes a SHA-256 hash (not personal data) to the Stellar
                                blockchain. This record is technically immutable. Both parties acknowledge
                                that this hash is pseudonymous and relies on the Art. 17(3)(b) GDPR
                                exemption. All personally identifiable fields (name, email, metadata JSONB)
                                will be redacted from Acredia's database and the IPFS document will be
                                unpinned upon a valid erasure request, but the on-chain hash cannot be
                                removed.
                            </p>
                        </div>
                    </section>

                    <section aria-labelledby="security">
                        <h2 id="security" className="text-2xl font-semibold">6. Security measures (Art. 32)</h2>
                        <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground leading-7">
                            <li>TLS 1.2+ encryption for all data in transit.</li>
                            <li>AES-256-GCM encryption for credential documents stored on IPFS.</li>
                            <li>Row Level Security (RLS) enforced at the database layer.</li>
                            <li>API rate limiting and bearer-token authentication on all data endpoints.</li>
                            <li>Regular security reviews and responsible disclosure policy (see SECURITY.md).</li>
                        </ul>
                    </section>

                    <section aria-labelledby="sub-processors">
                        <h2 id="sub-processors" className="text-2xl font-semibold">Schedule A — Data categories</h2>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Category</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Subjects</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Purpose</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground">
                                    <tr>
                                        <td className="px-4 py-3">Name, email</td>
                                        <td className="px-4 py-3">Students, institution staff</td>
                                        <td className="px-4 py-3">Account creation &amp; credential association</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">Credential metadata (degree, grade, dates)</td>
                                        <td className="px-4 py-3">Students</td>
                                        <td className="px-4 py-3">Credential issuance &amp; verification</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3">Stellar wallet address</td>
                                        <td className="px-4 py-3">Students, institutions</td>
                                        <td className="px-4 py-3">Blockchain credential anchoring</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section aria-labelledby="schedule-b">
                        <h2 id="schedule-b" className="text-2xl font-semibold">Schedule B — Sub-processors</h2>
                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Sub-processor</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Country</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Purpose</th>
                                        <th className="px-4 py-3 text-left font-semibold text-foreground">Safeguard</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border text-muted-foreground">
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Supabase</td>
                                        <td className="px-4 py-3">EU (Frankfurt)</td>
                                        <td className="px-4 py-3">Database &amp; auth</td>
                                        <td className="px-4 py-3">DPA + SCCs</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Pinata</td>
                                        <td className="px-4 py-3">US</td>
                                        <td className="px-4 py-3">IPFS pinning</td>
                                        <td className="px-4 py-3">DPA + SCCs; content encrypted before upload</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-foreground">Stellar Network</td>
                                        <td className="px-4 py-3">Global (decentralised)</td>
                                        <td className="px-4 py-3">Blockchain anchoring</td>
                                        <td className="px-4 py-3">No PII on-chain (hashes only)</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Related links */}
                    <div className="mt-12 flex flex-wrap gap-4 border-t border-border pt-8 text-sm text-muted-foreground">
                        <Link href="/legal/privacy" className="text-primary underline hover:text-primary/80">
                            Privacy Policy →
                        </Link>
                        <Link href="/legal/terms" className="text-primary underline hover:text-primary/80">
                            Terms of Service →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
