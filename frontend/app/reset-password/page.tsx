'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!password || password.length < 6) {
      setErrorMessage('Password must contain at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updatePassword(password);
      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } else {
        setErrorMessage(result.error || 'Failed to update password. Please try again.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-container-low flex flex-col justify-between items-center p-4 sm:p-6 antialiased">
      {/* Top Header */}
      <header className="w-full max-w-5xl py-2 flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 text-xs text-on-surface-variant">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <span className="w-2 h-2 shrink-0 rounded-full bg-green-500" />
          <span className="truncate">Legal Metrology Compliance Enforcement Portal</span>
        </div>
        <div className="text-[11px] font-mono text-outline">
          Password Credential Management
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full flex items-center justify-center my-auto py-8">
        <div className="w-full max-w-md bg-surface border border-outline-variant rounded-2xl p-6 sm:p-8 shadow-xl relative">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold text-xl shadow-xs mb-3">
              <span className="material-symbols-outlined text-[26px]">key</span>
            </div>
            <h1 className="text-xl font-bold font-sans text-on-surface">
              Set New Password
            </h1>
            <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
              Establish new secure credentials for your inspector account.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0 mt-0.5">
                error
              </span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {success ? (
            <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-center space-y-3">
              <span className="material-symbols-outlined text-green-600 text-3xl">
                check_circle
              </span>
              <h3 className="text-sm font-bold text-green-900">
                Password Successfully Updated
              </h3>
              <p className="text-xs text-green-800">
                Redirecting you to the PackIntel Dashboard...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="new_password"
                  className="block text-xs font-label-bold font-semibold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  New Password
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                    lock
                  </span>
                  <input
                    id="new_password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Enter new password (min. 6 chars)"
                    disabled={isSubmitting}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-10 py-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 p-1 text-outline hover:text-on-surface transition-colors cursor-pointer rounded"
                    tabIndex={-1}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="confirm_password"
                  className="block text-xs font-label-bold font-semibold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                    lock_clock
                  </span>
                  <input
                    id="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Re-enter new password"
                    disabled={isSubmitting}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-lg pl-10 pr-3.5 py-2.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all disabled:opacity-60"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                className="w-full py-2.5 shadow-sm justify-center text-xs font-bold tracking-wide mt-2"
              >
                {isSubmitting ? 'Updating Credentials...' : 'Save New Password'}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Cancel and Return to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-4 flex flex-col sm:flex-row justify-between items-center text-[11px] text-on-surface-variant border-t border-outline-variant/60 gap-2">
        <div>© 2024–2026 PackIntel • Department of Consumer Affairs, Government of India</div>
        <div>Legal Metrology Verification Service</div>
      </footer>
    </div>
  );
}
