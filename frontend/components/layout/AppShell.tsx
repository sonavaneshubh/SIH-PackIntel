'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { Sidebar } from './Sidebar';
import { TopNavBar } from './TopNavBar';
import { Footer } from './Footer';

interface AppShellProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function AppShell({ children, pageTitle }: AppShellProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 antialiased">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary text-on-primary flex items-center justify-center font-bold shadow-md animate-pulse">
            <span className="material-symbols-outlined text-[28px]">verified_user</span>
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold text-on-surface">PackIntel</h3>
            <p className="text-xs text-on-surface-variant flex items-center justify-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
              Verifying inspector credentials...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="bg-background text-on-background flex min-h-screen antialiased">
      {/* Sidebar navigation */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:ml-[220px] min-h-screen overflow-x-hidden">
        <TopNavBar
          pageTitle={pageTitle}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />
        <main className="flex-1 bg-[#F4F7FC] p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
