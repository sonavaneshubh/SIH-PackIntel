'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';

const QUICK_ACTIONS = [
  { href: '/scan/new', icon: 'barcode_scanner', label: 'New Scan', desc: 'Scan a package label' },
  { href: '/history', icon: 'history', label: 'Scan History', desc: 'View past inspections' },
  { href: '/recent-inspections', icon: 'query_stats', label: 'Recent Inspections', desc: 'Latest compliance checks' },
  { href: '/results', icon: 'assignment_turned_in', label: 'Compliance Results', desc: 'Pass / fail summaries' },
  { href: '/rules', icon: 'gavel', label: 'Rule Database', desc: 'Legal Metrology ruleset' },
  { href: '/analytics', icon: 'analytics', label: 'Violation Analytics', desc: 'Trends & statistics' },
  { href: '/reports', icon: 'description', label: 'Reports', desc: 'Generated PDF reports' },
  { href: '/settings', icon: 'settings', label: 'Settings', desc: 'Account & preferences' },
];

export default function InspectorDashboardPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = React.useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  return (
    <AppShell pageTitle="Inspector Dashboard">
      <div className="flex flex-col gap-5">
        {/* Status banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-green-500/25 bg-green-50 px-4 py-3">
          <span className="material-symbols-outlined text-green-600 mt-0.5">verified_user</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-green-800">Account Approved</p>
            <p className="text-xs text-green-700">
              Your inspector credentials are verified. You have full access to inspection tools.
            </p>
          </div>
        </div>

        {/* Inspector identity card */}
        <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-outline-variant bg-surface-container-low flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px] text-primary">account_circle</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-on-surface truncate">{user?.name || 'Inspector'}</p>
              <p className="text-xs text-on-surface-variant truncate">{user?.inspectorEmployeeId || user?.email}</p>
            </div>
            <span className="ml-auto hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-700 text-[11px] font-semibold">
              <span className="material-symbols-outlined text-[14px]">verified_user</span>
              {user?.verificationStatus || 'Approved'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-outline-variant/40">
            {[
              ['Designation', user?.role || '—'],
              ['Employee ID', user?.inspectorEmployeeId || user?.employeeId || '—'],
              ['Organization', user?.organization || user?.department || '—'],
              ['Office Location', user?.location || '—'],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface-container-lowest px-5 py-3.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
                <p className="text-xs font-medium text-on-surface mt-0.5 truncate" title={value || undefined}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-on-surface">Inspection Tools</h3>
            <Button
              variant="outline"
              size="sm"
              icon="logout"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                  <span className="material-symbols-outlined text-[20px]">{action.icon}</span>
                </span>
                <p className="mt-3 text-xs font-bold text-on-surface">{action.label}</p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant">{action.desc}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Info callout */}
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-surface-container-low border border-outline-variant/60 text-[11px] text-on-surface-variant">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">info</span>
          <p>
            This is the authenticated inspector workspace. All tools are also available from the sidebar.
            Access is enforced server-side — unverified or non-inspector accounts cannot reach these routes.
          </p>
        </div>
      </div>
    </AppShell>
  );
}