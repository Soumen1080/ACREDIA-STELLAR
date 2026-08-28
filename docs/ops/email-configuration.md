# Email Configuration, Deliverability & Account Recovery

This document outlines the email infrastructure, sending limits, account recovery paths, and deliverability safeguards in Acredia.

---

## 1. Context & Deliverability Architecture

Acredia relies on email for critical onboarding and authentication workflows:
- **Institution POC Onboarding & Invites**
- **Account Password Resets**
- **Credential Issuance & Revocation Notifications**

### The Deliverability Challenge
Supabase provides a built-in default email service intended exclusively for development. The built-in service enforces a strict hourly rate limit (~3 emails/hour) and lacks custom SPF/DKIM DNS alignments, which causes emails sent to university and corporate mail filters to be flagged as spam or dropped entirely.

To ensure deliverability and eliminate lockout risks, Acredia employs:
1. **Custom SMTP Configuration** in Supabase Auth.
2. **Primary User Self-Service Recovery** via Supabase Auth reset flows.
3. **Admin-Generated Direct Fallback Links** for offline/out-of-band delivery.
4. **Actionable Error Surfacing** when mail delivery is throttled or rejected.

---

## 2. Supabase Custom SMTP Configuration

Before onboarding production institutions, custom SMTP **must** be configured in the Supabase Dashboard.

### Zero-Cost Configuration: Gmail SMTP
For testnet, staging, and early production, Gmail SMTP with a Google App Password provides zero-cost deliverability up to **500 emails/day**.

#### Setup Steps:
1. Log in to the project's Google/Gmail account.
2. Enable **2-Step Verification** under Google Account Security.
3. Navigate to **App passwords** (under 2-Step Verification) and generate a new app password named `Acredia-Supabase`.
4. Open the **Supabase Dashboard** → **Project Settings** → **Authentication** → **SMTP Settings**.
5. Enable **Enable Custom SMTP** and fill in the following:

| Setting | Value |
|---|---|
| **Sender Email** | `acredia.stellar@gmail.com` (or your project email) |
| **Sender Name** | `Acredia Credentials` |
| **Host** | `smtp.gmail.com` |
| **Port** | `587` |
| **Encryption** | `STARTTLS` / `TLS` |
| **User** | `acredia.stellar@gmail.com` |
| **Password** | `<Your 16-character Google App Password>` |

6. Click **Save** and test sending an email.

---

## 3. Sending Limits & Upgrade Trigger

| Provider Tier | Daily Send Limit | Hourly Burst Limit | Recommended Use |
|---|---|---|---|
| **Supabase Built-in** | ~30 / day | ~3 / hour | Local development only |
| **Gmail SMTP (App Password)** | 500 / day | ~100 / hour | Staging, testnet, early production |
| **Dedicated Provider (Resend / Postmark / SendGrid)** | Unlimited (plan-based) | High burst capacity | High-volume production / Custom domain SPF/DKIM |

### Upgrade Trigger
Revisit and migrate to a dedicated transactional provider (e.g. Resend, Postmark, Amazon SES) when:
- Institutional onboarding volume exceeds **300 emails/day**.
- Strict enterprise or university firewalls require custom domain SPF/DKIM/DMARC alignment (`acredia.io`).
- Detailed delivery tracking and bounce webhooks are required.

---

## 4. Primary Flow vs. Fallback Direct Links

```
┌────────────────────────────────────────────────────────────┐
│                    Password Reset Request                  │
└────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       [Primary Path]                 [Fallback Path]
   User submits form at          Admin generates single-use
   /auth/forgot-password          link at /admin/institutions/[id]
              │                               │
   Supabase sends email          Direct link copied by admin
   via Custom SMTP               & transmitted out-of-band
              │                               │
              └───────────────┬───────────────┘
                              ▼
                 User lands on /auth/reset-password
                 Sets new secure password
```

### Primary Flow (Self-Service)
- User requests reset on `/auth/forgot-password`.
- `supabase.auth.resetPasswordForEmail()` dispatches a recovery email with a callback to `/auth/reset-password`.
- If SMTP is throttled or rejected, the UI detects rate limits and surfaces an actionable error suggesting fallback options.

### Fallback Path (Admin-Generated Link)
If an institution POC is unable to receive email (due to university spam filtering, inbox quotas, or mail delays):
1. Admin navigates to `/admin/institutions/[id]`.
2. Under **Direct Single-Use Access Link**, admin clicks **Generate Reset Link** or **Generate Invite Link**.
3. The server calls `supabase.auth.admin.generateLink({ type: 'recovery' | 'invite' })`.
4. The generated link is valid for **24 hours**, is **single-use**, and automatically **invalidates any previous recovery token**.
5. Admin copies the link and transmits it to the verified POC via secure out-of-band communication.
6. The link generation is recorded in `admin_audit_logs`.

---

## 5. Surfacing Mail Delivery Failures

Silent failures are prevented across all surfaces:
- **Client Forms (`/auth/forgot-password`):** Specific error codes (such as `over_email_send_rate_limit`) are mapped to clear messages informing the user of the throttling and directing them to their administrator.
- **Admin API Routes:** When link generation or email queues fail, structured errors are logged to `debug.ts` / error aggregators and returned to the caller with actionable error codes.
