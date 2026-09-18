-- 20260919000011_inspector_otp_access_type.sql
-- Inspector-ID OTP authentication + demo-access metadata.
--
-- 1. profiles.access_type — distinguishes a pre-authorized PackIntel demo
--    inspector from an official/government record. The authentication flow does
--    not depend on this value; it is descriptive metadata so the demo account is
--    never presented as a government-issued identity and can be swapped for
--    real records later.
-- 2. inspector_otp_challenges — short-lived, single-use login codes. The
--    validation layer (backend) issues a code after it has confirmed the
--    Inspector ID maps to an active, authorized inspector, then verifies that
--    code before minting a session. Codes are stored only as a salted hash and
--    are never returned to clients except in an explicitly enabled demo mode
--    (no email/SMS delivery channel exists for the SIH demo).
--
-- All statements are idempotent and safe to run repeatedly.

-- 1. access_type ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_type TEXT DEFAULT 'official';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_access_type_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_access_type_check
      CHECK (access_type IN ('official', 'demo'));
  END IF;
END $$;

UPDATE public.profiles
SET access_type = 'official'
WHERE access_type IS NULL OR access_type = '';

-- 2. OTP challenge table ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspector_otp_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  otp_hash     TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspector_otp_profile_created
  ON public.inspector_otp_challenges (profile_id, created_at DESC);

-- Codes are only ever touched by the service-role backend. Enable RLS with no
-- policies and revoke the browser roles so the anon/authenticated keys can
-- never read or forge a challenge.
ALTER TABLE public.inspector_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inspector_otp_challenges FROM anon, authenticated;
GRANT ALL ON public.inspector_otp_challenges TO service_role;

-- 3. Housekeeping helper ----------------------------------------------------
-- Removes challenges that are long past their useful life. Safe to call from a
-- scheduled job; not required for correctness.
CREATE OR REPLACE FUNCTION public.purge_expired_inspector_otp_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM public.inspector_otp_challenges
  WHERE created_at < now() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
