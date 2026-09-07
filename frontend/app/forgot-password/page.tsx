'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setErrorMessage('Please enter a valid inspector email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await resetPassword(trimmed);
      if (result.success) {
        setSubmitted(true);
      } else {
        setErrorMessage(result.error || 'Failed to send reset email. Please try again.');
      }
    } catch {
      setErrorMessage('Service temporarily unavailable. Please try again.');
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
          Security Services
        </div>
      </header>

      {/* Main Container */}
      <main className="w-full flex items-center justify-center my-auto py-8">
        <div className="w-full max-w-md bg-surface border border-outline-variant rounded-2xl p-6 sm:p-8 shadow-xl relative">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-bold text-xl shadow-xs mb-3">
              <span className="material-symbols-outlined text-[26px]">lock_reset</span>
            </div>
            <h1 className="text-xl font-bold font-sans text-on-surface">
              Reset Inspector Password
            </h1>
            <p className="text-xs text-on-surface-variant mt-1 max-w-xs">
              Enter your registered inspector email to receive a secure recovery link.
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

          {submitted ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-green-50 border border-green-200 text-center">
                <span className="material-symbols-outlined text-green-600 text-3xl mb-1">
                  mark_email_read
                </span>
                <h3 className="text-sm font-bold text-green-900">
                  Password Reset Email Sent
                </h3>
                <p className="text-xs text-green-800 mt-1 leading-relaxed">
                  We have dispatched recovery instructions to <strong>{email}</strong>. Please check your inbox and follow the secure link.
                </p>
              </div>

              <Link href="/login" className="block w-full">
                <Button variant="primary" className="w-full py-2.5 justify-center text-xs font-bold">
                  Return to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="recovery_email"
                  className="block text-xs font-label-bold font-semibold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Registered Email
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
                    email
                  </span>
                  <input
                    id="recovery_email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    placeholder="Enter registered inspector email"
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
                {isSubmitting ? 'Dispatching Recovery Link...' : 'Send Recovery Link'}
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                  Back to Sign In
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
