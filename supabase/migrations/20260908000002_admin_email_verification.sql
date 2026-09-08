-- 20260908000002_admin_email_verification.sql
-- Email-to-Admin approval workflow for inspector registrations.
--
-- Adds the per-inspector fields needed for the temporary email-verification
-- loop that already landed in 20260908000001_inspector_verification.sql:
--   * verification_token_hash        SHA-256 of the secure review link token
--   * verification_token_expires_at  links expire after 24h
--   * verification_token_used_at     audit: when the token was consumed
--   * verified_at                    audit: when the admin made a decision
--   * verified_by                    audit: which admin user acted
--   * rejection_reason               optional, recorded on reject
--
-- No new tables: the profile row stays the single source of truth so the
-- workflow can later move from email → verification page to a full admin
-- dashboard without schema changes.
--
-- All statements are idempotent and safe to run repeatedly.

-- 1. Profile columns ---------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_token_hash TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_token_used_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 2. Indexes -----------------------------------------------------------
-- Lookup by token hash (server-side flow): one active token per profile.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_verification_token_hash_key
  ON public.profiles (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles (verification_status);

-- 3. Audit helper: an admin decision never goes through raw client state.
--    The owner-scoped "Users can update own profile" policy (redefined in
--    migration 20260908000001) already blocks self-approval by requiring
--    role/verification_status to stay unchanged on user updates. Admin
--    actions run through server API routes with the service-role key, which
--    bypasses RLS by design and is never exposed to the browser.