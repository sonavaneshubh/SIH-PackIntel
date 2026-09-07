import React from 'react';
import { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  title: 'Inspector Sign In | PackIntel',
  description: 'Authorized inspector authentication for PackIntel Legal Metrology compliance platform.',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col justify-between items-center p-4 antialiased">
      {/* Top Bar Header Banner */}
      <header className="w-full max-w-5xl border-b border-outline-variant/60 py-3 text-body-sm font-body-sm text-on-surface-variant">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span>Legal Metrology Compliance Enforcement Portal</span>
        </div>
        <div className="hidden sm:block text-body-sm font-mono text-outline">
          Rule Engine v2.4.1 Active
        </div>
      </header>

      {/* Main Login Form Container */}
      <main className="my-auto flex w-full items-center justify-center py-8 sm:py-10">
        <LoginForm />
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl py-4 flex flex-col sm:flex-row justify-between items-center text-body-sm font-body-sm text-on-surface-variant border-t border-outline-variant/60 gap-2">
        <div>
          © 2024–2026 PackIntel • Department of Consumer Affairs, Government of India
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1 sm:justify-end">
          <span className="hover:text-on-surface transition-colors">Security & Privacy</span>
          <span>•</span>
          <span className="hover:text-on-surface transition-colors">Legal Metrology Act, 2009</span>
        </div>
      </footer>
    </div>
  );
}
