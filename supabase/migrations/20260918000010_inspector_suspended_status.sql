-- 20260918000010_inspector_suspended_status.sql
-- Inspector authorization lifecycle: add the 'suspended' state.
--
-- Administrators can now suspend an already-approved inspector (revoking access
-- without deleting the account) and later reactivate them. The existing
-- profiles_verification_status_check only permitted pending/approved/rejected,
-- so it must be widened before a suspend update can be persisted.
--
-- Idempotent and safe to run repeatedly.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_verification_status_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_verification_status_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_status_check
  CHECK (verification_status IN ('pending', 'approved', 'rejected', 'suspended'));

-- Normalize any legacy/unknown values so the widened constraint can never fail
-- on an existing row.
UPDATE public.profiles
SET verification_status = 'pending'
WHERE verification_status IS NULL
   OR verification_status NOT IN ('pending', 'approved', 'rejected', 'suspended');

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles (verification_status);
