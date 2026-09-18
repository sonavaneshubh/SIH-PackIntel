'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';

export default function AccountSuspendedPage() {
  const router = useRouter();
  const { user, signOut, isLoading } = useAuth();

  const identifier = user?.inspectorEmployeeId || user?.email || 'your Inspector ID';

  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
      <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span>Account Suspended</span>
        </div>
        <div className="hidden sm:block text-body-sm font-mono text-outline">
          Rule Engine v2.4.1 Active
        </div>
      </header>

      <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
        <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-error/25 bg-error/10 text-error shadow-md">
              <span className="material-symbols-outlined text-[32px]">block</span>
            </div>
            <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
              Access Suspended
            </h1>
            <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
              PackIntel • Legal Metrology Platform
            </p>
          </div>

          <div className="flex items-start gap-2 px-4 py-3 rounded-lg border border-error/25 bg-error/10 text-body-sm font-body-sm text-on-surface">
            <span className="material-symbols-outlined text-[18px] text-error shrink-0 mt-0.5">
              gpp_bad
            </span>
            <div>
              <p className="font-semibold">Your inspector account has been suspended by an administrator.</p>
              <p className="mt-1 text-on-surface-variant">
                Access for <strong>{identifier}</strong> has been temporarily revoked. Inspection tools are
                unavailable while the account is suspended.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-surface-container-low text-body-sm font-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
              contact_support
            </span>
            <p>
              If you believe this is an error, contact your administrator or the Legal Metrology division with
              your Inspector ID to request reactivation.
            </p>
          </div>

          <div className="mt-6 pt-5 border-t border-outline-variant/60">
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="primary"
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
