import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buttonVariants } from '@/components/ui/button';

describe('design system button variants', () => {
    it('exposes semantic brand and surface variants for shared UI', () => {
        const brandClasses = buttonVariants({ variant: 'brand' });
        const surfaceClasses = buttonVariants({ variant: 'surface' });

        expect(brandClasses).toContain('bg-primary');
        expect(surfaceClasses).toContain('bg-card');
        expect(surfaceClasses).toContain('border-border');
    });
});

describe('public verification surface', () => {
    // /verify is the page third parties judge Acredia by, so it is held to the
    // design system rather than accumulating ad-hoc decoration
    // (ACREDIA-STELLAR#226).
    const verifyDir = join(process.cwd(), 'src/components/verify');
    const sources = [
        ...readdirSync(verifyDir)
            .filter((file) => file.endsWith('.tsx'))
            .map(
                (file) =>
                    [
                        `components/verify/${file}`,
                        readFileSync(join(verifyDir, file), 'utf8'),
                    ] as const,
            ),
        [
            'app/verify/page.tsx',
            readFileSync(join(process.cwd(), 'src/app/verify/page.tsx'), 'utf8'),
        ] as const,
    ];

    const BANNED_DECORATION = [
        'backdrop-blur',
        'shadow-xl',
        'shadow-lg',
        'border-2',
        'border-l-4',
    ];

    // Raw Tailwind palette classes ignore the theme tokens entirely — the
    // components this replaced hardcoded `text-slate-900` and `bg-white/80`.
    const RAW_PALETTE = /\b(?:text|bg|border)-(?:slate|gray|zinc|neutral|stone)-\d{2,3}\b/;

    it('guards against decoration and raw palette classes', () => {
        // Self-check: the rules below only mean something if they can fail.
        expect('p-4 shadow-lg').toEqual(
            expect.stringContaining(BANNED_DECORATION[2]),
        );
        expect('text-slate-900').toMatch(RAW_PALETTE);
        expect('text-foreground').not.toMatch(RAW_PALETTE);
    });

    it.each(sources)('%s uses no ad-hoc decoration', (_name, source) => {
        for (const banned of BANNED_DECORATION) {
            expect(source).not.toContain(banned);
        }
    });

    it.each(sources)('%s uses design tokens rather than raw palette colours', (_name, source) => {
        expect(source).not.toMatch(RAW_PALETTE);
    });

    it('renders the verification page through the design-system container', () => {
        const shell = readFileSync(join(verifyDir, 'VerificationPageShell.tsx'), 'utf8');

        expect(shell).toContain('container-shell');
        expect(shell).not.toContain('container mx-auto');
    });

    it('states one consistent h1 for every verification state', () => {
        const shell = readFileSync(join(verifyDir, 'VerificationPageShell.tsx'), 'utf8');
        const page = readFileSync(join(process.cwd(), 'src/app/verify/page.tsx'), 'utf8');

        // The heading lives in the shared shell, so no state can introduce its
        // own — screen readers hear the same page title throughout.
        expect(shell.match(/<h1\s+className/g)).toHaveLength(1);
        expect(page).not.toMatch(/<h1\s/);
    });
});
