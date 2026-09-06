'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/authContext';

interface TopNavBarProps {
  onMenuToggle?: () => void;
  pageTitle?: string;
}

export function TopNavBar({ onMenuToggle, pageTitle = 'Dashboard' }: TopNavBarProps) {
  const { user, signOut } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsCount, setNotificationsCount] = useState(2);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.split(' ').filter(Boolean);
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return 'IN';
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-4 py-2.5 md:px-6">
      {/* Mobile menu trigger */}
      <button
        onClick={onMenuToggle}
        className="p-2 text-[#64748B] hover:bg-[#F1F5F9] rounded-lg transition-colors lg:hidden"
        aria-label="Toggle navigation menu"
      >
        <span className="material-symbols-outlined text-[22px]">menu</span>
      </button>

      {/* Search bar */}
      <div className="min-w-0 flex-1 lg:max-w-[480px]">
        <div className="flex items-center rounded-full border border-[#E2E8F0] bg-[#EDF2F7] px-3.5 h-[44px] focus-within:border-[#1A73E8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#1A73E8]/20 transition-all">
          <span className="material-symbols-outlined text-[18px] text-[#64748B] mr-2">search</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search product, rule, batch..."
            className="w-full bg-transparent border-none outline-none text-sm text-[#1E293B] placeholder:text-[#94A3B8]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[#94A3B8] hover:text-[#1E293B]"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex shrink-0 items-center gap-1.5 md:gap-2.5">
        {/* Engine status */}
        <span className="hidden items-center gap-1.5 rounded-full bg-[#EBF2FF] px-3 py-1.5 text-xs font-semibold text-[#1A73E8] lg:inline-flex">
          <span className="material-symbols-outlined text-[14px]">memory</span>
          Engine v2.4.1
        </span>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setNotificationsCount(0);
            }}
            className="relative flex size-9 items-center justify-center rounded-full text-[#475569] hover:bg-[#F1F5F9] transition-colors"
            aria-label="View notifications"
          >
            <span className="material-symbols-outlined text-[20px]">notifications</span>
            {notificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-[#EF4444]" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-xl z-50">
              <div className="flex justify-between items-center pb-2 mb-2 border-b border-[#F1F5F9]">
                <span className="text-sm font-bold text-[#1E293B]">Inspection Alerts</span>
                <span className="text-xs text-[#1A73E8]">All caught up</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="p-2 rounded-xl bg-[#FEF2F2] border border-[#FECACA]">
                  <p className="font-semibold text-xs text-[#B91C1C] flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-[#DC2626]" />
                    High Priority: SCN-10251
                  </p>
                  <p className="text-[11px] text-[#B91C1C] mt-0.5">
                    XYZ Cooking Oil: Consumer Care missing & 90ml volume shrinkage.
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-[#FFF7ED] border border-[#FED7AA]">
                  <p className="font-semibold text-xs text-[#C2410C] flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-[#EA580C]" />
                    Cross-Surface Mismatch: SCN-10252
                  </p>
                  <p className="text-[11px] text-[#C2410C] mt-0.5">
                    ABC Fruit Juice: Front MRP ₹120 differs from Back ₹100.
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0]">
                  <p className="font-medium text-xs text-[#1E293B]">Legal Metrology Codified DB</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    Rule database synchronized to v2.4.1.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="hidden h-6 w-px bg-[#E2E8F0] sm:block" />

        {/* Profile pill */}
        <div className="relative">
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex cursor-pointer items-center gap-2 rounded-full border border-[#E2E8F0] bg-white p-1 pr-2 hover:bg-[#F8FAFC] transition-colors"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowProfileMenu((v) => !v);
              }
            }}
            aria-expanded={showProfileMenu}
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-[#1A73E8] text-xs font-bold text-white">
              {getInitials(user?.name, user?.email)}
            </div>
            <div className="hidden text-left sm:block">
              <p className="text-xs font-semibold leading-tight text-[#1E293B]">{user?.name || 'Sandesh Kondikire'}</p>
              <p className="text-[10px] leading-tight text-[#64748B]">{user?.role || 'Admin'}</p>
            </div>
            <span className="material-symbols-outlined text-[16px] text-[#94A3B8]">expand_more</span>
          </div>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-xl z-50">
              <div className="pb-3 mb-2 border-b border-[#F1F5F9]">
                <p className="text-xs font-bold text-[#1E293B] truncate">{user?.name || 'Sandesh Kondikire'}</p>
                <p className="text-[11px] text-[#64748B] truncate mt-0.5">{user?.email || 'admin@packintel.gov'}</p>
              </div>
              <div className="space-y-1">
                <Link
                  href="/settings"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 text-xs text-[#334155] p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#64748B]">settings</span>
                  <span>Engine Settings</span>
                </Link>
                <Link
                  href="/support"
                  onClick={() => setShowProfileMenu(false)}
                  className="flex items-center gap-2 text-xs text-[#334155] p-2 rounded-lg hover:bg-[#F1F5F9] transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px] text-[#64748B]">contact_support</span>
                  <span>Help & Support</span>
                </Link>
                <div className="pt-2 mt-1 border-t border-[#F1F5F9]">
                  <button
                    onClick={async () => {
                      setShowProfileMenu(false);
                      await signOut();
                    }}
                    className="w-full flex items-center gap-2 text-xs font-semibold text-[#DC2626] p-2 rounded-lg hover:bg-[#FEF2F2] transition-colors text-left"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}