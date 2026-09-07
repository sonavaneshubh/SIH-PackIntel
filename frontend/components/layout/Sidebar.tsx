"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/authContext";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { signOut } = useAuth();

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
      href: "/#high-priority",
      icon: "warning",
      isActive: false,
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
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "flex flex-col w-[220px] h-screen fixed left-0 top-0 py-5 z-40 bg-[#0b0f12] transition-transform duration-300",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo / Header */}
        <div className="px-5 mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#1a73e8] to-[#005bbf] text-white flex items-center justify-center font-bold text-base transition-transform group-hover:scale-105">
              <span className="material-symbols-outlined text-[14px]">verified_user</span>
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
          {onClose && (
            <button
              onClick={onClose}
              className="md:hidden text-on-surface-variant hover:text-on-surface p-1"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md transition-all duration-75 text-[12px] font-semibold active:scale-95",
                item.isActive
                  ? "text-white bg-[#111c20] border-r-[3px] border-[#3b82f6] rounded-r-md font-bold"
                  : "text-slate-400 hover:bg-[#111c20] hover:text-white",
              )}
            >
              <span
                className="material-symbols-outlined text-[16px]"
                style={{
                  fontVariationSettings: item.isActive
                    ? "'FILL' 1"
                    : "'FILL' 0",
                }}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer Support & Sign Out */}
        <div className="mt-auto px-2 pt-4 space-y-0.5">
          <Link
            href="/support"
            onClick={onClose}
            className="flex items-center gap-2 text-slate-400 px-3 py-2 rounded-md hover:bg-[#111c20] hover:text-white transition-all duration-75 text-[12px] font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">
              contact_support
            </span>
            <span>Support</span>
          </Link>
          <button
            onClick={async () => {
              if (onClose) onClose();
              await signOut();
            }}
            className="w-full flex items-center gap-2 text-slate-400 px-3 py-2 rounded-md hover:bg-[#111c20] hover:text-red-300 transition-all duration-75 text-[12px] font-semibold text-left cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">
              logout
            </span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
