'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';

export default function VerificationPendingPage() {
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();

  const email = user?.email || 'your registered email';

  React.useEffect(() => {
    // Only redirect to login if loading is complete AND there is no user
    // AND we are not in a post-signup state (no session yet, email confirmation pending).
    // The signup flow sets a temporary user from auth metadata, so user will
    // be non-null even without a session.
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
      <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>Account Pending Verification</span>
        </div>
        <div className="hidden sm:block text-body-sm font-mono text-outline">
          Rule Engine v2.4.1 Active
        </div>
      </header>

      <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
        <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/15 text-amber-600 shadow-md">
              <span className="material-symbols-outlined text-[32px]">hourglass_top</span>
            </div>
            <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
              Verification Pending
            </h1>
            <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
              PackIntel • Legal Metrology Platform
            </p>
          </div>

          <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-body-sm font-body-sm text-on-surface">
            <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0 mt-0.5">
              schedule
            </span>
            <div>
              <p className="font-semibold">Your inspector account is awaiting administrator approval.</p>
              <p className="mt-1 text-on-surface-variant">
                Registration for <strong>{email}</strong> has been submitted and a verification email has been
                sent.
              </p>
            </div>
          </div>

          <ol className="mt-6 space-y-3 text-body-sm font-body-sm text-on-surface-variant">
            {[
              ['1', 'Your official details & Inspector ID are reviewed by an administrator.'],
              ['2', 'Approval typically takes up to 1–2 business days.'],
              ['3', 'Once approved, you can sign in and access all inspection tools.'],
            ].map(([step, text]) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  {step}
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ol>

          <div className="mt-6 pt-5 border-t border-outline-variant/60">
            <p className="text-body-sm font-body-sm text-on-surface-variant mb-4">
              Need help or believe this is taking too long? Contact your administrator with your registered email.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="primary"
                className="flex-1 justify-center"
                onClick={() => router.push('/login')}
                icon="arrow_back"
              >
                Back to Sign In
              </Button>
              <Button
                variant="outline"
                className="flex-1 justify-center"
                onClick={() => signOut()}
                icon="logout"
              >
                Sign Out
              </Button>
            </div>
          </div>

          <p className="mt-5 text-center text-body-sm font-body-sm text-on-surface-variant">
            Waiting on authorization?{' '}
            <Link href="/login" className="text-primary font-bold hover:underline">
              Sign in with another account
            </Link>
          </p>
        </div>
      </main>

      <footer className="w-full max-w-5xl py-4 flex flex-col sm:flex-row justify-between items-center text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/60 gap-2">
        <div>© 2024–2026 PackIntel • Department of Consumer Affairs, Government of India</div>
        <div>Verification & Authorization System</div>
      </footer>
    </div>
  );
}