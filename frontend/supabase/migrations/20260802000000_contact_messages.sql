-- =====================================================================
-- ACREDIA-STELLAR — CONTACT MESSAGES (IDEMPOTENT)
-- =====================================================================
-- Backs the public /contact form.
--
-- Design notes:
--   • Messages are written ONLY by the server (service_role) after the
--     API route has validated input and applied rate limiting, so there is
--     no public INSERT policy — anonymous users can never write directly.
--   • Nobody except an admin can read messages (they contain the sender's
--     name/email, i.e. personal data).
--   • ip_hash is an HMAC, never a raw IP, so the table stays privacy-safe
--     and consistent with verification_logs.
--
-- Safe to re-run: IF NOT EXISTS / DROP POLICY IF EXISTS before CREATE.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.contact_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    message      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'read', 'replied', 'spam')),
    ip_hash      TEXT,
    user_agent   TEXT,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    handled_at   TIMESTAMP WITH TIME ZONE,

    -- Defence in depth: the API validates these too, but the database
    -- refuses obviously malformed or abusive payloads regardless of caller.
    CONSTRAINT contact_messages_name_len    CHECK (char_length(name) BETWEEN 2 AND 100),
    CONSTRAINT contact_messages_email_len   CHECK (char_length(email) BETWEEN 3 AND 254),
    CONSTRAINT contact_messages_email_shape CHECK (position('@' IN email) > 1),
    CONSTRAINT contact_messages_message_len CHECK (char_length(message) BETWEEN 10 AND 5000)
);

COMMENT ON TABLE public.contact_messages IS
    'Submissions from the public /contact form. Written server-side only '
    '(service_role) after validation + rate limiting; readable by admins only. '
    'ip_hash is an HMAC of the client IP — never a raw address.';

COMMENT ON COLUMN public.contact_messages.ip_hash IS
    'HMAC-SHA256 of the submitting IP, used for abuse investigation without '
    'storing personal network identifiers.';

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
    ON public.contact_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status
    ON public.contact_messages (status, created_at DESC);

-- Supports the per-IP flood check in the API route.
CREATE INDEX IF NOT EXISTS idx_contact_messages_ip_recent
    ON public.contact_messages (ip_hash, created_at DESC);

ALTER TABLE IF EXISTS public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Read: admins only (messages contain the sender's name + email).
DROP POLICY IF EXISTS "Admin can view contact messages" ON public.contact_messages;
CREATE POLICY "Admin can view contact messages"
    ON public.contact_messages FOR SELECT
    USING (public.is_admin());

-- Manage (update status / delete): admins only.
DROP POLICY IF EXISTS "Admin can manage contact messages" ON public.contact_messages;
CREATE POLICY "Admin can manage contact messages"
    ON public.contact_messages FOR ALL
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- NOTE: deliberately NO insert policy for anon/authenticated. Inserts happen
-- through the service-role client in /api/contact, which bypasses RLS after
-- validating and rate limiting the request.

COMMIT;

-- =====================================================================
-- DONE. Verify:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name='contact_messages';
-- =====================================================================
