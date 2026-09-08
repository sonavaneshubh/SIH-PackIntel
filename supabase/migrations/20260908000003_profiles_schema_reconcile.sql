-- 20260908000003_profiles_schema_reconcile.sql
-- Reconcile the LIVE `profiles` table with the columns the PackIntel
-- application genuinely uses.
--
-- Live schema (introspected from the linked remote project, table
-- public.profiles) — only these columns exist today:
--
--   id         uuid           NOT NULL  (PK, FK -> auth.users ON DELETE CASCADE)
--   full_name  text
--   role       text           NOT NULL DEFAULT 'inspector'  (CHECK: inspector|admin)
--   created_at timestamptz    NOT NULL DEFAULT now()
--   updated_at timestamptz    NOT NULL DEFAULT now()
--
--   RLS enabled; owner-scoped policies (insert/select/update).
--   handle_new_user() trigger inserts only (id, full_name).
--
-- Why the mismatch exists:
--   1. The baseline migration created profiles with `CREATE TABLE IF NOT
--      EXISTS`, which is a no-op when the table already existed (created via
--      the Supabase dashboard template). Every column that exists only inside
--      that CREATE TABLE (email, department, designation, employee_id, phone,
--      avatar_url, is_active) was therefore never added to the live project.
--   2. The registration/verification columns from migrations
--      20260908000001/00002 are missing from the live table too — only
--      `role` made it over. This is the root cause of both
--      `column profiles.email does not exist` and
--      `column p.organization does not exist`.
--
-- Fix: add only the columns the running application actually selects/writes
-- (verified against the frontend: signup, settings, notify-admin, admin/verify,
-- admin/resend, admin/verification/[token], adminAuth, inspectionService,
-- types/database.ts), backfill existing rows from auth.users, upgrade the
-- handle_new_user() trigger so new signups populate every column, and leave
-- the owner-scoped RLS policies, other tables, and all existing migration
-- history untouched.
--
-- Idempotent and safe to run repeatedly.

-- 1. Registration / profile columns the app actually uses --------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS designation TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_id TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organization TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS inspector_employee_id TEXT;

-- 2. Admin verification lifecycle columns (admin verify/resend flows) --------
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

-- 3. Backfill `email` from the canonical source, auth.users ------------------
-- profiles.email is a denormalized copy of auth.users.email; restored here for
-- pre-existing rows. /api/signup/notify-admin additionally reads the email
-- directly from auth.users via the service-role admin API, so notifications
-- stay correct even for a row whose email is still NULL.
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND u.email IS NOT NULL
  AND u.email <> ''
  AND (p.email IS NULL OR p.email = '');

-- Orphaned profile rows (no matching auth.users row) get a stable placeholder
-- so the NOT NULL constraint below can never fail the migration.
UPDATE public.profiles
SET email = 'unknown@packintel.local'
WHERE email IS NULL OR email = '';

ALTER TABLE public.profiles
  ALTER COLUMN email SET NOT NULL;

-- 4. Backfill registration/display fields from auth user metadata ------------
-- Carries the signup-form fields over to existing rows so they match the
-- application's expected profile without forcing a re-signup.
UPDATE public.profiles p
SET
  full_name             = COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  department            = COALESCE(p.department, u.raw_user_meta_data->>'department'),
  designation           = COALESCE(p.designation, u.raw_user_meta_data->>'designation'),
  employee_id           = COALESCE(p.employee_id, u.raw_user_meta_data->>'employee_id'),
  phone                 = COALESCE(p.phone, u.raw_user_meta_data->>'phone'),
  avatar_url            = COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url'),
  organization          = COALESCE(p.organization, u.raw_user_meta_data->>'organization'),
  location              = COALESCE(p.location, u.raw_user_meta_data->>'location'),
  inspector_employee_id = COALESCE(p.inspector_employee_id, u.raw_user_meta_data->>'inspector_employee_id')
FROM auth.users u
WHERE p.id = u.id;

-- 5. Consolidate pre-existing profiles into a known-good state ----------------
-- Legacy profiles were created as trusted officers before the verification
-- flow existed (mirrors migration 20260908000001): they are approved
-- inspectors. Empty-string employee IDs are unset; normalize to NULL.
UPDATE public.profiles
SET role = 'inspector',
    verification_status = 'approved'
WHERE role IS NULL OR role = ''
   OR verification_status IS NULL OR verification_status = '';

UPDATE public.profiles
SET inspector_employee_id = NULL
WHERE inspector_employee_id = '';

-- 6. Upgrade the auth trigger so NEW signups populate every column -----------
-- The existing live trigger inserts only (id, full_name). Replace it with the
-- extended version so new registrations carry email, role, verification_status
-- and all signup-form fields into profiles. The email comes from NEW.email
-- inside the SECURITY DEFINER function (server-side auth.users data), never
-- from the client. Values are coerced to the platform's allowed role so the
-- existing profiles_role_check constraint can never reject a signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  new_role TEXT := CASE WHEN meta->>'role' = 'admin' THEN 'admin' ELSE 'inspector' END;
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, role, verification_status,
    department, designation, employee_id, phone,
    avatar_url, is_active,
    organization, location, inspector_employee_id,
    created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(meta->>'full_name', meta->>'name', 'Compliance Officer'),
    new_role,
    COALESCE(meta->>'verification_status', 'pending'),
    meta->>'department',
    meta->>'designation',
    meta->>'employee_id',
    meta->>'phone',
    meta->>'avatar_url',
    TRUE,
    meta->>'organization',
    meta->>'location',
    meta->>'inspector_employee_id',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Indexes used by the admin verification flow -----------------------------
CREATE UNIQUE INDEX IF NOT EXISTS profiles_verification_token_hash_key
  ON public.profiles (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles (verification_status);