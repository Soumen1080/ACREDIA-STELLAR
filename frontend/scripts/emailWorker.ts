import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../src/lib/email';
import { 
    buildCredentialIssuedEmail, 
    buildCredentialRevokedEmail, 
    buildInstitutionVerifiedEmail 
} from '../src/lib/emailTemplates';
import { structuredLog } from '../src/lib/debug';

// Load environment variables manually since this is a script
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local', quiet: true });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase credentials in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const POLL_INTERVAL_MS = 5000;
// Identifies this process in jobs.locked_by so a stuck job can be traced
// back to the worker that claimed it.
const WORKER_ID = `emailWorker@${process.env.HOSTNAME || 'local'}:${process.pid}`;

async function processJob(job: any) {
    structuredLog('INFO', `Processing job ${job.id}`, 'emailWorker', { type: job.name });

    try {
        const { to, subject, type, payload, userId } = job.payload;
        let shouldSend = true;

        // Check user preferences if userId is provided
        if (userId) {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('notification_preferences')
                .eq('id', userId)
                .single();

            if (!error && profile?.notification_preferences) {
                const prefs = profile.notification_preferences as any;
                if (type === 'issued' && prefs.email_issued === false) shouldSend = false;
                if (type === 'revoked' && prefs.email_revoked === false) shouldSend = false;
                if (type === 'verified' && prefs.email_verified === false) shouldSend = false;
            }
        }

        if (!shouldSend) {
            structuredLog('INFO', `User opted out of email type: ${type}`, 'emailWorker', { userId });
            return true; // Mark as successfully processed (ignored)
        }

        let html = '';
        if (type === 'issued') {
            html = buildCredentialIssuedEmail(payload.studentName, payload.institutionName, payload.credentialUrl, userId);
        } else if (type === 'revoked') {
            html = buildCredentialRevokedEmail(payload.studentName, payload.institutionName, userId);
        } else if (type === 'verified') {
            html = buildInstitutionVerifiedEmail(payload.institutionName, userId);
        } else {
            throw new Error(`Unknown email type: ${type}`);
        }

        const success = await sendEmail({ to, subject, html });
        if (!success) {
            throw new Error('Failed to send email via Resend');
        }

        return true;
    } catch (err) {
        structuredLog('ERROR', `Job ${job.id} failed`, 'emailWorker', { error: String(err) });
        return false;
    }
}

async function runWorker() {
    console.log('Email Worker started. Polling for send_email jobs...');
    
    while (true) {
        try {
            // Lock and fetch one job
            const { data: jobs, error: fetchError } = await supabase
                .rpc('next_job', { queue_name: 'send_email', worker_id: WORKER_ID });

            if (fetchError) {
                structuredLog('ERROR', 'Error fetching jobs', 'emailWorker', { error: fetchError.message });
            } else if (jobs && jobs.length > 0) {
                const job = jobs[0];
                const success = await processJob(job);

                if (success) {
                    await supabase
                        .from('jobs')
                        .update({ status: 'completed', updated_at: new Date().toISOString() })
                        .eq('id', job.id);
                } else {
                    const attempts = job.attempts + 1;
                    const status = attempts >= job.max_attempts ? 'failed' : 'pending';
                    await supabase
                        .from('jobs')
                        .update({ 
                            status, 
                            attempts, 
                            updated_at: new Date().toISOString(),
                            locked_at: null,
                            locked_by: null
                        })
                        .eq('id', job.id);
                }
            }
        } catch (e) {
            console.error('Worker loop error:', e);
        }

        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

runWorker();
