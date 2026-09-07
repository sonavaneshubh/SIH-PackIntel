'use client';

import React, { useCallback, useEffect, useState } from 'react';
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
}

export function AppShell({ children, pageTitle, noPadding = false }: AppShellProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Redirect to login only once auth has resolved and there is no session.
  // Rendering is never blocked on auth — pages paint their layout immediately
  // and are redirected later if the visitor is not signed in.
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleCloseSidebar = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-on-background antialiased">
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
          'h-screen flex-1 overflow-y-auto flex flex-col',
          'transition-[margin] duration-300 ease-in-out',
          // Desktop: shift content by the fixed sidebar width when open
          sidebarOpen ? 'md:ml-[260px]' : 'md:ml-0'
        )}
      >
        <TopNavBar pageTitle={pageTitle} onMenuToggle={handleMenuToggle} />
        <main className={`bg-[#F4F7FC] flex-1 ${noPadding ? '' : 'p-4 md:p-6'}`}>
          {children}
        </main>
        {!noPadding && <Footer />}
      </div>
    </div>
  );
}
