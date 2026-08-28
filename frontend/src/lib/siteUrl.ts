/**
 * Resolves the canonical base URL for metadata, Open Graph previews, sitemaps, and robots.
 *
 * Evaluation order:
 * 1. NEXT_PUBLIC_SITE_URL (configured production domain e.g. https://acredia.io)
 * 2. VERCEL_URL (automatically provided by Vercel deployment environments)
 * 3. https://acredia.example (canonical fallback)
 */
export function getSiteUrl(): string {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl && envUrl.trim()) {
        const trimmed = envUrl.trim();
        return trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`;
    }

    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl && vercelUrl.trim()) {
        return `https://${vercelUrl.trim()}`;
    }

    return 'https://acredia.example';
}

/**
 * Returns a valid URL object for Next.js Metadata `metadataBase`.
 *
 * Ensures relative social media OpenGraph and Twitter image URLs (e.g. '/logo.png')
 * resolve to absolute, publicly fetchable URLs across all deployment environments.
 */
export function getMetadataBase(): URL {
    try {
        return new URL(getSiteUrl());
    } catch {
        return new URL('https://acredia.example');
    }
}
