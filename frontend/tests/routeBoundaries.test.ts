import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Route Loading and Error Boundaries', () => {
    const appDir = join(process.cwd(), 'src', 'app');

    const expectedDataFetchingRoutes = [
        'credentials/[token]',
        'admin/institutions',
        'admin/institutions/[id]',
        'admin/authorize',
        'admin/settings',
        'dashboard/credentials',
        'dashboard/settings',
        'contact',
        'issuers',
        'docs/api',
        'verify',
    ];

    const expectedErrorBoundaries = [
        'credentials/[token]',
        'admin/institutions',
        'admin/institutions/[id]',
        'admin/authorize',
        'admin/settings',
        'dashboard/credentials',
        'dashboard/settings',
        'auth',
        'contact',
        'issuers',
        'docs/api',
        'about',
        'legal',
        'solutions',
        'verify',
        'admin',
        'dashboard',
    ];

    it('provides layout-matched loading.tsx for all data-fetching and public routes', () => {
        for (const route of expectedDataFetchingRoutes) {
            const loadingPath = join(appDir, route, 'loading.tsx');
            expect(
                existsSync(loadingPath),
                `Missing loading.tsx for route: ${route}`,
            ).toBe(true);
        }
    });

    it('provides localized error.tsx boundaries with retry for all key route segments', () => {
        for (const route of expectedErrorBoundaries) {
            const errorPath = join(appDir, route, 'error.tsx');
            expect(
                existsSync(errorPath),
                `Missing error.tsx for route: ${route}`,
            ).toBe(true);
        }
    });
});
