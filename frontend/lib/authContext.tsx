'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { getMyProfile } from '@/lib/supabase/inspectionService';

export interface InspectorProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  // Machine role from profiles.role / auth user_metadata.role:
  // 'inspector' | 'admin' (distinct from the free-text display designation).
  platformRole?: string;
  department: string;
  employeeId?: string | null;
  avatarUrl?: string | null;
  verificationStatus?: 'pending' | 'approved' | 'rejected';
  organization?: string | null;
  location?: string | null;
  inspectorEmployeeId?: string | null;
  isDemo?: boolean;
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
  signIn: (credentials: { email: string; password: string }) => Promise<{ success: boolean; error?: string }>;
  signUp: (credentials: SignUpCredentials) => Promise<{ success: boolean; error?: string }>;
  signInWithDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

const DEMO_INSPECTOR: InspectorProfile = {
  id: 'insp-sih-2026-gov',
  email: 'inspector.metrology@gov.in',
  name: 'Compliance Officer (Legal Metrology)',
  role: 'Senior Legal Metrology Inspector',
  platformRole: 'admin',
  department: 'Dept. of Consumer Affairs, Legal Metrology Division',
  verificationStatus: 'approved',
  organization: 'Dept. of Consumer Affairs',
  location: 'New Delhi',
  isDemo: true,
};

// Resolves the promise only if it settles within `ms`; otherwise resolves to
// `fallback`. Prevents stale/invalid Supabase session refreshes (e.g. a stored
// sb-<project>-auth-token in localStorage) from blocking auth initialization
// forever and leaving the app pinned to the "Verifying inspector credentials"
// loading screen.
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
// regular cookie so the middleware can decode user_metadata (role +
// verification_status) and enforce server-side route protection. The demo
// account has no Supabase token, so it sets its own marker cookie instead.
const SESSION_COOKIE = 'packintel_access_token';
const DEMO_COOKIE = 'packintel_demo';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function setSessionCookie(token: string | null | undefined): void {
  if (typeof document === 'undefined') return;
  if (token) {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
  }
}

function setDemoCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${DEMO_COOKIE}=1; path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

