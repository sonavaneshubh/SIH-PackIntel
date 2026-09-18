'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getMyProfile } from '@/lib/supabase/inspectionService';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface InspectorProfile {
  id: string;
  // For Inspector-ID accounts this is the synthetic Auth address, not a real
  // mailbox. Prefer `inspectorEmployeeId` for display.
  email: string;
  name: string;
  role: string;
  platformRole?: string;
  department: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  verificationStatus?: VerificationStatus;
  organization?: string | null;
  location?: string | null;
  inspectorEmployeeId?: string | null;
  accessType?: 'official' | 'demo';
}

export interface RequestOtpResult {
  success: boolean;
  error?: string;
  demoOtp?: string;
  retryAfterSeconds?: number;
  expiresInSeconds?: number;
}

export interface SignUpCredentials {
  email: string;
  password: string;
  fullName?: string;
  department?: string;
  designation?: string;
  employeeId?: string;
  phone?: string;
  organization?: string;
  location?: string;
  inspectorEmployeeId?: string;
}

interface AuthContextType {
  user: InspectorProfile | null;
  supabaseUser: User | null;
  session: Session | null;
  isLoading: boolean;
  isSupabaseConnected: boolean;
  requestOtp: (inspectorId: string) => Promise<RequestOtpResult>;
  verifyOtp: (inspectorId: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  // Password login for BOTH supported methods: an Inspector ID
  // ("DEMO-INS-001") or an existing account email. The identifier is resolved
  // server-side; authorization is always read from the profiles table.
  signInWithPassword: (
    identifier: string,
    password: string
  ) => Promise<{ success: boolean; error?: string }>;
  // One-click login as the pre-authorized demo inspector. Resolves the
  // configured demo account (DEMO_INSPECTOR_ID) server-side and mints a real
  // Supabase session, so the demo user lands in the full inspector workspace.
  signInAsDemo: () => Promise<{ success: boolean; error?: string }>;
  // Self-registration for pre-authorized inspectors. Creates the Supabase auth
  // identity and notifies the admin for verification; the account stays
  // pending until an administrator approves it.
  signUp: (credentials: SignUpCredentials) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const VALID_STATUSES: VerificationStatus[] = ['pending', 'approved', 'rejected', 'suspended'];

function normalizeVerificationStatus(raw: unknown): VerificationStatus {
  return VALID_STATUSES.includes(raw as VerificationStatus)
    ? (raw as VerificationStatus)
    : 'pending';
}

// Resolves the promise only if it settles within `ms`; otherwise resolves to
// `fallback`. Prevents stale/invalid Supabase session refreshes from blocking
// auth initialization forever.
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const AUTH_TIMEOUT_MS = 5000;

// The Supabase JS client stores the session in localStorage, which the Next.js
// middleware (server-side) cannot read. Mirror the access token JWT into a
// cookie so the middleware can decode user_metadata (role + verification_status)
// and enforce server-side route protection.
const SESSION_COOKIE = 'packintel_access_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function setSessionCookie(token: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  if (token) {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
  }
}

