'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';
import { cn } from '@/lib/utils';

interface TopNavBarProps {
  onMenuToggle?: () => void;
  pageTitle?: string;
}

export const TopNavBar = React.memo(function TopNavBar({
  onMenuToggle,
  pageTitle = 'Dashboard',
}: TopNavBarProps) {
  const { user, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsCount, setNotificationsCount] = useState(2);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEngineInfo, setShowEngineInfo] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const anyMenuOpen = showNotifications || showProfileMenu || showEngineInfo;

  const closeMenus = () => {
    setShowNotifications(false);
    setShowProfileMenu(false);
    setShowEngineInfo(false);
  };

  // Close dropdowns with Escape; focus search via Ctrl/Cmd+K or "/"
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenus();
        setMobileSearchOpen(false);
        return;
      }
      const target = e.target as HTMLElement;
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Autofocus the mobile search input when it opens
  useEffect(() => {
    if (mobileSearchOpen) {
      requestAnimationFrame(() => mobileSearchInputRef.current?.focus());
    }
  }, [mobileSearchOpen]);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'IN';
  };

  const searchField = (
    inputRef: React.RefObject<HTMLInputElement | null>,
    clearQuery: () => void
  ) => (
    <div className="flex h-[44px] w-full items-center rounded-full border border-[#E2E8F0] bg-[#EDF2F7] px-3.5 transition-all focus-within:border-[#1A73E8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1A73E8]/20">
      <span className="material-symbols-outlined mr-2 text-[18px] text-[#64748B]">
        search
      </span>
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search product, rule, batch..."
        aria-label="Search"
        className="w-full bg-transparent text-sm text-[#1E293B] outline-none placeholder:text-[#94A3B8]"
      />
      {searchQuery ? (
        <button
          onClick={clearQuery}
          className="text-[#94A3B8] hover:text-[#1E293B]"
          aria-label="Clear search"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      ) : null}
    </div>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white/95 px-3 py-2.5 shadow-sm backdrop-blur md:px-6">
      {/* Outside-click backdrop that closes any open dropdown */}
      {anyMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={closeMenus}
          aria-hidden="true"
        />
      )}

      {mobileSearchOpen ? (
        /* ── Mobile: full-width expanded search ── */
        <div className="flex items-center gap-2 md:hidden">
          <button
            onClick={() => setMobileSearchOpen(false)}
            className="shrink-0 rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155]"
            aria-label="Close search"
            title="Close search"
          >
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <div className="min-w-0 flex-1">
            {searchField(mobileSearchInputRef, () => setSearchQuery(''))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 sm:gap-3">
          {/* ☰ Menu toggle */}
          <button
            onClick={onMenuToggle}
            className="shrink-0 rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A73E8]"
            aria-label="Toggle navigation menu"
            title="Toggle navigation menu"
          >
            <span className="material-symbols-outlined text-[22px]">menu</span>
          </button>

          {/* Current page title */}
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <div className="h-5 w-px bg-[#E2E8F0]" />
            <h2
              className="truncate text-sm font-bold text-[#1E293B]"
              title={pageTitle}
            >
              {pageTitle}
            </h2>
          </div>

          {/* 🔍 Global Search — full field on md+, icon on mobile */}
          <div className="hidden min-w-0 flex-1 md:block">
            {searchField(searchInputRef, () => setSearchQuery(''))}
          </div>
          <button
            onClick={() => setMobileSearchOpen(true)}
            className="shrink-0 rounded-lg p-2 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155] md:hidden"
            aria-label="Open search"
            title="Search"
          >
            <span className="material-symbols-outlined text-[22px]">search</span>
          </button>

          {/* Right controls — pinned to the right corner */}
          <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2.5">
            {/* ⚡ AI Engine Status */}
            <div className="relative hidden sm:block">
              <button
                onClick={() => {
                  setShowEngineInfo((v) => !v);
                  setShowNotifications(false);
                  setShowProfileMenu(false);
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border border-[#E2E8F0] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1E293B] transition-colors hover:bg-[#F8FAFC]',
                  showEngineInfo && 'bg-[#F8FAFC]'
                )}
                aria-expanded={showEngineInfo}
                aria-haspopup="dialog"
                title="AI Engine status"
              >
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                AI Engine • Online
              </button>

              {showEngineInfo && (
                <div
                  className="dropdown-pop absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-24px)] rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-2xl"
                  role="dialog"
                  aria-label="AI Engine status"
                >
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#1E293B]">
                    <span className="material-symbols-outlined text-[18px] text-[#0F766E]">
                      memory
                    </span>
                    AI Engine
                    <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Online
                    </span>
                  </p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                      <span className="text-[#64748B]">Engine Version</span>
                      <span className="font-semibold text-[#1E293B]">v2.4.1</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                      <span className="text-[#64748B]">Rule Database</span>
                      <span className="font-semibold text-[#0F766E]">Synced v2.4.1</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-[#F8FAFC] px-2.5 py-1.5">
                      <span className="text-[#64748B]">Inspection Pipeline</span>
                      <span className="font-semibold text-[#334155]">Ready</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 🔔 Compliance Alerts */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowProfileMenu(false);
                  setShowEngineInfo(false);
                  setNotificationsCount(0);
                }}
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-full text-[#475569] transition-colors hover:bg-[#F1F5F9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1A73E8]',
                  showNotifications && 'bg-[#F1F5F9] text-[#1E293B]'
                )}
                aria-label="View notifications"
                aria-expanded={showNotifications}
                aria-haspopup="true"
                title="Notifications"
              >
                <span className="material-symbols-outlined text-[20px]">
                  notifications
                </span>
                {notificationsCount > 0 && (
                  <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-[#EF4444] text-[9px] font-bold text-white">
                    {notificationsCount > 9 ? '9+' : notificationsCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div
                  className="dropdown-pop absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-2xl"
                  role="dialog"
                  aria-label="Inspection alerts"
                >
                  <div className="mb-2 flex items-center justify-between border-b border-[#F1F5F9] pb-2">
                    <span className="text-sm font-bold text-[#1E293B]">Inspection Alerts</span>
                    <button
                      onClick={() => setNotificationsCount(0)}
                      className="text-xs font-semibold text-[#1A73E8] hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="no-scrollbar max-h-72 space-y-2 overflow-y-auto text-sm">
                    <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2">
                      <p className="flex items-center gap-1 text-xs font-semibold text-[#B91C1C]">
                        <span className="size-1.5 rounded-full bg-[#DC2626]" />
                        High Priority: SCN-10251
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#B91C1C]">
                        XYZ Cooking Oil: Consumer Care missing & 90ml volume shrinkage.
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#FED7AA] bg-[#FFF7ED] p-2">
                      <p className="flex items-center gap-1 text-xs font-semibold text-[#C2410C]">
                        <span className="size-1.5 rounded-full bg-[#EA580C]" />
                        Cross-Surface Mismatch: SCN-10252
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#C2410C]">
                        ABC Fruit Juice: Front MRP ₹120 differs from Back ₹100.
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-2">
                      <p className="text-xs font-medium text-[#1E293B]">Legal Metrology Codified DB</p>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        Rule database synchronized to v2.4.1.
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-2">
                      <p className="text-xs font-medium text-[#1E293B]">Recent Inspections Synced</p>
                      <p className="mt-0.5 text-[11px] text-[#64748B]">
                        SCN-10253 and SCN-10254 flagged for review.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="hidden h-6 w-px bg-[#E2E8F0] sm:block" />

            {/* 👤 Profile */}
            <div className="relative">
              <div
                onClick={() => {
                  setShowProfileMenu((v) => !v);
                  setShowNotifications(false);
                  setShowEngineInfo(false);
                }}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-full border border-[#E2E8F0] bg-white p-1 pr-2 transition-colors hover:bg-[#F8FAFC]',
                  showProfileMenu && 'bg-[#F8FAFC]'
                )}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowProfileMenu((v) => !v);
                  }
                  if (e.key === 'Escape') closeMenus();
                }}
                aria-expanded={showProfileMenu}
                aria-haspopup="menu"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-[#1A73E8] text-xs font-bold text-white">
                  {getInitials(user?.name, user?.email)}
                </div>
                <div className="hidden max-w-[140px] text-left sm:block">
                  <p className="truncate text-xs font-semibold leading-tight text-[#1E293B]">
                    {user?.name || 'Compliance Officer'}
                  </p>
                  <p className="truncate text-[10px] leading-tight text-[#64748B]">
                    {user?.role || 'Inspector'}
                  </p>
                </div>
                <span
                  className={cn(
                    'material-symbols-outlined text-[16px] text-[#94A3B8] transition-transform duration-200',
                    showProfileMenu && 'rotate-180'
                  )}
                >
                  expand_more
                </span>
              </div>

              {showProfileMenu && (
                <div
                  className="dropdown-pop absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-24px)] rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-2xl"
                  role="menu"
                >
                  <div className="mb-2 border-b border-[#F1F5F9] pb-3">
                    <p className="truncate text-xs font-bold text-[#1E293B]">
                      {user?.name || 'Compliance Officer'}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#64748B]">
                      {user?.inspectorEmployeeId || user?.email || 'inspector@packintel.gov'}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#EBF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#1A73E8]">
                      <span className="material-symbols-outlined text-[12px]">badge</span>
                      {user?.role || 'Legal Metrology Inspector'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/settings"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2 rounded-lg p-2 text-xs text-[#334155] transition-colors hover:bg-[#F1F5F9]"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#64748B]">
                        settings
                      </span>
                      Engine Settings
                    </Link>
                    <Link
                      href="/support"
                      onClick={() => setShowProfileMenu(false)}
                      className="flex items-center gap-2 rounded-lg p-2 text-xs text-[#334155] transition-colors hover:bg-[#F1F5F9]"
                    >
                      <span className="material-symbols-outlined text-[18px] text-[#64748B]">
                        contact_support
                      </span>
                      Help & Support
                    </Link>
                    <div className="pt-2 mt-1 border-t border-[#F1F5F9]">
                      <button
                        onClick={async () => {
                          setShowProfileMenu(false);
                          await signOut();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs font-semibold text-[#DC2626] transition-colors hover:bg-[#FEF2F2]"
                      >
                        <span className="material-symbols-outlined text-[18px]">logout</span>
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
});