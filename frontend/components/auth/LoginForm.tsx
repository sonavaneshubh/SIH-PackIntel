'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';

export function LoginForm() {
  const router = useRouter();
  const { signIn, signInWithDemo, user, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDemoSubmitting, setIsDemoSubmitting] = useState(false);

  // If already authenticated, route by verification status
  React.useEffect(() => {
    if (user && !authLoading) {
      const status = user.verificationStatus || 'approved';
      if (status === 'pending') {
        router.replace('/verification-pending');
      } else if (status === 'rejected') {
        router.replace('/verification-rejected');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Form validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your inspector email address.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email format (e.g. inspector@gov.in).');
      return;
    }

    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must contain at least 6 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signIn({ email: trimmedEmail, password });
      if (!result.success) {
        setErrorMessage(result.error || 'Invalid email or password.');
      }
    } catch {
      setErrorMessage('Authentication service temporarily unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setErrorMessage(null);
    setIsDemoSubmitting(true);
    try {
      await signInWithDemo();
    } catch {
      setErrorMessage('Failed to sign in with demo account.');
    } finally {
      setIsDemoSubmitting(false);
    }
  };

  return (
    <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
      {/* Top Brand & Emblem Header */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary text-2xl font-bold text-on-primary shadow-md">
          <span className="material-symbols-outlined text-[32px]">verified_user</span>
        </div>
        <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
          PackIntel
        </h1>
        <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
          Legal Metrology Compliance Inspection Platform
        </p>
        <p className="mt-1.5 text-body-sm font-body-sm text-on-surface-variant">
          Scan. Verify. Compare. Detect. Prioritize.
        </p>
      </div>

      {/* Error Alert Box */}
      {errorMessage && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-body-sm font-body-sm text-[#B91C1C] animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0 mt-0.5">
            error
          </span>
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Email Field */}
        <div>
          <label
            htmlFor="inspector_email"
            className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
          >
            Inspector Email
          </label>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
              badge
            </span>
            <input
              id="inspector_email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Enter inspector email"
              disabled={isSubmitting || isDemoSubmitting}
              className="h-14 w-full rounded-lg border border-outline-variant bg-surface-container-low pl-10 pr-3.5 text-body-base font-body-base text-on-surface placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label
              htmlFor="inspector_password"
              className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-body-sm font-label-bold text-primary hover:text-primary-container hover:underline"
            >
              Forgot Password?
            </Link>
          </div>
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
              lock
            </span>
            <input
              id="inspector_password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder="Enter password"
              disabled={isSubmitting || isDemoSubmitting}
              className="h-14 w-full rounded-lg border border-outline-variant bg-surface-container-low pl-10 pr-10 text-body-base font-body-base text-on-surface placeholder:text-outline transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 p-1 text-outline hover:text-on-surface transition-colors cursor-pointer rounded"
              title={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              <span className="material-symbols-outlined text-[18px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Submit Sign In Button */}
        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || isDemoSubmitting}
            className="h-14 w-full justify-center rounded-lg bg-primary-container text-sm font-label-bold tracking-wide shadow-sm hover:bg-primary"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing In...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px]">login</span>
                Sign In
              </span>
            )}
          </Button>
        </div>

        {/* Sign Up Link Option */}
        <div className="text-center pt-2">
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Don&apos;t have an inspector account yet?{' '}
            <Link href="/signup" className="text-primary font-bold hover:underline">
              Create account
            </Link>
          </p>
        </div>
      </form>

      {/* Demo Section for SIH Presentation */}
      <div className="mt-5 pt-4 border-t border-outline-variant/70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-label-bold font-label-bold uppercase tracking-wider text-on-surface-variant">
            SIH 2026 Evaluation
          </span>
          <span className="rounded border border-[#BBF7D0] bg-[#F0FDF4] px-1.5 py-0.5 text-label-bold font-label-bold text-[#15803D]">
            Instant Access
          </span>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleDemoSignIn}
          disabled={isSubmitting || isDemoSubmitting}
          className="h-12 w-full justify-center border-dashed border-primary/50 text-body-sm font-label-bold text-primary shadow-none transition-colors hover:border-primary hover:bg-primary/5"
        >
          {isDemoSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Loading Demo Account...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">smart_toy</span>
              Use Demo Inspector Account
            </span>
          )}
        </Button>
        <p className="mt-1.5 text-center text-body-sm font-body-sm text-outline">
          Pre-configures authorized Legal Metrology officer credentials for live jury inspection.
        </p>
      </div>

      {/* Official Government Disclaimer */}
      <div className="mt-5 pt-3 border-t border-outline-variant/50 text-center">
        <p className="flex items-center justify-center gap-1 text-body-sm font-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px] text-primary">security</span>
          Authorized Personnel Only • Ministry of Consumer Affairs, Govt. of India
        </p>
      </div>
    </div>
  );
}
