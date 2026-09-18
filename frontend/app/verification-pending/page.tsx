'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { getMyProfile } from '@/lib/supabase/inspectionService';
import { Button } from '@/components/ui/Button';

const POLL_INTERVAL_MS = 15000;

export default function VerificationPendingPage() {
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();
  const [status, setStatus] = React.useState<'pending' | 'approved' | 'rejected' | null>(null);

  const identifier = user?.inspectorEmployeeId || user?.name || 'your Inspector ID';

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  React.useEffect(() => {
    if (isLoading || !user) return;

    let cancelled = false;
    const checkStatus = async () => {
      const { data, error } = await getMyProfile();
      if (cancelled || error || !data) return;
      const v = data.verification_status;
      if (v === 'approved' || v === 'rejected') {
        setStatus(v);
      }
    };

    checkStatus();

    const interval = setInterval(checkStatus, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkStatus();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isLoading, user]);

  if (status === 'approved') {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
        <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>Account Approved</span>
          </div>
          <div className="hidden sm:block text-body-sm font-mono text-outline">
            Rule Engine v2.4.1 Active
          </div>
        </header>

        <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-green-500/25 bg-green-500/15 text-green-600 shadow-md">
                <span className="material-symbols-outlined text-[32px]">verified</span>
              </div>
              <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
                Account Approved
              </h1>
              <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
                PackIntel • Legal Metrology Platform
              </p>
            </div>

            <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-green-500/25 bg-green-500/10 text-body-sm font-body-sm text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-green-600 shrink-0 mt-0.5">
                check_circle
              </span>
              <div>
                <p className="font-semibold">Your PackIntel account has been approved by the administrator.</p>
                <p className="mt-1 text-on-surface-variant">
                  You can now sign in and access all inspection tools.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-outline-variant/60">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="primary"
                  className="flex-1 justify-center"
                  onClick={() => signOut()}
                  icon="login"
                >
                  Go to Login
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
          </div>
        </main>

        <footer className="w-full max-w-5xl py-4 flex flex-col sm:flex-row justify-between items-center text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/60 gap-2">
          <div>© 2024–2026 PackIntel • Department of Consumer Affairs, Government of India</div>
          <div>Verification & Authorization System</div>
        </footer>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
        <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Account Verification Rejected</span>
          </div>
          <div className="hidden sm:block text-body-sm font-mono text-outline">
            Rule Engine v2.4.1 Active
          </div>
        </header>

        <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
          <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-error/25 bg-error/10 text-error shadow-md">
                <span className="material-symbols-outlined text-[32px]">gpp_bad</span>
              </div>
              <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
                Account Rejected
              </h1>
              <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
                PackIntel • Legal Metrology Platform
              </p>
            </div>

            <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-error/25 bg-error/10 text-body-sm font-body-sm text-on-surface">
              <span className="material-symbols-outlined text-[18px] text-error shrink-0 mt-0.5">
                cancel
              </span>
              <div>
                <p className="font-semibold">Your inspector account registration was not approved.</p>
                <p className="mt-1 text-on-surface-variant">
                  The account for <strong>{identifier}</strong> was rejected during the verification review.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-surface-container-low text-body-sm font-body-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
                contact_support
              </span>
              <p>
                If you believe this is an error, contact your administrator or the Legal Metrology
                division with your Inspector ID to appeal or re-register.
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-outline-variant/60">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="primary"
                  className="flex-1 justify-center"
                  onClick={() => signOut()}
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
              Registration details cannot be edited here. Contact your administrator.
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
                Registration for <strong>{identifier}</strong> has been submitted and is awaiting administrator
                review.
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
              Need help or believe this is taking too long? Contact your administrator with your Inspector ID.
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
