'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, type VerificationStatus } from '@/lib/authContext';
import { getMyProfile } from '@/lib/supabase/inspectionService';
import { inspectorIdValidationError, looksLikeEmail } from '@/lib/auth/identity';
import { Button } from '@/components/ui/Button';

const OTP_LENGTH = 6;

export function LoginForm() {
  const router = useRouter();
  const { requestOtp, verifyOtp, user, isLoading: authLoading } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpStep, setOtpStep] = useState<'request' | 'verify'>('request');

  // If a session already exists, route by the authoritative database status.
  useEffect(() => {
    if (!user || authLoading) return;
    let cancelled = false;
    (async () => {
      const { data } = await getMyProfile();
      if (cancelled) return;
      const status: VerificationStatus =
        (data?.verification_status as VerificationStatus) || user.verificationStatus || 'approved';
      if (status === 'pending') router.replace('/verification-pending');
      else if (status === 'rejected') router.replace('/verification-rejected');
      else if (status === 'suspended') router.replace('/account-suspended');
      else router.replace('/dashboard');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const validateIdentifier = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return 'Please enter your Inspector ID.';
    if (!looksLikeEmail(trimmed)) return inspectorIdValidationError(trimmed);
    return null;
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const idError = validateIdentifier(identifier);
    if (idError) {
      setErrorMessage(idError);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await requestOtp(identifier.trim());
      if (!result.success) {
        setErrorMessage(result.error || 'Inspector ID not recognized or not authorized.');
        return;
      }
      setOtpStep('verify');
      setOtp('');
      setDemoOtp(result.demoOtp || null);
      setCooldown(result.retryAfterSeconds ?? 30);
      setInfoMessage('A verification code has been issued for this Inspector ID.');
    } catch {
      setErrorMessage('Authentication service temporarily unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otp.trim())) {
      setErrorMessage(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await verifyOtp(identifier.trim(), otp.trim());
      if (!result.success) {
        setErrorMessage(result.error || 'The code is incorrect or has expired.');
      }
    } catch {
      setErrorMessage('Authentication service temporarily unavailable. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setErrorMessage(null);
    setInfoMessage(null);
    setIsResending(true);
    try {
      const result = await requestOtp(identifier.trim());
      if (!result.success) {
        setErrorMessage(result.error || 'Unable to resend the code.');
        return;
      }
      setDemoOtp(result.demoOtp || null);
      setCooldown(result.retryAfterSeconds ?? 30);
      setInfoMessage('A new verification code has been issued.');
    } catch {
      setErrorMessage('Authentication service temporarily unavailable. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleChangeId = () => {
    setOtpStep('request');
    setOtp('');
    setDemoOtp(null);
    setErrorMessage(null);
    setInfoMessage(null);
    setCooldown(0);
  };

  const inputClass =
    'h-14 w-full rounded-xl border border-[#DCE9FF] bg-[#F5F9FF] pl-11 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all focus:border-[#1677FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="auth-card-float relative w-full max-w-[540px] overflow-hidden rounded-[24px] border border-[#DCE9FF] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] sm:p-8 lg:p-9">
      {/* Top Brand & Emblem Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] text-2xl font-bold text-white shadow-lg shadow-blue-500/25">
          <span className="material-symbols-outlined text-[32px]">verified_user</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-3xl">PackIntel</h1>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1677FF]">
          Legal Metrology Compliance Inspection Platform
        </p>
        <p className="mt-2 text-sm text-[#64748B]">Scan. Verify. Compare. Detect. Prioritize.</p>
      </div>

      {errorMessage && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C] animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-red-600">error</span>
          <div className="flex-1 font-medium" role="alert">{errorMessage}</div>
        </div>
      )}

      {infoMessage && !errorMessage && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#BBE4FF] bg-[#F0F8FF] p-3 text-sm text-[#0B5CAD]">
          <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#1677FF]">info</span>
          <div className="flex-1 font-medium">{infoMessage}</div>
        </div>
      )}

      {/* ── Step 1: Inspector ID ──────────────────────────────────────── */}
      {otpStep === 'request' && (
        <form onSubmit={handleRequest} className="space-y-5" noValidate>
          <div>
            <label
              htmlFor="inspector_id"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#334155]"
            >
              Inspector ID
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                badge
              </span>
              <input
                id="inspector_id"
                type="text"
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter Inspector ID"
                disabled={isSubmitting}
                aria-invalid={Boolean(errorMessage)}
                className={inputClass}
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="h-14 w-full justify-center rounded-xl border-transparent bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-500/25 transition duration-150 hover:brightness-105"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Verifying Inspector ID...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Continue
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </span>
            )}
          </Button>

          <p className="text-center text-xs leading-relaxed text-[#94A3B8]">
            A verification code is issued for a pre-authorized Inspector ID. There is no self-registration.
          </p>
        </form>
      )}

      {/* ── Step 2: OTP verification ──────────────────────────────────── */}
      {otpStep === 'verify' && (
        <form onSubmit={handleVerify} className="space-y-5" noValidate>
          <div className="rounded-xl border border-[#DCE9FF] bg-[#F5F9FF] px-3.5 py-2.5 text-sm">
            <span className="text-[#64748B]">Inspector ID: </span>
            <span className="font-bold text-[#0F172A]">{identifier.trim()}</span>
          </div>

          <div>
            <label
              htmlFor="inspector_otp"
              className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#334155]"
            >
              Verification Code
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                password
              </span>
              <input
                id="inspector_otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={OTP_LENGTH}
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH));
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder={`Enter ${OTP_LENGTH}-digit code`}
                disabled={isSubmitting}
                aria-invalid={Boolean(errorMessage)}
                className="h-14 w-full rounded-xl border border-[#DCE9FF] bg-[#F5F9FF] pl-11 pr-3.5 text-center text-lg font-bold tracking-[0.4em] text-[#0F172A] placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-[#94A3B8] transition-all focus:border-[#1677FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          {demoOtp && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-[#F5C453] bg-[#FFF9E6] px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#8A6100]">
                  Demo verification code
                </p>
                <p className="text-[11px] text-[#8A6100]">
                  No SMS/email delivery is configured for this build.
                </p>
              </div>
              <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-lg font-extrabold tracking-[0.3em] text-[#8A6100]">
                {demoOtp}
              </span>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="h-14 w-full justify-center rounded-xl border-transparent bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-500/25 transition duration-150 hover:brightness-105"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Verifying...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                Verify & Continue
                <span className="material-symbols-outlined text-[18px]">login</span>
              </span>
            )}
          </Button>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={handleChangeId}
              className="cursor-pointer text-xs font-semibold text-[#64748B] transition-colors hover:text-[#1677FF]"
            >
              Use a different Inspector ID
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || isResending}
              className="cursor-pointer text-xs font-semibold text-[#1677FF] transition-colors hover:underline disabled:cursor-not-allowed disabled:text-[#94A3B8] disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : isResending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 border-t border-[#EAF1FB] pt-4 text-center">
        <p className="flex items-center justify-center gap-1 text-xs text-[#64748B]">
          <span className="material-symbols-outlined text-[14px] text-[#1677FF]">security</span>
          Pre-authorized Inspector ID only • Not a government-issued identity
        </p>
      </div>
    </div>
  );
}