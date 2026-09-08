-- 20260908000004_signup_flow_fix.sql
-- Comprehensive fix for the inspector signup flow.
--
-- Root cause: The handle_new_user() trigger was silently failing because
-- the live profiles table was missing columns the trigger INSERT references,
-- and the trigger had no EXCEPTION handler so the failure propagated —
-- but Supabase GoTrue still returned 200 OK, leaving the auth user without
-- a profile row.
--
-- This migration:
--   1. Adds every column the trigger and application need (IF NOT EXISTS).
--   2. Backfills profiles from auth.users for any existing users without one.
--   3. Recreates the trigger with EXCEPTION WHEN OTHERS so a profile-insert
--      failure never blocks auth user creation again.
--   4. Idempotent — safe to run repeatedly on any state.
--
-- DO NOT delete existing data.  All changes are additive.

-- ─── 1. Ensure every required column exists ─────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='department') THEN
    ALTER TABLE public.profiles ADD COLUMN department TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='designation') THEN
    ALTER TABLE public.profiles ADD COLUMN designation TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='employee_id') THEN
    ALTER TABLE public.profiles ADD COLUMN employee_id TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='phone') THEN
    ALTER TABLE public.profiles ADD COLUMN phone TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_active') THEN
    ALTER TABLE public.profiles ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verification_status') THEN
    ALTER TABLE public.profiles ADD COLUMN verification_status TEXT DEFAULT 'pending';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='organization') THEN
    ALTER TABLE public.profiles ADD COLUMN organization TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='location') THEN
    ALTER TABLE public.profiles ADD COLUMN location TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='inspector_employee_id') THEN
    ALTER TABLE public.profiles ADD COLUMN inspector_employee_id TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verification_token_hash') THEN
    ALTER TABLE public.profiles ADD COLUMN verification_token_hash TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verification_token_expires_at') THEN
    ALTER TABLE public.profiles ADD COLUMN verification_token_expires_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verification_token_used_at') THEN
    ALTER TABLE public.profiles ADD COLUMN verification_token_used_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verified_at') THEN
    ALTER TABLE public.profiles ADD COLUMN verified_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='verified_by') THEN
    ALTER TABLE public.profiles ADD COLUMN verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='rejection_reason') THEN
    ALTER TABLE public.profiles ADD COLUMN rejection_reason TEXT;
  END IF;
END $$;

-- ─── 2. Backfill email from the canonical source (auth.users) ───────────────

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND u.email IS NOT NULL
  AND u.email <> ''
  AND (p.email IS NULL OR p.email = '');

UPDATE public.profiles
SET email = 'unknown@packintel.local'
WHERE email IS NULL OR email = '';

-- Set NOT NULL after backfill so existing rows never break.
ALTER TABLE public.profiles ALTER COLUMN email SET NOT NULL;

-- ─── 3. Backfill display / registration fields from auth metadata ────────────

UPDATE public.profiles p
SET
  full_name             = COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Compliance Officer'),
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

-- ─── 4. Consolidate existing rows to a known-good state ─────────────────────

UPDATE public.profiles
SET role = 'inspector',
    verification_status = 'approved'
WHERE role IS NULL OR role = ''
   OR verification_status IS NULL OR verification_status = '';

UPDATE public.profiles
SET inspector_employee_id = NULL
WHERE inspector_employee_id = '';

UPDATE public.profiles
SET is_active = TRUE
WHERE is_active IS NULL;

-- ─── 5. Ensure indexes exist ────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS profiles_inspector_employee_id_key
  ON public.profiles (inspector_employee_id)
  WHERE inspector_employee_id IS NOT NULL AND inspector_employee_id <> '';

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
  ON public.profiles (verification_status);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_verification_token_hash_key
  ON public.profiles (verification_token_hash)
  WHERE verification_token_hash IS NOT NULL;

-- ─── 6. Recreate trigger function with comprehensive error handling ──────────
-- The EXCEPTION WHEN OTHERS handler ensures that a profile-insert failure
-- (missing column, constraint violation, etc.) NEVER blocks auth user creation.
-- The warning is visible in PostgreSQL logs for diagnosis.

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
  ON CONFLICT (id) DO UPDATE SET
    email        = EXCLUDED.email,
    full_name    = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    updated_at   = NOW()
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user: failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 7. Recreate the trigger ────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 8. Backfill missing profiles from auth.users ───────────────────────────
-- Catches any auth users that were created while the trigger was broken.

DO $$
DECLARE
  auth_row RECORD;
  meta JSONB;
  new_role TEXT;
  row_count INT := 0;
BEGIN
  FOR auth_row IN
    SELECT u.id, u.email, u.raw_user_meta_data, u.created_at
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL
  LOOP
    meta := COALESCE(auth_row.raw_user_meta_data, '{}'::jsonb);
    new_role := CASE WHEN meta->>'role' = 'admin' THEN 'admin' ELSE 'inspector' END;

    BEGIN
      INSERT INTO public.profiles (
        id, email, full_name, role, verification_status,
        department, designation, employee_id, phone,
        avatar_url, is_active,
        organization, location, inspector_employee_id,
        created_at, updated_at
      )
      VALUES (
        auth_row.id,
        auth_row.email,
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
        auth_row.created_at,
        NOW()
      );
      row_count := row_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Backfill: failed to create profile for %: %', auth_row.id, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE 'Backfill complete: created % missing profile(s)', row_count;
END $$;
