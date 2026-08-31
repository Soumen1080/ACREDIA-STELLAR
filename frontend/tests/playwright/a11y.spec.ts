import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { applyE2eState, createE2eState, installE2eRoutes, seedE2eState } from './e2e-support';

async function runAxe(page: Page) {
    // The app can still be settling (hydration / client-side redirect) right
    // after `goto` resolves. Injecting axe mid-navigation destroys the
    // execution context, so wait for the page to go quiet first.
    await page.waitForLoadState('domcontentloaded');
    await page.waitForLoadState('networkidle').catch(() => {});

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addStyleTag({
        content: `*, *::before, *::after { transition: none !important; animation-duration: 0s !important; opacity: 1 !important; transform: none !important; }`,
    });
    const axeModule = await import('axe-core');
    const axeSource = axeModule.source ?? axeModule.default.source;
    await page.addScriptTag({ content: axeSource });
    return page.evaluate(async () => {
        const axe = (window as unknown as Window & { axe: { run: (node: Element, options: unknown) => Promise<{ violations: Array<{ id: string; impact?: string; help: string }> }> } }).axe;
        return axe.run(document.documentElement, {
            runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa'],
            },
        });
    });
}

test('core pages pass WCAG 2.1 AA accessibility audit', async ({ page }) => {
    // Unauthenticated pages
    await page.goto('/');
    let results = await runAxe(page);
    expect(results.violations, `Home page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    await page.goto('/about');
    results = await runAxe(page);
    expect(results.violations, `About page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    await page.goto('/auth/login');
    results = await runAxe(page);
    expect(results.violations, `Login page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    // Registration was removed (Issue #239); contact is where onboarding
    // starts now, so that is the page worth auditing.
    await page.goto('/contact');
    results = await runAxe(page);
    expect(results.violations, `Contact page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    // Authenticated institution state
    const institutionState = createE2eState({
        role: 'institution',
        walletAddress: 'GAcrediaIssuerWallet0000000000000000000000000000001',
        authorizedIssuers: ['GAcrediaIssuerWallet0000000000000000000000000000001'],
        issuedCredentials: [
            {
                id: 'cred-1',
                token_id: '1',
                ipfs_hash: 'e2e-metadata-cid',
                blockchain_hash: 'e2e-tx-1',
                metadata: {
                    credentialData: {
                        studentName: 'Ada Lovelace',
                        degree: 'Bachelor of Science',
                        credentialType: 'diploma',
                        issueDate: '2024-01-01',
                    },
                },
                issued_at: new Date().toISOString(),
                revoked: false,
                issuer_wallet_address: 'GAcrediaIssuerWallet0000000000000000000000000000001',
                student_wallet_address: 'GBSVJNVIAGQEAK3WAAVGXSMT7BMLI4SHAJWKKMRCMJIYG7XESR4ANDZD',
            },
        ],
    });

    await seedE2eState(page, institutionState);
    await installE2eRoutes(page);

    await page.goto('/dashboard');
    results = await runAxe(page);
    expect(results.violations, `Dashboard page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    // The former institution tabs are real routes now, so each one is audited
    // in its own right.
    await page.goto('/dashboard/issue');
    results = await runAxe(page);
    expect(results.violations, `Issue credential page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    await page.goto('/dashboard/issued');
    results = await runAxe(page);
    expect(results.violations, `Issued credentials page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    await page.goto('/verify?token=1');
    results = await runAxe(page);
    expect(results.violations, `Verify page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    await page.goto('/credentials/1');
    results = await runAxe(page);
    expect(results.violations, `Public Credential page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    // Authenticated admin state
    const adminState = createE2eState({
        role: 'admin',
        walletAddress: 'GAcrediaAdminWallet00000000000000000000000000000001',
        contractOwner: 'GAcrediaAdminWallet00000000000000000000000000000001',
        authorizedIssuers: [],
        session: {
            user: { id: 'admin-user-1', email: 'admin@acredia.test' },
            access_token: 'e2e-admin-token',
        },
    });

    // Switching roles mid-test has to overwrite the stored state — re-seeding
    // would be ignored and this audit would silently re-check /dashboard.
    await applyE2eState(page, adminState);

    await page.goto('/admin');
    // Guards the role switch above: as an institution this page would redirect
    // to /dashboard and the audit below would pass without ever seeing /admin.
    await expect(page.getByRole('navigation', { name: 'Admin navigation' })).toBeVisible();
    results = await runAxe(page);
    expect(results.violations, `Admin page violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);

    // The wallet gate is a distinct visual treatment (warning-toned, centred),
    // so it gets audited in its own right (ACREDIA-STELLAR#225).
    await applyE2eState(page, { ...adminState, walletAddress: null });

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Wallet connection required' })).toBeVisible();
    results = await runAxe(page);
    expect(results.violations, `Admin wallet gate violations: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
});
