'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

type PageState =
  | 'loading'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid'
  | 'expired'
  | 'already-handled'
  | 'review'
  | 'done';
type Confirming = 'approve' | 'reject' | null;

interface ProfileInfo {
  id: string;
  email: string | null;
  fullName: string | null;
  designation: string | null;
  department: string | null;
  organization: string | null;
  location: string | null;
  phone: string | null;
  employeeId: string | null;
  verificationStatus: string | null;
  tokenExpiresAt: string | null;
}

function LabeledField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-body-xs font-body-xs uppercase tracking-wide text-on-surface-variant">
        {label}
      </dt>
      <dd className="text-body-md font-body-md font-medium text-on-surface break-words">
        {value?.trim() || <span className="text-on-surface-variant">—</span>}
      </dd>
    </div>
  );
}

export default function InspectorVerificationPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params.token) ? params.token[0] : (params.token ?? '');
  const { session, isLoading: authLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileInfo | null>(null);
  const [state, setState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [decided, setDecided] = useState<{ decision: 'approve' | 'reject'; by: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (authLoading) return;

    if (!session?.access_token) {
      setState('unauthorized');
      return;
    }

    setState('loading');
    setErrorMessage('');
    fetch(`/api/admin/verification/${encodeURIComponent(token)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.status === 200 && body.profile) {
          setProfile(body.profile as ProfileInfo);
          const status = body.profile.verificationStatus;
          setState(status && status !== 'pending' ? 'already-handled' : 'review');
          return;
        }
        if (res.status === 401) {
          setState('unauthorized');
          return;
        }
        if (res.status === 403) {
          setState('forbidden');
          return;
        }
        if (res.status === 410) {
          setState('expired');
          return;
        }
        setState('invalid');
        setErrorMessage(body?.error || 'This verification link could not be resolved.');
      })
      .catch((err: Error) => {
        if (cancelled || err.name === 'AbortError') return;
        setState('invalid');
        setErrorMessage('Network error. Please try again.');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [session, token, authLoading]);

  const submitDecision = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (processing) return;
      if (decision === 'reject' && !reason.trim()) {
        setMessage({ type: 'error', text: 'Please enter a reason for rejecting this registration.' });
        return;
      }
      setProcessing(true);
      setMessage(null);
      try {
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token,
            action: decision,
            rejectionReason: decision === 'reject' ? reason.trim() : undefined,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.ok) {
          setConfirming(null);
          setDecided({ decision, by: body.verifiedBy || 'Administrator' });
          setState('done');
          return;
        }
        if (res.status === 409) {
          setConfirming(null);
          setState('already-handled');
          return;
        }
        setMessage({
          type: 'error',
          text: body?.error || 'Failed to record the decision. Please try again.',
        });
      } catch {
        setMessage({ type: 'error', text: 'Network error. Please try again.' });
      } finally {
        setProcessing(false);
      }
    },
    [processing, reason, session, token]
  );

  const expiresLabel = useMemo(() => {
    if (!profile?.tokenExpiresAt) return null;
    const date = new Date(profile.tokenExpiresAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' });
  }, [profile]);

  let body: React.ReactNode;

  if (state === 'loading' || authLoading) {
    body = (
      <div className="flex flex-col items-center gap-3 py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-container border-t-primary" />
        <p className="text-body-sm font-body-sm text-on-surface-variant">Loading verification request…</p>
      </div>
    );
  } else if (state === 'unauthorized') {
    body = (
      <div className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low">
          <span className="material-symbols-outlined text-3xl text-primary">lock</span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">Admin sign in required</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          You must be signed in with an administrator account to review this registration.
        </p>
        <div className="mt-6">
          <Link href="/login">
            <Button variant="primary" icon="login">Sign in as admin</Button>
          </Link>
        </div>
      </div>
    );
  } else if (state === 'forbidden') {
    body = (
      <div className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-container">
          <span className="material-symbols-outlined text-3xl text-error">block</span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">Access restricted</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          Your account does not have administrator privileges to review inspector registrations.
        </p>
        <div className="mt-6">
          <Link href="/dashboard">
            <Button variant="outline">Return to dashboard</Button>
          </Link>
        </div>
      </div>
    );
  } else if (state === 'invalid') {
    body = (
      <div className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-error-container">
          <span className="material-symbols-outlined text-3xl text-error">link_off</span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">Invalid verification link</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          {errorMessage || 'This link could not be resolved. Check the address or request a new one.'}
        </p>
      </div>
    );
  } else if (state === 'expired') {
    body = (
      <div className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant">schedule</span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">Verification link expired</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          This review link is no longer valid (links expire after 24 hours). Request a new one from the
          admin Settings page.
        </p>
        <div className="mt-6">
          <Link href="/settings?tab=verification">
            <Button variant="outline" icon="mail">Go to admin settings</Button>
          </Link>
        </div>
      </div>
    );
  } else if (state === 'already-handled') {
    body = (
      <div className="py-14 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-low">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant">check_circle</span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">Registration already reviewed</h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          This registration has already been {profile?.verificationStatus === 'approved' ? 'approved' : 'reviewed'}.
          No further action is needed.
        </p>
        <div className="mt-6">
          <Link href="/dashboard">
            <Button variant="outline">Return to dashboard</Button>
          </Link>
        </div>
      </div>
    );
  } else if (state === 'done' && decided) {
    body = (
      <div className="py-14 text-center">
        <div
          className={cn(
            'mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full',
            decided.decision === 'approve' ? 'bg-green-100 text-green-700' : 'bg-error-container text-error'
          )}
        >
          <span className="material-symbols-outlined text-3xl">
            {decided.decision === 'approve' ? 'verified' : 'cancel'}
          </span>
        </div>
        <h2 className="font-headline-lg font-headline-lg text-on-surface">
          {decided.decision === 'approve' ? 'Registration approved' : 'Registration rejected'}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm font-body-sm text-on-surface-variant">
          {decided.decision === 'approve'
            ? `${profile?.fullName || 'The inspector'} can now sign in and access inspection tools.`
            : `${profile?.fullName || 'The inspector'} will see a rejection notice on sign in.`}
          {reason.trim() ? ` Reason recorded: “${reason.trim()}”.` : ''}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/settings?tab=verification">
            <Button variant="outline" icon="settings">Open admin settings</Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="primary">Go to dashboard</Button>
          </Link>
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <div className="rounded-xl border border-outline-variant overflow-hidden">
          <div className="bg-gradient-to-r from-primary-container to-surface-container-low px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary">
                <span className="material-symbols-outlined">badge</span>
              </div>
              <div>
                <h2 className="font-headline-md font-headline-md text-on-surface">
                  {profile?.fullName?.trim() || 'Inspector registration'}
                </h2>
                <p className="text-body-sm font-body-sm text-on-surface-variant">
                  Pending verification • submitted{' '}
                  <span className="font-medium">{expiresLabel ? `for ${expiresLabel}` : 'recently'}</span>
                </p>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-5">
            <LabeledField label="Full name" value={profile?.fullName} />
            <LabeledField label="Email" value={profile?.email} />
            <LabeledField label="Inspector ID" value={profile?.employeeId} />
            <LabeledField label="Designation" value={profile?.designation} />
            <LabeledField label="Department" value={profile?.department} />
            <LabeledField label="Organization" value={profile?.organization} />
            <LabeledField label="Location" value={profile?.location} />
            <LabeledField label="Phone" value={profile?.phone} />
          </dl>
        </div>

        {message && (
          <div
            className={cn(
              'mt-4 rounded-lg border px-4 py-3 text-body-sm font-body-sm',
              message.type === 'error'
                ? 'border-error/40 bg-error-container/60 text-error'
                : 'border-green-600/40 bg-green-50 text-green-800'
            )}
          >
            {message.text}
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
          <Button
            variant="danger"
            size="lg"
            icon="block"
            disabled={processing}
            onClick={() => setConfirming('reject')}
          >
            Reject registration
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon="verified"
            disabled={processing}
            onClick={() => setConfirming('approve')}
          >
            Approve inspector
          </Button>
        </div>

        <Modal
          isOpen={confirming === 'approve'}
          onClose={() => setConfirming(null)}
          title="Approve this inspector?"
          subtitle={`${profile?.fullName?.trim() || 'This inspector'} will get access to PackIntel inspection tools.`}
          maxWidth="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button variant="primary" icon="verified" disabled={processing} onClick={() => submitDecision('approve')}>
                Approve
              </Button>
            </>
          }
        >
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            This decision is recorded with your admin account and cannot be made by non-admin users.
          </p>
        </Modal>

        <Modal
          isOpen={confirming === 'reject'}
          onClose={() => setConfirming(null)}
          title="Reject this registration?"
          subtitle="The inspector will see the rejection reason on sign in."
          maxWidth="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button variant="danger" icon="block" disabled={processing || !reason.trim()} onClick={() => submitDecision('reject')}>
                Reject
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-body-sm font-body-sm font-medium text-on-surface">
              Rejection reason <span className="text-error">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. Unable to verify the inspector ID with the Legal Metrology Department."
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md font-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-body-xs font-body-xs text-on-surface-variant text-right">{reason.length}/500</span>
          </label>
        </Modal>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
      <header className="w-full max-w-2xl border-b border-outline-variant/60 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 font-medium text-body-sm font-body-sm text-on-surface-variant">
          <span className="w-2 h-2 rounded-full bg-teal-600" />
          <span>PackIntel — Inspector Verification</span>
        </div>
        <div className="text-body-sm font-mono text-outline">Admin Review</div>
      </header>

      <main className="my-auto w-full max-w-2xl py-8 sm:py-10">
        <div className="rounded-xl border border-outline-variant bg-surface shadow-panel-card p-5 sm:p-7">
          {body}
        </div>
      </main>

      <footer className="w-full max-w-2xl py-4 text-center text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/60">
        © 2024–2026 PackIntel • Department of Consumer Affairs, Government of India
      </footer>
    </div>
  );
}