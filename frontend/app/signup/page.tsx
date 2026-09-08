'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Button } from '@/components/ui/Button';
import { supabase, isSupabaseConfigured } from '@/lib/supabase/client';

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
    `h-14 w-full rounded-lg border bg-surface-container-low pl-10 pr-3.5 text-body-base font-body-base text-on-surface placeholder:text-outline transition-all focus:outline-none focus:ring-2 disabled:opacity-60 ${
      hasError
        ? 'border-error focus:border-error focus:ring-error/25'
        : 'border-outline-variant focus:border-primary focus:ring-primary/25'
    }`;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
      {/* Header */}
      <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>Legal Metrology Inspector Registration</span>
        </div>
        <div className="hidden sm:block text-body-sm font-mono text-outline">
          Rule Engine v2.4.1 Active
        </div>
      </header>

      {/* Main Container */}
      <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
        <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(25,28,29,0.08)] sm:p-8">
          {/* Emblem Header */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-primary/20 bg-primary text-2xl font-bold text-on-primary shadow-md">
              <span className="material-symbols-outlined text-[32px]">person_add</span>
            </div>
            <h1 className="text-display-lg-mobile font-display-lg text-on-surface md:text-display-lg">
              Create Inspector Account
            </h1>
            <p className="text-label-bold font-label-bold text-primary uppercase tracking-wider mt-0.5">
              Legal Metrology Compliance Inspection Platform
            </p>
            <p className="mt-1.5 text-body-sm font-body-sm text-on-surface-variant">
              Register with your official details. Accounts must be verified by an administrator before use.
            </p>
          </div>

          {/* Success Callout */}
          {successMessage && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] p-3 text-body-sm font-body-sm text-[#15803D]">
              <span className="material-symbols-outlined text-green-600 text-[18px] shrink-0 mt-0.5">check_circle</span>
              <div className="font-semibold">{successMessage}</div>
            </div>
          )}

          {/* Error Callout */}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-2 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-3 text-body-sm font-body-sm text-[#B91C1C]">
              <span className="material-symbols-outlined text-red-600 text-[18px] shrink-0 mt-0.5">
                error
              </span>
              <div className="flex-1 font-medium">{errorMessage}</div>
            </div>
          )}

          {/* Registration Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Full Name */}
            <div>
              <label
                htmlFor="inspector_name"
                className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
              >
                Full Name / Officer Designation *
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.fullName}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Inspector / Employee ID */}
              <div>
                <label
                  htmlFor="inspector_employee_id"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Inspector / Employee ID *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.inspectorEmployeeId}</p>
                )}
              </div>

              {/* Official Email */}
              <div>
                <label
                  htmlFor="inspector_email"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Official Email *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.email}</p>
                )}
              </div>
            </div>

            {/* Designation */}
            <div>
              <label
                htmlFor="inspector_designation"
                className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
              >
                Designation *
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.designation}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Department */}
              <div>
                <label
                  htmlFor="inspector_department"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Department / Ministry *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.department}</p>
                )}
              </div>

              {/* Organization */}
              <div>
                <label
                  htmlFor="inspector_organization"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Organization *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.organization}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Location */}
              <div>
                <label
                  htmlFor="inspector_location"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Office Location *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.location}</p>
                )}
              </div>

              {/* Phone */}
              <div>
                <label
                  htmlFor="inspector_phone"
                  className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
                >
                  Phone Number *
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.phone}</p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="inspector_password"
                className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
              >
                Password * (min. 6 characters)
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                  className={`${inputClass(fieldErrors.password)} pr-10`}
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
              {fieldErrors.password && (
                <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm_password"
                className="block text-label-bold font-label-bold uppercase tracking-wider text-on-surface mb-1.5"
              >
                Confirm Password *
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3 text-outline text-[18px] pointer-events-none">
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
                <p className="mt-1 text-body-sm font-body-sm text-error">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Verification Notice */}
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-primary/25 bg-primary/5">
              <span className="material-symbols-outlined text-[18px] text-primary shrink-0 mt-0.5">
                hourglass_top
              </span>
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                After registration, your account will be <strong>pending verification</strong> by an
                administrator. You will not be able to access inspection tools until your account is approved.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting}
                className="h-14 w-full justify-center rounded-lg bg-primary-container text-sm font-label-bold tracking-wide shadow-sm hover:bg-primary"
              >
                {isSubmitting ? 'Creating Inspector Account...' : 'Register Inspector Account'}
              </Button>
            </div>

            {/* Login Link */}
            <div className="text-center pt-3 border-t border-outline-variant/60">
              <p className="text-body-sm font-body-sm text-on-surface-variant">
                Already have an authorized account?{' '}
                <Link href="/login" className="text-primary font-bold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-4 flex flex-col sm:flex-row justify-between items-center text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/60 gap-2">
        <div>© 2024–2026 PackIntel • Department of Consumer Affairs, Government of India</div>
        <div>Authorized Registration System</div>
      </footer>
    </div>
  );
}