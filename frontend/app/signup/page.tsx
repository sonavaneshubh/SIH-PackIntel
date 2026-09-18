'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';
import { AuthHero } from '@/components/auth/AuthHero';

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, user, isLoading: authLoading } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [organization, setOrganization] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [inspectorEmployeeId, setInspectorEmployeeId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9+\-\s()]{10,15}$/;

    if (!fullName.trim()) errors.fullName = 'Please enter your full name.';
    if (!email.trim()) errors.email = 'Please enter your official email address.';
    else if (!emailRegex.test(email.trim())) errors.email = 'Please enter a valid email format (e.g. inspector@gov.in).';
    if (!password) errors.password = 'Please enter a password.';
    else if (password.length < 6) errors.password = 'Password must be at least 6 characters.';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
    if (!department.trim()) errors.department = 'Please enter your department / ministry.';
    if (!designation.trim()) errors.designation = 'Please enter your designation.';
    if (!organization.trim()) errors.organization = 'Please enter your organization.';
    if (!location.trim()) errors.location = 'Please enter your office location.';
    if (!inspectorEmployeeId.trim()) errors.inspectorEmployeeId = 'Please enter your Inspector / Employee ID.';
    if (!phone.trim()) errors.phone = 'Please enter a phone number.';
    else if (!phoneRegex.test(phone.trim())) errors.phone = 'Please enter a valid 10–15 digit phone number.';

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Duplicate check: another profile already owns this Inspector/Employee ID.
  const checkUniqueEmployeeId = async (employeeId: string): Promise<string | null> => {
    if (!isSupabaseConfigured || !employeeId.trim()) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('inspector_employee_id', employeeId.trim())
        .maybeSingle();
      if (error) return null;
      if (data) return 'This Inspector / Employee ID is already registered to another account. Contact your administrator if this is an error.';
      return null;
    } catch {
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!validate()) {
      setErrorMessage('Please fix the highlighted fields below.');
      return;
    }

    // Verify the employee ID isn't already taken before hitting Supabase Auth.
    const dupError = await checkUniqueEmployeeId(inspectorEmployeeId);
    if (dupError) {
      setFieldErrors(f => ({ ...f, inspectorEmployeeId: dupError }));
      setErrorMessage('Please fix the highlighted fields below.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
        department: department.trim(),
        designation: designation.trim(),
        organization: organization.trim(),
        location: location.trim(),
        phone: phone.trim(),
        inspectorEmployeeId: inspectorEmployeeId.trim(),
      });

      if (result.success) {
        setSuccessMessage(
          'Registration submitted! Please check your email to confirm your account. Your inspector account is pending verification by an administrator.'
        );
        setTimeout(() => {
          router.push('/verification-pending');
        }, 2000);
      } else {
        setErrorMessage(result.error || 'Failed to create inspector account.');
      }
    } catch {
      setErrorMessage('An unexpected error occurred during account registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (hasError?: string) =>
    `h-14 w-full rounded-xl border bg-[#F5F9FF] pl-11 pr-3.5 text-sm text-[#0F172A] placeholder:text-[#94A3B8] transition-all focus:border-[#1677FF] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#1677FF]/20 disabled:cursor-not-allowed disabled:opacity-60 ${
      hasError
        ? 'border-[#FECACA] focus:border-red-500 focus:ring-red-500/25'
        : 'border-[#DCE9FF]'
    }`;

  const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#334155]';

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-[#F6FAFF] via-[#F8FDFC] to-[#EAF6F4] antialiased">
      {/* Decorative background waves */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-[#EAF3FF] opacity-60 blur-3xl" />
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#E6FBF6] opacity-60 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        {/* Registration card column — first on mobile, right on desktop */}
        <div className="order-1 flex w-full items-center justify-center px-4 py-8 sm:px-6 lg:order-2 lg:w-[44%] lg:py-12 lg:pr-10">
          <div className="relative w-full max-w-[620px] overflow-hidden rounded-[24px] border border-[#DCE9FF] bg-white p-6 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.28)] sm:p-8">
            {/* Top Brand & Emblem Header */}
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] text-2xl font-bold text-white shadow-lg shadow-blue-500/25">
                <span className="material-symbols-outlined text-[32px]">person_add</span>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#1677FF]">
                Legal Metrology Compliance Inspection Platform
              </p>
              <h1 className="mt-1.5 text-2xl font-extrabold tracking-tight text-[#0F172A] sm:text-3xl">
                Create Inspector Account
              </h1>
              <p className="mt-2 max-w-md text-sm text-[#64748B]">
                Register with your official details and choose an Inspector ID. Accounts must be
                verified by an administrator before use.
              </p>
            </div>

            {/* Success Callout */}
            {successMessage && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-sm text-[#15803D]">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-green-600">
                  check_circle
                </span>
                <div className="flex-1 font-medium">{successMessage}</div>
              </div>
            )}

            {/* Error Callout */}
            {errorMessage && (
              <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-red-600">
                  error
                </span>
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              {/* Full Name */}
              <div>
                <label htmlFor="inspector_name" className={labelClass}>
                  Full Name / Officer Designation *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                    person
                  </span>
                  <input
                    id="inspector_name"
                    type="text"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setFieldErrors(f => ({ ...f, fullName: '' })); }}
                    placeholder="e.g. Officer R. K. Sharma"
                    disabled={isSubmitting}
                    className={inputClass(fieldErrors.fullName)}
                  />
                </div>
                {fieldErrors.fullName && (
                  <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.fullName}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Inspector / Employee ID */}
                <div>
                  <label htmlFor="inspector_employee_id" className={labelClass}>
                    Inspector / Employee ID *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      badge
                    </span>
                    <input
                      id="inspector_employee_id"
                      type="text"
                      value={inspectorEmployeeId}
                      onChange={(e) => { setInspectorEmployeeId(e.target.value); setFieldErrors(f => ({ ...f, inspectorEmployeeId: '' })); }}
                      placeholder="e.g. LM-2024-0781"
                      disabled={isSubmitting}
                      autoComplete="off"
                      className={inputClass(fieldErrors.inspectorEmployeeId)}
                    />
                  </div>
                  {fieldErrors.inspectorEmployeeId && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.inspectorEmployeeId}</p>
                  )}
                </div>

                {/* Official Email */}
                <div>
                  <label htmlFor="inspector_email" className={labelClass}>
                    Official Email *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      mail
                    </span>
                    <input
                      id="inspector_email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: '' })); }}
                      placeholder="e.g. inspector@gov.in"
                      disabled={isSubmitting}
                      autoComplete="email"
                      className={inputClass(fieldErrors.email)}
                    />
                  </div>
                  {fieldErrors.email && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.email}</p>
                  )}
                </div>
              </div>

              {/* Designation */}
              <div>
                <label htmlFor="inspector_designation" className={labelClass}>
                  Designation *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                    work
                  </span>
                  <input
                    id="inspector_designation"
                    type="text"
                    value={designation}
                    onChange={(e) => { setDesignation(e.target.value); setFieldErrors(f => ({ ...f, designation: '' })); }}
                    placeholder="e.g. Inspector of Legal Metrology"
                    disabled={isSubmitting}
                    className={inputClass(fieldErrors.designation)}
                  />
                </div>
                {fieldErrors.designation && (
                  <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.designation}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Department */}
                <div>
                  <label htmlFor="inspector_department" className={labelClass}>
                    Department / Ministry *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      account_balance
                    </span>
                    <input
                      id="inspector_department"
                      type="text"
                      value={department}
                      onChange={(e) => { setDepartment(e.target.value); setFieldErrors(f => ({ ...f, department: '' })); }}
                      placeholder="e.g. Legal Metrology Division"
                      disabled={isSubmitting}
                      className={inputClass(fieldErrors.department)}
                    />
                  </div>
                  {fieldErrors.department && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.department}</p>
                  )}
                </div>

                {/* Organization */}
                <div>
                  <label htmlFor="inspector_organization" className={labelClass}>
                    Organization *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      domain
                    </span>
                    <input
                      id="inspector_organization"
                      type="text"
                      value={organization}
                      onChange={(e) => { setOrganization(e.target.value); setFieldErrors(f => ({ ...f, organization: '' })); }}
                      placeholder="e.g. Dept. of Consumer Affairs"
                      disabled={isSubmitting}
                      className={inputClass(fieldErrors.organization)}
                    />
                  </div>
                  {fieldErrors.organization && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.organization}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Location */}
                <div>
                  <label htmlFor="inspector_location" className={labelClass}>
                    Office Location *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      location_on
                    </span>
                    <input
                      id="inspector_location"
                      type="text"
                      value={location}
                      onChange={(e) => { setLocation(e.target.value); setFieldErrors(f => ({ ...f, location: '' })); }}
                      placeholder="e.g. New Delhi"
                      disabled={isSubmitting}
                      className={inputClass(fieldErrors.location)}
                    />
                  </div>
                  {fieldErrors.location && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.location}</p>
                  )}
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="inspector_phone" className={labelClass}>
                    Phone Number *
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                      call
                    </span>
                    <input
                      id="inspector_phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setFieldErrors(f => ({ ...f, phone: '' })); }}
                      placeholder="e.g. +91 98100 12345"
                      disabled={isSubmitting}
                      autoComplete="tel"
                      className={inputClass(fieldErrors.phone)}
                    />
                  </div>
                  {fieldErrors.phone && (
                    <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.phone}</p>
                  )}
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="inspector_password" className={labelClass}>
                  Password * (min. 6 characters)
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                    lock
                  </span>
                  <input
                    id="inspector_password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: '' })); }}
                    placeholder="Enter secure password"
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    className={`${inputClass(fieldErrors.password)} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 flex h-8 w-8 items-center justify-center rounded-lg text-[#94A3B8] transition-colors hover:text-[#1677FF]"
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
                {fieldErrors.password && (
                  <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.password}</p>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <label htmlFor="confirm_password" className={labelClass}>
                  Confirm Password *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined pointer-events-none absolute left-3.5 text-[18px] text-[#94A3B8]">
                    lock_clock
                  </span>
                  <input
                    id="confirm_password"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors(f => ({ ...f, confirmPassword: '' })); }}
                    placeholder="Re-enter password"
                    disabled={isSubmitting}
                    autoComplete="new-password"
                    className={inputClass(fieldErrors.confirmPassword)}
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="mt-1.5 text-xs text-[#B91C1C]">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              {/* Verification Notice */}
              <div className="flex items-start gap-2 rounded-xl border border-[#DCE9FF] bg-[#F5F9FF] px-3.5 py-3">
                <span className="material-symbols-outlined mt-0.5 shrink-0 text-[18px] text-[#1677FF]">
                  hourglass_top
                </span>
                <p className="text-xs leading-relaxed text-[#64748B]">
                  After registration, your account will be <strong>pending verification</strong> by an
                  administrator. You will not be able to access inspection tools until your account is
                  approved.
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={isSubmitting}
                  className="h-14 w-full justify-center rounded-xl border-transparent bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] text-sm font-bold tracking-wide text-white shadow-lg shadow-blue-500/25 transition duration-150 hover:brightness-105"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating Inspector Account...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      Register Inspector Account
                      <span className="material-symbols-outlined text-[18px]">how_to_reg</span>
                    </span>
                  )}
                </Button>
              </div>

              {/* Login Link */}
              <div className="border-t border-[#EAF1FB] pt-4 text-center">
                <p className="text-sm text-[#64748B]">
                  Already have an authorized account?{' '}
                  <Link href="/login" className="font-bold text-[#1677FF] hover:underline">
                    Sign In
                  </Link>
                </p>
              </div>
            </form>
          </div>
        </div>

        {/* Hero column — left on desktop */}
        <div className="order-2 w-full border-t border-[#E5F0FF] lg:order-1 lg:flex lg:w-[56%] lg:items-center lg:border-t-0 lg:border-r">
          <AuthHero />
        </div>
      </div>
    </div>
  );
}