function clearAuthCookies(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUserToProfile(sbUser: User): InspectorProfile {
  const meta = sbUser.user_metadata || {};
  const rawRole = (meta.role as string) || '';
  const platformRole = rawRole === 'inspector' || rawRole === 'admin' ? rawRole : 'inspector';
  return {
    id: sbUser.id,
    email: sbUser.email || '',
    name: meta.full_name || meta.name || 'Compliance Officer',
    role: rawRole || 'Legal Metrology Inspector',
    platformRole,
    department: meta.department || 'Dept. of Consumer Affairs',
    employeeId: meta.employee_id || null,
    avatarUrl: null,
    verificationStatus: normalizeVerificationStatus(meta.verification_status),
    organization: meta.organization || null,
    location: meta.location || null,
    inspectorEmployeeId: meta.inspector_employee_id || null,
    accessType: meta.access_type === 'demo' ? 'demo' : 'official',
  };
}

async function loadProfileFromSupabase(sbUser: User): Promise<InspectorProfile> {
  if (!isSupabaseConfigured) {
    return mapSupabaseUserToProfile(sbUser);
  }

  try {
    const { data, error } = await getMyProfile();
    if (!error && data) {
      return {
        id: data.id,
        email: data.email || sbUser.email || '',
        name: data.full_name || sbUser.user_metadata?.full_name || 'Compliance Officer',
        role: data.designation || sbUser.user_metadata?.role || 'Legal Metrology Inspector',
        platformRole: data.role || 'inspector',
        department: data.department || sbUser.user_metadata?.department || 'Dept. of Consumer Affairs',
        employeeId: data.employee_id,
        avatarUrl: data.avatar_url,
        verificationStatus: normalizeVerificationStatus(data.verification_status),
        organization: data.organization || sbUser.user_metadata?.organization || null,
        location: data.location || sbUser.user_metadata?.location || null,
        inspectorEmployeeId: data.inspector_employee_id || null,
        accessType: mapSupabaseUserToProfile(sbUser).accessType,
      };
    }
  } catch (err) {
    console.error('Failed to load profile from Supabase:', err);
  }

  return mapSupabaseUserToProfile(sbUser);
}

function routeForStatus(
  status: VerificationStatus,
  router: ReturnType<typeof useRouter>
): void {
  if (status === 'pending') router.push('/verification-pending');
  else if (status === 'rejected') router.push('/verification-rejected');
  else if (status === 'suspended') router.push('/account-suspended');
  else router.push('/dashboard');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<InspectorProfile | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      try {
        if (isSupabaseConfigured) {
          const { data, error } = await withTimeout(
            supabase.auth.getSession(),
            AUTH_TIMEOUT_MS,
            { data: { session: null }, error: null }
          );
          if (error) {
            await supabase.auth.signOut().catch(() => {});
          } else if (data?.session?.user && mounted) {
            setSession(data.session);
            setSupabaseUser(data.session.user);
            setSessionCookie(data.session.access_token);
            const profile = await withTimeout(
              loadProfileFromSupabase(data.session.user),
              AUTH_TIMEOUT_MS,
              mapSupabaseUserToProfile(data.session.user)
            ).catch(() => mapSupabaseUserToProfile(data.session.user));
            setUser(profile);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initializeAuth();

    let authListener: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange(async (_event, currentSession) => {
        if (!mounted) return;
        if (currentSession?.user) {
          setSession(currentSession);
          setSupabaseUser(currentSession.user);
          setSessionCookie(currentSession.access_token);
          const profile = await withTimeout(
            loadProfileFromSupabase(currentSession.user),
            AUTH_TIMEOUT_MS,
            mapSupabaseUserToProfile(currentSession.user)
          ).catch(() => mapSupabaseUserToProfile(currentSession.user));
          setUser(profile);
        } else {
          setSession(null);
          setSupabaseUser(null);
          setUser(null);
          setSessionCookie(null);
        }
        setIsLoading(false);
      });
      authListener = data.subscription;
    }

    return () => {
      mounted = false;
      if (authListener) authListener.unsubscribe();
    };
  }, []);

  // Step 1: ask the backend to validate the Inspector ID and issue a one-time
  // code. Authorization is decided entirely server-side.
  const requestOtp = useCallback(async (inspectorId: string): Promise<RequestOtpResult> => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Authentication is not configured. Contact your administrator.' };
    }
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectorId }),
      });
      const body = (await res.json().catch(() => ({}))) as RequestOtpResult & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        return { success: false, error: body.error || 'Unable to verify the Inspector ID.' };
      }
      return {
        success: true,
        demoOtp: body.demoOtp,
        retryAfterSeconds: body.retryAfterSeconds,
        expiresInSeconds: body.expiresInSeconds,
      };
    } catch {
      return { success: false, error: 'Authentication service is temporarily unavailable. Please try again.' };
    }
  }, []);

  // Shared by every login method (password or one-time code): adopt the tokens
  // the server produced, load the authoritative profile and route by status.
  // This is what guarantees both methods land on the SAME inspector session.
  const establishSession = useCallback(
    async (
      accessToken: string,
      refreshToken: string
    ): Promise<{ success: boolean; error?: string }> => {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error || !data.user) {
        return { success: false, error: 'Unable to establish a session. Please try again.' };
      }

      setSession(data.session);
      setSupabaseUser(data.user);
      setSessionCookie(data.session?.access_token);

      let status: VerificationStatus = 'pending';
      let profile = mapSupabaseUserToProfile(data.user);
      try {
        const prof = await getMyProfile();
        if (!prof.error && prof.data && prof.data.id === data.user.id) {
          status = normalizeVerificationStatus(prof.data.verification_status);
          profile = {
            ...profile,
            id: prof.data.id,
            email: prof.data.email || profile.email,
            name: prof.data.full_name || profile.name,
            role: prof.data.designation || profile.role,
            platformRole: prof.data.role || profile.platformRole,
            department: prof.data.department || profile.department,
            organization: prof.data.organization || profile.organization,
            location: prof.data.location || profile.location,
            inspectorEmployeeId: prof.data.inspector_employee_id || profile.inspectorEmployeeId,
          };
        }
      } catch (profErr) {
        console.error('[auth] profile lookup failed', profErr);
      }

      profile.verificationStatus = status;
      setUser(profile);
      setIsLoading(false);
      routeForStatus(status, router);
      return { success: true };
    },
    [router]
  );

  // Step 2 of the one-time-code flow: verify the code, then adopt the session.
  const verifyOtp = useCallback(
    async (inspectorId: string, otp: string): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Authentication is not configured. Contact your administrator.' };
      }
      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inspectorId, otp }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { accessToken?: string; refreshToken?: string };
        };
        if (!res.ok || !body.ok || !body.session?.accessToken || !body.session?.refreshToken) {
          return { success: false, error: body.error || 'The code is incorrect or has expired.' };
        }
        return await establishSession(body.session.accessToken, body.session.refreshToken);
      } catch {
        return { success: false, error: 'An unexpected authentication error occurred. Please try again.' };
      } finally {
        setIsLoading(false);
      }
    },
    [establishSession]
  );

  // Password login (Inspector ID + password OR existing account + password).
  // The server authenticates the password with Supabase Auth and re-checks the
  // profiles row; the browser only adopts the resulting session.
  const signInWithPassword = useCallback(
    async (
      identifier: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Authentication is not configured. Contact your administrator.' };
      }
      setIsLoading(true);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, password }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          session?: { accessToken?: string; refreshToken?: string };
        };
        if (!res.ok || !body.ok || !body.session?.accessToken || !body.session?.refreshToken) {
          return { success: false, error: body.error || 'Invalid login credentials.' };
        }
        return await establishSession(body.session.accessToken, body.session.refreshToken);
      } catch {
        return { success: false, error: 'An unexpected authentication error occurred. Please try again.' };
      } finally {
        setIsLoading(false);
      }
    },
    [establishSession]
  );

  // One-click demo login. The server resolves the configured demo inspector,
  // enforces a demo access type, and mints a real Supabase session — the same
  // session path used by the OTP and password flows.
  const signInAsDemo = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isSupabaseConfigured) {
      return { success: false, error: 'Authentication is not configured. Contact your administrator.' };
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        session?: { accessToken?: string; refreshToken?: string };
      };
      if (!res.ok || !body.ok || !body.session?.accessToken || !body.session?.refreshToken) {
        return { success: false, error: body.error || 'The demo account is not available right now.' };
      }
      return await establishSession(body.session.accessToken, body.session.refreshToken);
    } catch {
      return { success: false, error: 'An unexpected error occurred while signing in to the demo account.' };
    } finally {
      setIsLoading(false);
    }
  }, [establishSession]);

  // Self-registration for pre-authorized inspectors. Creates the Supabase auth
  // identity with the inspector profile metadata, then best-effort notifies the
  // admin so the account can be verified. The account stays pending until an
  // administrator approves it.
  const signUp = useCallback(
    async (credentials: SignUpCredentials): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConfigured) {
        return { success: false, error: 'Registration is currently unavailable. Please contact your administrator.' };
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase.auth.signUp({
          email: credentials.email,
          password: credentials.password,
          options: {
            data: {
              full_name: credentials.fullName || 'Legal Metrology Inspector',
              role: 'inspector',
              verification_status: 'pending',
              department: credentials.department || 'Dept. of Consumer Affairs',
              designation: credentials.designation || 'Legal Metrology Inspector',
              employee_id: credentials.employeeId || null,
              phone: credentials.phone || null,
              organization: credentials.organization || null,
              location: credentials.location || null,
              inspector_employee_id: credentials.inspectorEmployeeId || null,
            },
          },
        });
        if (error || !data.user) {
          return { success: false, error: error?.message || 'Failed to create inspector account.' };
        }

        // Best-effort admin notification. A failure here must not fail the
        // registration; the pending profile remains reviewable.
        try {
          await fetch('/api/signup/notify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: data.user.id, email: data.user.email }),
          });
        } catch {
          // The admin email is best-effort only.
        }

        const newSession = data.session;
        if (newSession?.user) {
          setSession(newSession);
          setSupabaseUser(newSession.user);
          setSessionCookie(newSession.access_token);
          const profile = await withTimeout(
            loadProfileFromSupabase(newSession.user),
            AUTH_TIMEOUT_MS,
            mapSupabaseUserToProfile(newSession.user)
          ).catch(() => mapSupabaseUserToProfile(newSession.user));
          setUser(profile);
        }
        return { success: true };
      } catch {
        return { success: false, error: 'An unexpected error occurred during account registration.' };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Supabase sign out error:', err);
    } finally {
      clearAuthCookies();
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      setIsLoading(false);
      router.push('/login');
    }
  }, [router]);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      supabaseUser,
      session,
      isLoading,
      isSupabaseConnected: isSupabaseConfigured,
      requestOtp,
      verifyOtp,
      signInWithPassword,
      signInAsDemo,
      signUp,
      signOut,
    }),
    [user, supabaseUser, session, isLoading, requestOtp, verifyOtp, signInWithPassword, signInAsDemo, signUp, signOut]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
