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
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
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

    await page.getByRole('tab', { name: 'View issued' }).click();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    await expect(page.getByText('Token ID: 1').first()).toBeVisible();

    await page.goto('/verify?token=1');
    await expect(page.getByRole('heading', { name: 'Credential Verification Report' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Credential Verified ✓' })).toBeVisible();
    await expect(page.getByText('Blockchain Verified')).toBeVisible();
    // Distinct end-to-end CID ↔ on-chain-hash integrity signal (ACREDIA-STELLAR#163) —
    // separate from the revoked/verified status above.
    await expect(page.getByText('Document Integrity: Authentic')).toBeVisible();

    await page.goto('/dashboard');
    await page.getByRole('tab', { name: 'View issued' }).click();
    await page.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByRole('dialog', { name: 'Revoke Credential' })).toBeVisible();
    await page.getByRole('button', { name: 'Revoke Credential' }).click();
    await expect(page.getByRole('tabpanel').locator('span').filter({ hasText: 'Revoked' })).toBeVisible();

    await page.goto('/verify?token=1');
    await expect(page.getByRole('heading', { name: 'Credential Revoked' })).toBeVisible();
    await expect(page.getByText('This credential has been revoked')).toBeVisible();
    // Revocation and document integrity are independent signals: a revoked
    // credential's original document can still be untampered.
    await expect(page.getByText('Document Integrity: Authentic')).toBeVisible();
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
