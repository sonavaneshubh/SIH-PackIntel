-- 20260908000001_inspector_verification.sql
-- Inspector Signup & Verification system.
--
-- Adds role + verification lifecycle columns to profiles so the platform can:
--   1. Store an explicit `role` ('inspector' | 'admin') separately from the
--      display `designation` (the pre-existing free-text officer title.
--   2. Track `verification_status` ('pending' | 'approved' | 'rejected') so
--      newly-registered inspectors cannot use inspector routes until an admin
--      approves them.
--   3. Persist official registration fields (organization, location,
--      inspector_employee_id) collected on the signup form.
--
-- All statements are idempotent and safe to run repeatedly.

-- 1. New profile columns ---------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'inspector';

-- Role integrity: restrict to the two platform-recognized values. Existing
-- rows that already carry an arbitrary free-text role (not in the list) are
-- left untouched by the CHECK, which only guards NEW/edited values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('inspector', 'admin'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_verification_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_verification_status_check
      CHECK (verification_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inspector_employee_id TEXT;

-- Enforce a single inspector per employee ID (official ID number is unique).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_inspector_employee_id_key
  ON public.profiles (inspector_employee_id)
  WHERE inspector_employee_id IS NOT NULL AND inspector_employee_id <> '';

-- 2. Consolidate existing profiles into a known-good state -------------
-- Every pre-existing profile was created as a trusted officer (inset directly
-- or before the verification flow existed), so they are all approved inspectors.
UPDATE public.profiles
SET role = 'inspector',
    verification_status = 'approved'
WHERE role IS NULL OR role = ''
   OR verification_status IS NULL OR verification_status = '';

-- Empty-string employee IDs are unambiguous duplicates of "unset" and prevent
-- the unique index above from working; normalize them to NULL.
UPDATE public.profiles
SET inspector_employee_id = NULL
WHERE inspector_employee_id = '';

-- 3. Extended auth trigger for new sign-ups ---------------------------
-- On auth.users insert, carry over every registration field the signup form
-- puts into user_metadata. New inspectors start as pending; only an admin
-- can flip them to approved/rejected (see settings admin UI).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    verification_status,
    department,
    designation,
    employee_id,
    phone,
    organization,
    location,
    inspector_employee_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta->>'full_name', meta->>'name', 'Compliance Officer'),
    COALESCE(meta->>'role', 'inspector'),
    COALESCE(meta->>'verification_status', 'pending'),
    meta->>'department',
    meta->>'designation',
    meta->>'employee_id',
    meta->>'phone',
    meta->>'organization',
    meta->>'location',
    meta->>'inspector_employee_id',
    NOW(),
    NOW()
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  -- Profile already exists (e.g. the row was created by a previous trigger
  -- run or seeded manually); leave it untouched.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. RLS: permit admins to read/verify every profile ------------------
-- Inspectors keep owner-scoped access (their own row). Admins need to list
-- pending inspectors and update their verification_status, so grant them a
-- broader SELECT and an UPDATE that (only) touches status/role fields.
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can verify profiles" ON public.profiles;
CREATE POLICY "Admins can verify profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

-- 5. Harden owner-scoped profile policies -----------------------------
-- The baseline "Users can update own profile" policy had only
-- `USING (auth.uid() = id)` — no WITH CHECK — so any user could self-approve
-- (or self-promote to admin). Restrict owner updates to non-security columns:
-- role and verification_status may only change through an admin policy.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND NEW.role IS NOT DISTINCT FROM OLD.role
    AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status
  );

-- Align the insert policy too: new profiles must come in as non-admin and
-- pending. (The auth trigger normally creates the row first; this guards the
-- direct-insert path.)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    AND NEW.role IS NOT DISTINCT FROM 'inspector'
    AND NEW.verification_status IS NOT DISTINCT FROM 'pending'
  );