function clearAuthCookies(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE}=; path=/; Max-Age=0`;
  document.cookie = `${DEMO_COOKIE}=; path=/; Max-Age=0`;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to map Supabase User to InspectorProfile (pure, stable)
function mapSupabaseUserToProfile(sbUser: User): InspectorProfile {
  const meta = sbUser.user_metadata || {};
  const verificationStatus = (meta.verification_status as InspectorProfile['verificationStatus']) || 'approved';
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
    verificationStatus,
    organization: meta.organization || null,
    location: meta.location || null,
    inspectorEmployeeId: meta.inspector_employee_id || null,
    isDemo: false,
  };
}

// Load profile from Supabase profiles table (pure, stable)
async function loadProfileFromSupabase(sbUser: User): Promise<InspectorProfile> {
  if (!isSupabaseConfigured) {
    return mapSupabaseUserToProfile(sbUser);
  }

  try {
    const { data, error } = await getMyProfile();
    if (!error && data) {
      const verificationStatus = (data.verification_status as InspectorProfile['verificationStatus']) || 'approved';
      return {
        id: data.id,
        email: data.email || sbUser.email || '',
        name: data.full_name || sbUser.user_metadata?.full_name || 'Compliance Officer',
        role: data.designation || sbUser.user_metadata?.role || 'Legal Metrology Inspector',
        platformRole: data.role || 'inspector',
        department: data.department || sbUser.user_metadata?.department || 'Dept. of Consumer Affairs',
        employeeId: data.employee_id,
        avatarUrl: data.avatar_url,
        verificationStatus,
        organization: data.organization || sbUser.user_metadata?.organization || null,
        location: data.location || sbUser.user_metadata?.location || null,
        inspectorEmployeeId: data.inspector_employee_id || null,
        isDemo: false,
      };
    }
  } catch (err) {
    console.error('Failed to load profile from Supabase:', err);
  }

  // Fallback to user metadata
  return mapSupabaseUserToProfile(sbUser);
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
            // Stale or invalid refresh token - clear session cleanly
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

        // Check for local demo inspector session
        if (typeof window !== 'undefined') {
          const storedDemo = localStorage.getItem('packintel_demo_session');
          if (storedDemo && mounted) {
            try {
              const parsed = JSON.parse(storedDemo);
              setUser(parsed);
              setIsLoading(false);
              return;
            } catch {
              localStorage.removeItem('packintel_demo_session');
            }
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    initializeAuth();

    // Listen to Supabase auth events if configured
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
          if (typeof window !== 'undefined') {
            localStorage.removeItem('packintel_demo_session');
          }
        } else {
          // Only clear if not in demo session
          const storedDemo = typeof window !== 'undefined' ? localStorage.getItem('packintel_demo_session') : null;
          if (!storedDemo) {
            setSession(null);
            setSupabaseUser(null);
            setUser(null);
            setSessionCookie(null);
          }
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

  const signInWithDemo = useCallback(async () => {
    setIsLoading(true);
    setUser(DEMO_INSPECTOR);
    setDemoCookie();
    if (typeof window !== 'undefined') {
      localStorage.setItem('packintel_demo_session', JSON.stringify(DEMO_INSPECTOR));
    }
    setIsLoading(false);
    router.push('/dashboard');
  }, [router]);

  const signIn = useCallback(async ({ email, password }: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setIsLoading(false);
          if (error.message?.toLowerCase().includes('invalid login credentials') || error.status === 400) {
            return {
              success: false,
              error: 'Invalid email or password. Please check your credentials or create an inspector account.',
            };
          }
          if (error.message?.toLowerCase().includes('email not confirmed')) {
            return { success: false, error: 'Please confirm your email before signing in.' };
          }
          return { success: false, error: error.message || 'Unable to sign in. Please verify your credentials.' };
        }

        if (data.user) {
          setSession(data.session);
          setSupabaseUser(data.user);
          setSessionCookie(data.session?.access_token);
          const profile = await loadProfileFromSupabase(data.user);
          setUser(profile);
          setIsLoading(false);
          const status = profile.verificationStatus || 'approved';
          if (status === 'pending') {
            router.push('/verification-pending');
          } else if (status === 'rejected') {
            router.push('/verification-rejected');
          } else {
            router.push('/dashboard');
          }
          return { success: true };
        }
      }

      // If Supabase is not connected or mock fallback
      if (email.toLowerCase() === DEMO_INSPECTOR.email.toLowerCase() && password === 'PackIntel2026!') {
        await signInWithDemo();
        return { success: true };
      }

      if (!isSupabaseConfigured) {
        return {
          success: false,
          error:
            'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment. Use "Use Demo Inspector Account" for demonstration.',
        };
      }

      return {
        success: false,
        error: 'Invalid email or password. Please check your credentials or create an inspector account.',
      };
    } catch {
      setIsLoading(false);
      return { success: false, error: 'An unexpected authentication error occurred. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  }, [router, signInWithDemo]);

  const signUp = useCallback(async ({ email, password, fullName, department, designation, employeeId, phone, organization, location, inspectorEmployeeId }: SignUpCredentials) => {
    setIsLoading(true);
    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName || 'Legal Metrology Inspector',
              role: 'inspector',
              verification_status: 'pending',
              department: department || 'Dept. of Consumer Affairs',
              designation: designation || 'Legal Metrology Inspector',
              employee_id: employeeId || null,
              phone: phone || null,
              organization: organization || null,
              location: location || null,
              inspector_employee_id: inspectorEmployeeId || null,
            },
          },
        });

        if (error) {
          setIsLoading(false);
          if (error.message?.toLowerCase().includes('already registered')) {
            return { success: false, error: 'An inspector account with this email already exists.' };
          }
          return { success: false, error: error.message || 'Failed to create account.' };
        }

        if (data.user) {
          setSupabaseUser(data.user);
          // New inspectors are always pending until an admin approves them —
          // never auto-navigate to the dashboard on sign-up.
          //
          // Fire-and-forget notifies the admin verification email address. It
          // is deliberately not awaited: a failed email must never fail the
          // registration, and admins can re-send from the Settings page.
          // Safe diagnostic: logs the exact id GoTrue persisted and the public
          // project reference the browser client talks to, so a cross-project
          // mismatch (signup lands in project X, notify-admin looks in project
          // Y) is immediately visible. Never logs passwords, tokens, or keys.
          const browserProject = (() => {
            try {
              const u = (supabase as unknown as { supabaseUrl?: string })?.supabaseUrl || '';
              return u.replace(/^https:\/\//, '').split('.')[0] || '?';
            } catch {
              return '?';
            }
          })();
          console.log('[signup] Auth signup successful:', {
            userId: data.user?.id,
            email: data.user?.email,
            browserProject,
          });
          const userId = data.user.id;
          try {
            const res = await fetch('/api/signup/notify-admin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: data.user.id,
                email: data.user.email,
              }),
            });
            if (!res.ok) {
  const text = await res.text();

  console.error(
    `[signup] notify-admin failed: HTTP ${res.status} ${res.statusText} | ${text}`
  );

  console.error('[signup] notify-admin request userId:', data.user.id);
}
          } catch {
            // The email is best-effort; a pending registration stays out of
            // the app until an admin approves it.
          }
          if (data.session) {
            setSession(data.session);
            setSessionCookie(data.session.access_token);
            const profile = await loadProfileFromSupabase(data.user);
            setUser(profile);
          } else {
            // Email confirmation is required — no session yet.  Set a
            // temporary profile from auth user metadata so downstream pages
            // (verification-pending) can display the user's email.
            const tempProfile = mapSupabaseUserToProfile(data.user);
            setUser(tempProfile);
          }
          return { success: true };
        }
      }
      return { success: false, error: 'Supabase credentials not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.' };
    } catch {
      return { success: false, error: 'An unexpected error occurred during registration.' };
    } finally {
      setIsLoading(false);
    }
  }, [router]);

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
      if (typeof window !== 'undefined') {
        localStorage.removeItem('packintel_demo_session');
      }
      setSession(null);
      setSupabaseUser(null);
      setUser(null);
      setIsLoading(false);
      router.push('/login');
    }
  }, [router]);

  const resetPassword = useCallback(async (email: string) => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid inspector email address.' };
    }

    try {
      if (isSupabaseConfigured) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password`,
        });

        if (error) {
          return { success: false, error: 'Failed to send password reset link. Please verify your email.' };
        }
      }

      return { success: true };
    } catch {
      return { success: false, error: 'Failed to process password reset request.' };
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!password || password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters long.' };
    }

    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          return { success: false, error: error.message || 'Failed to update password.' };
        }
      }
      return { success: true };
    } catch {
      return { success: false, error: 'Failed to update password.' };
    }
  }, []);

  const contextValue = useMemo<AuthContextType>(
    () => ({
      user,
      supabaseUser,
      session,
      isLoading,
      isSupabaseConnected: isSupabaseConfigured,
      signIn,
      signUp,
      signInWithDemo,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [
      user,
      supabaseUser,
      session,
      isLoading,
      signIn,
      signUp,
      signInWithDemo,
      signOut,
      resetPassword,
      updatePassword,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
