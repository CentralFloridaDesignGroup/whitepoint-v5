export function Eula() {
    return (
        <div className="max-w-7xl mx-auto px-4 py-6">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">End-User License Agreement</h1>
            <p className="text-slate-600 mt-4">Last updated: July 21, 2026</p>

            <section className="mt-8">
                <h2 className="text-2xl font-bold">Introduction</h2>
                <p className="text-slate-600 mt-2">
                    This End-User License Agreement ("Agreement") governs access to and use of internal software tools, workflows, and integrations operated by White Point Surveying & Mapping LLC ("White Point", "we", "us", or "our"), including tools hosted on docs.whitepointsurvey.com and related application programming interfaces (collectively, the "Application").
                </p>
                <p className="text-slate-600 mt-2">
                    The Application is intended for authorized White Point personnel and approved business users only. It is not offered as a public software product.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">License and Access</h3>
                <p className="text-slate-600 mt-2">
                    Subject to this Agreement, White Point grants authorized users a limited, revocable, non-exclusive, non-transferable license to access and use the Application solely for White Point business purposes.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Authorized Use</h3>
                <ul className="list-disc list-inside text-slate-600 mt-2 space-y-1">
                    <li>Users may access the Application only through approved accounts and authentication methods.</li>
                    <li>Users may use connected third-party services, including QuickBooks Online, only for legitimate business workflows.</li>
                    <li>Users may not attempt unauthorized access, bypass security controls, introduce malicious code, or misuse client, project, invoice, or accounting data.</li>
                </ul>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">QuickBooks Online Integration</h3>
                <p className="text-slate-600 mt-2">
                    When connected to QuickBooks Online, the Application may access customer, sub-customer, invoice, payment, and related accounting information authorized by the connected QuickBooks company. This access is used to support customer selection, invoice creation, invoice synchronization, and payment reconciliation for White Point business operations.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Ownership</h3>
                <p className="text-slate-600 mt-2">
                    The Application, including its design, source code, workflows, branding, documentation, and related materials, is owned by White Point or its licensors. No ownership rights are transferred to users under this Agreement.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Data and Privacy</h3>
                <p className="text-slate-600 mt-2">
                    Use of the Application is also governed by our <a href="/privacy-policy" className="text-blue-500">Privacy Policy</a>, which explains how we collect, use, retain, and protect information, including information accessed through QuickBooks Online.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Third-Party Services</h3>
                <p className="text-slate-600 mt-2">
                    The Application may connect to third-party services such as QuickBooks Online, Microsoft authentication, Cloudflare hosting, Stripe payment processing, and email delivery providers. Use of those services may also be governed by their own terms and privacy policies.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Confidentiality</h3>
                <p className="text-slate-600 mt-2">
                    Users must protect confidential business, client, project, invoice, and accounting information accessed through the Application and may not disclose it except as authorized for White Point business purposes.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Termination</h3>
                <p className="text-slate-600 mt-2">
                    White Point may suspend or revoke access to the Application at any time, including when a user is no longer authorized, violates this Agreement, or creates a security, legal, or operational risk.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Disclaimer</h3>
                <p className="text-slate-600 mt-2">
                    The Application is provided "as is" and "as available." To the maximum extent permitted by law, White Point disclaims all warranties, whether express, implied, or statutory, including warranties of merchantability, fitness for a particular purpose, and non-infringement.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Limitation of Liability</h3>
                <p className="text-slate-600 mt-2">
                    To the maximum extent permitted by law, White Point is not liable for indirect, incidental, special, consequential, exemplary, or punitive damages arising from use of or inability to use the Application.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Governing Law</h3>
                <p className="text-slate-600 mt-2">
                    This Agreement is governed by the laws of the State of Florida, without regard to conflict of law principles.
                </p>
            </section>

            <section className="mt-6">
                <h3 className="text-xl font-semibold">Contact</h3>
                <p className="text-slate-600 mt-2">Questions about this Agreement may be sent to <a href="mailto:info@whitepointsurvey.com" className="text-blue-500">info@whitepointsurvey.com</a> or mailed to:</p>
                <address className="not-italic text-slate-600 mt-2">
                    White Point Surveying & Mapping LLC<br />
                    Attn: End-User License Agreement<br />
                    642 Crimson Ct<br />
                    Altamonte Springs, FL 32701
                </address>
            </section>
        </div>
    )
}
