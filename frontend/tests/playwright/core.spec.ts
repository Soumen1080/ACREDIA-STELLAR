import { expect, test } from '@playwright/test';
import { createE2eState, installE2eRoutes, seedE2eState } from './e2e-support';

const issuerWallet = 'GAcrediaIssuerWallet0000000000000000000000000000001';
const adminWallet = 'GAcrediaAdminWallet00000000000000000000000000000001';
const studentWallet = 'GBSVJNVIAGQEAK3WAAVGXSMT7BMLI4SHAJWKKMRCMJIYG7XESR4ANDZD';

test('registers, issues, verifies, and revokes a credential', async ({ page }) => {
    const state = createE2eState({
        role: 'institution',
        walletAddress: issuerWallet,
        contractOwner: adminWallet,
        authorizedIssuers: [issuerWallet],
        institution: {
            id: 'inst-1',
            name: 'Acredia Academy',
            walletAddress: issuerWallet,
        },
    });

    await seedE2eState(page, state);
    await installE2eRoutes(page);

    await page.goto('/auth/register?role=institution');
    await page.getByRole('button', { name: 'Institution' }).click();
    await page.getByLabel('Institution name').fill('Acredia Academy');
    await page.getByLabel('Email').fill('issuer@acredia.test');
    await page.getByLabel('Password', { exact: true }).fill('Credential1');
    await page.getByLabel('Confirm password', { exact: true }).fill('Credential1');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    // Issuance now lives on its own route. Reach it through the sidebar so the
    // institution navigation stays covered.
    const institutionNav = page.getByRole('navigation', { name: 'Institution navigation' });
    await institutionNav.getByRole('link', { name: /Issue credential/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/issue$/);
    await expect(page.getByRole('heading', { name: 'Issue new credential' })).toBeVisible();

    await page.locator('#studentName').fill('Ada Lovelace');
    await page.locator('#studentWallet').fill(studentWallet);
    await page.locator('#degree').fill('Bachelor of Science');
    await page.locator('#issueDate').fill('2024-01-01');
    await page.locator('#fileUpload').setInputFiles({
        name: 'diploma.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 credential'),
    });
    await expect(page.getByText('diploma.pdf')).toBeVisible();

    await page.locator('form').getByRole('button', { name: 'Issue Credential' }).click();
    await expect(page.getByRole('dialog', { name: 'Review Credential' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm and Sign' }).click();

    await institutionNav.getByRole('link', { name: /Issued credentials/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/issued$/);
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText('Token ID: 1').first()).toBeVisible();

    await page.goto('/verify?token=1');
    await expect(page.getByRole('heading', { name: 'Credential Verification Report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Credential Verified ✓' })).toBeVisible();
    await expect(page.getByText('Blockchain Verified')).toBeVisible();
    // Distinct end-to-end CID ↔ on-chain-hash integrity signal (ACREDIA-STELLAR#163) —
    // separate from the revoked/verified status above.
    await expect(page.getByText('Document Integrity: Authentic')).toBeVisible();

    // Every former tab is deep-linkable now, so the revoke flow can start from
    // the URL instead of replaying a click path.
    await page.goto('/dashboard/issued');
    await expect(page.getByRole('heading', { name: 'Issued credentials', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog', { name: 'Revoke Credential' })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke Credential' }).click();
    await expect(page.locator('[data-slot="badge"]').filter({ hasText: 'Revoked' })).toBeVisible();

    await page.goto('/verify?token=1');
    await expect(page.getByRole('heading', { name: 'Credential Revoked' })).toBeVisible();
    await expect(page.getByText('This credential has been revoked')).toBeVisible();
    // Revocation and document integrity are independent signals: a revoked
    // credential's original document can still be untampered.
    await expect(page.getByText('Document Integrity: Authentic')).toBeVisible();
});

test('institution console sections are deep-linkable and reachable on mobile', async ({ page }) => {
    const state = createE2eState({
        role: 'institution',
        walletAddress: issuerWallet,
        authorizedIssuers: [issuerWallet],
    });

    await seedE2eState(page, state);
    await installE2eRoutes(page);

    // Deep link straight into a former tab.
    await page.goto('/dashboard/issued');
    await expect(page.getByRole('heading', { name: 'Issued credentials', level: 1 })).toBeVisible();

    const institutionNav = page.getByRole('navigation', { name: 'Institution navigation' });
    await expect(
        institutionNav.getByRole('link', { name: /Issued credentials/ }),
    ).toHaveAttribute('aria-current', 'page');
    // The section root must not stay highlighted on its sub-routes.
    await expect(institutionNav.getByRole('link', { name: /Overview/ })).not.toHaveAttribute(
        'aria-current',
        'page',
    );

    // Mobile: the sidebar collapses into a drawer.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard');
    await expect(institutionNav).toBeHidden();

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(institutionNav).toBeVisible();

    await institutionNav.getByRole('link', { name: /Batch import/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/batch-import$/);
    // Navigating closes the drawer so the new page is not hidden behind it.
    await expect(institutionNav).toBeHidden();

    const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, 'the page must not scroll horizontally at 390px').toBe(false);
});

test('authorizes an issuer from the admin dashboard', async ({ page }) => {
    const state = createE2eState({
        role: 'admin',
        walletAddress: adminWallet,
        contractOwner: adminWallet,
        authorizedIssuers: [],
        institution: {
            id: 'inst-1',
            name: 'Acredia Academy',
            walletAddress: issuerWallet,
        },
    });

    await seedE2eState(page, state);
    await installE2eRoutes(page);

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    // Issuer authorization now lives on its own page. Reach it through the
    // sidebar rather than a direct goto, so the admin navigation stays covered.
    await page
        .getByRole('navigation', { name: 'Admin navigation' })
        .getByRole('link', { name: /Authorize issuer/ })
        .click();

    await expect(page).toHaveURL(/\/admin\/authorize$/);
    await expect(page.getByRole('heading', { name: 'Authorize issuer', level: 1 })).toBeVisible();

    await page.getByLabel('Wallet Address to Authorize').fill(issuerWallet);
    await page.getByRole('button', { name: 'Authorize Wallet' }).click();
    await expect(page.getByText('Authorized to issue credentials', { exact: true })).toBeVisible();
});
