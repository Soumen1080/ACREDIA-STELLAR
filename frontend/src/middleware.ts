import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { buildCspString } from './lib/securityHeaders';

export function middleware(request: NextRequest) {
    const requestId = crypto.randomUUID();

    // Per-request nonce for the Content-Security-Policy script-src directive.
    // Generated here (not in next.config.ts headers(), which is static/build-time)
    // so every response gets a fresh, unguessable nonce. See src/lib/securityHeaders.ts.
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const csp = buildCspString(nonce, process.env.NODE_ENV === 'production');

    // Attach request ID + nonce to request headers so Server Components can
    // read them via `headers()` (e.g. to add `nonce={nonce}` to a manual <script>).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-request-id', requestId);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // Also attach to response headers
    response.headers.set('x-request-id', requestId);
    response.headers.set('Content-Security-Policy', csp);
    return response;
}

export const config = {
    matcher: [
        // Run on everything except static assets and Next's internal image
        // optimizer, so page navigations get a fresh CSP nonce. API routes are
        // included too, so the x-request-id behavior below is unchanged.
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
    ],
};
