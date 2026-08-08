import { structuredLog } from './debug';
import { CONTACT_EMAIL } from './contact';

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
}

/**
 * Envelope "From" address.
 *
 * Resend (like every transactional provider) will only send from a domain you
 * have verified — a free @gmail.com address cannot be used here. Configure
 * EMAIL_FROM once the sending domain is verified; until then the default is
 * used and replies are routed to the public inbox via Reply-To below.
 */
const EMAIL_FROM = process.env.EMAIL_FROM || 'Acredia <notifications@acredia.io>';

/**
 * Sends a transactional email using the Resend REST API via native fetch.
 * This avoids requiring the 'resend' npm package.
 */
export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
        structuredLog('WARN', 'RESEND_API_KEY is not set. Email not sent.', 'system', { to, subject });
        return false;
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${resendApiKey}`
            },
            body: JSON.stringify({
                from: EMAIL_FROM,
                // Replies to any transactional email reach the team inbox.
                reply_to: CONTACT_EMAIL,
                to: [to],
                subject,
                html
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            structuredLog('ERROR', 'Failed to send email via Resend', 'system', { status: response.status, errorData, to });
            return false;
        }

        structuredLog('INFO', 'Email sent successfully', 'system', { to, subject });
        return true;
    } catch (error) {
        structuredLog('ERROR', 'Exception while sending email', 'system', { error: error instanceof Error ? error.message : String(error) });
        return false;
    }
}
