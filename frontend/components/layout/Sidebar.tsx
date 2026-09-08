"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  prefetch?: boolean;
  matchHint?: (pathname: string) => boolean;
}

// Static (module-level) so the list is never re-allocated per render.
const PRIMARY_NAV: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: "home",
    prefetch: true,
    matchHint: (p) => p === "/",
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "dashboard",
    prefetch: true,
    matchHint: (p) => p === "/dashboard",
  },
  {
    label: "Inspector Workspace",
    href: "/inspector/dashboard",
    icon: "verified_user",
    prefetch: true,
    matchHint: (p) => p.startsWith("/inspector"),
  },
  {
    label: "New Scan",
    href: "/scan/new",
    icon: "barcode_scanner",
    prefetch: true,
    matchHint: (p) => p.startsWith("/scan"),
  },
  {
    label: "Recent Inspections",
    href: "/recent-inspections",
    icon: "query_stats",
    prefetch: true,
    matchHint: (p) => p === "/recent-inspections",
  },
  {
    label: "High-Priority Inspections",
    href: "/high-priority-inspections",
    icon: "warning",
    prefetch: true,
    matchHint: (p) => p === "/high-priority-inspections",
  },
  {
    label: "Rule Database",
    href: "/rules",
    icon: "gavel",
    prefetch: true,
    matchHint: (p) => p === "/rules",
  },
  {
    label: "Violation Analytics",
    href: "/analytics",
    icon: "analytics",
    prefetch: true,
    matchHint: (p) => p === "/analytics",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: "description",
    prefetch: true,
    matchHint: (p) => p === "/reports",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    prefetch: true,
    matchHint: (p) => p === "/settings",
  },
];

// Minimal navigation shown while an account has not been approved yet.
const LIMITED_NAV: NavItem[] = [
  {
    label: "Home",
    href: "/",
    icon: "home",
    prefetch: true,
    matchHint: (p) => p === "/",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: "settings",
    prefetch: false,
    matchHint: (p) => p === "/settings",
  },
  {
    label: "Support",
    href: "/support",
    icon: "contact_support",
    prefetch: false,
    matchHint: (p) => p === "/support",
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { signOut, user } = useAuth();

  const verificationStatus = user?.verificationStatus || 'approved';
  const isApprovedInspector = verificationStatus === 'approved';
  const navItems = isApprovedInspector ? PRIMARY_NAV : LIMITED_NAV;

  const handleSignOut = useCallback(() => {
    signOut();
    onClose();
  }, [signOut, onClose]);

  const navItems = [
    {
      label: "Dashboard",
      href: "/",
      icon: "dashboard",
      isActive: pathname === "/" || pathname === "/dashboard",
    },
    {
      label: "New Scan",
      href: "/scan/new",
      icon: "barcode_scanner",
      isActive: pathname.startsWith("/scan"),
    },
    {
      label: "Recent Inspections",
      href: "/recent-inspections",
      icon: "query_stats",
      isActive: pathname === "/recent-inspections",
    },
    {
      label: "High-Priority Inspections",
      href: "/high-priority-inspections",
      icon: "warning",
      isActive: pathname === "/high-priority-inspections",
    },
    {
      label: "Compliance Results",
      href: "/results",
      icon: "assignment_turned_in",
      isActive: pathname === "/results",
    },
    {
      label: "Rule Database",
      href: "/rules",
      icon: "gavel",
      isActive: pathname === "/rules",
    },
    {
      label: "Violation Analytics",
      href: "/analytics",
      icon: "analytics",
      isActive: pathname === "/analytics",
    },
    {
      label: "Reports",
      href: "/reports",
      icon: "description",
      isActive: pathname === "/reports",
    },
    {
      label: "Settings",
      href: "/settings",
      icon: "settings",
      isActive: pathname === "/settings",
    },
  ];

  return (
    <>
      {/* Mobile-only backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 md:hidden",
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/*
        Sidebar panel
        Always position:fixed and full viewport height (top:0, left:0).
        It never scrolls with the page; only its internal nav scrolls.
        Slides out via translate-x on all breakpoints.
      */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen supports-[height:100dvh]:h-dvh w-[260px] bg-[#0b0f12] shadow-2xl",
          "flex flex-col",
          "transition-transform duration-300 ease-in-out",
          // closed: slide fully off-screen to the left
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full w-full flex-col">
          {/* Logo / Header */}
          <div className="shrink-0 px-5 pt-5 mb-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#1a73e8] to-[#005bbf] text-white flex items-center justify-center font-bold text-base transition-transform group-hover:scale-105">
                <span className="material-symbols-outlined text-[15px]">
                  verified_user
                </span>
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-white leading-none tracking-tight">
                  PackIntel
                </h1>
                <p className="text-[9px] font-semibold text-slate-400 mt-0.5 tracking-wider uppercase">
                  Compliance Intelligence
                </p>
              </div>
            </Link>
            <button
              onClick={onClose}
              className={cn(
                "text-slate-400 hover:text-white p-1 rounded-md hover:bg-[#1a2332] transition-colors md:hidden"
              )}
              aria-label="Close sidebar"
            >
              <span className="material-symbols-outlined text-[20px]">
                close
              </span>
            </button>
          </div>

          {/* Navigation Items — internal scroll only (scrollbar hidden) */}
          <nav className="no-scrollbar flex-1 overflow-y-auto px-3 space-y-0.5">
            {!isApprovedInspector && (
              <div className="mx-1 mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <span className="material-symbols-outlined text-[16px] text-amber-400 shrink-0 mt-0.5">
                  hourglass_top
                </span>
                <p className="text-[11px] font-semibold text-amber-200 leading-snug">
                  Account {verificationStatus}. Inspection tools unlock after administrator approval.
                </p>
              </div>
            )}
            {navItems.map((item) => {
              const isActive = item.matchHint ? item.matchHint(pathname) : item.href === pathname;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.prefetch ?? false}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-75 text-[13px] font-semibold active:scale-[0.98]",
                    isActive
                      ? "text-white bg-[#111c20] border-l-[3px] border-[#3b82f6] font-bold"
                      : "text-slate-400 hover:bg-[#111c20] hover:text-white"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span
                    className="material-symbols-outlined text-[18px] shrink-0"
                    style={{
                      fontVariationSettings: isActive
                        ? "'FILL' 1"
                        : "'FILL' 0",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer Support & Sign Out */}
          <div className="shrink-0 mt-auto px-3 pt-4 space-y-0.5 border-t border-[#1a2332]">
            <Link
              href="/support"
              prefetch={false}
              onClick={onClose}
              className="flex items-center gap-3 text-slate-400 px-3 py-2.5 rounded-lg hover:bg-[#111c20] hover:text-white transition-all duration-75 text-[13px] font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">
                contact_support
              </span>
              <span>Support</span>
            </Link>
            <button
              onClick={() => { onClose(); signOut(); }}
              className="w-full flex items-center gap-3 text-slate-400 px-3 py-2.5 rounded-lg hover:bg-[#111c20] hover:text-red-300 transition-all duration-75 text-[13px] font-semibold text-left cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                logout
              </span>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
