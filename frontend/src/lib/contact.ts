/**
 * Single source of truth for Acredia's public contact details.
 *
 * Legal pages, the site footer and support copy all read from here so the
 * address only ever has to change in one place.
 */

/** Primary public inbox — support, privacy, legal and security reports. */
export const CONTACT_EMAIL = 'acredia.stellar@gmail.com';

/** `mailto:` href for the primary inbox. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/**
 * X / Twitter handle.
 *
 * TODO: replace with the real Acredia handle — this is a placeholder and the
 * link will 404 until it is updated. Change it here and every surface
 * (contact page, footer) picks it up.
 */
export const TWITTER_HANDLE = '@AcrediaStellar';
export const TWITTER_URL = `https://x.com/${TWITTER_HANDLE.replace('@', '')}`;
