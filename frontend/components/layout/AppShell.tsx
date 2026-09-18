'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Sidebar } from './Sidebar';
import { TopNavBar } from './TopNavBar';
import { Footer } from './Footer';
import { cn } from '@/lib/utils';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
  noPadding?: boolean;
  // When true, visitors without a session may view the page. They get a
  // lightweight public header (Inspector Sign In) instead of the
  // authenticated sidebar + top navigation.
  allowGuest?: boolean;
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1677FF] to-[#00BFA6] text-white shadow-md">
            <span className="material-symbols-outlined text-[20px]">verified_user</span>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight text-[#0F172A]">PackIntel</span>
            <span className="text-[10px] font-medium text-[#64748B]">
              Legal Metrology Compliance
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#1677FF] to-[#0D5FD6] px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition duration-150 hover:brightness-105"
          >
            Inspector Sign In
          </Link>
        </div>
      </div>
    </header>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F8FAFC] text-slate-800 antialiased">
      <PublicHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}

export function AppShell({ children, pageTitle, noPadding = false, allowGuest = false }: AppShellProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect to login only once auth has resolved and there is no session.
  // Rendering is never blocked on auth — pages paint their layout immediately
  // and are redirected later if the visitor is not signed in.
  useEffect(() => {
    if (!isLoading && !user && !allowGuest) {
      router.replace('/login');
    }
  }, [user, isLoading, router, allowGuest]);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  // Public page viewed by a visitor without a session.
  if (allowGuest && !user) {
    return <PublicShell>{children}</PublicShell>;
  }

  return (
    <div className="flex h-screen supports-[height:100dvh]:h-dvh w-full overflow-hidden bg-background text-on-background antialiased">
      {/* Sidebar — always fixed to the viewport (never scrolls with content) */}
      <Sidebar isOpen={sidebarOpen} onClose={handleCloseSidebar} />

      {/*
        Main Content Area.
        - Scrolls independently inside (h-screen + overflow-y-auto).
        - On desktop, margin-left offsets it by the fixed sidebar width so it
          always sits beside the sidebar without causing horizontal overflow.
        - On mobile, the sidebar overlays, so no margin needed.
      */}
      <div
        className={cn(
          'h-screen supports-[height:100dvh]:h-dvh flex-1 overflow-y-auto flex flex-col',
          'transition-[margin] duration-300 ease-in-out',
          // Desktop: shift content by the fixed sidebar width when open
          sidebarOpen ? 'md:ml-[260px]' : 'md:ml-0'
        )}
      >
        <TopNavBar pageTitle={pageTitle} onMenuToggle={handleMenuToggle} />
        <main className={`bg-[#F4F7FC] ${noPadding ? '' : 'p-4 md:p-6'}`}>
          {children}
        </main>
        {!noPadding && <Footer />}
      </div>
    </div>
  );
}
