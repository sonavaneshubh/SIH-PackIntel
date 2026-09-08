import React from 'react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="w-full px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between items-center text-body-sm font-body-sm bg-surface border-t border-outline-variant text-secondary gap-1 sm:gap-3">
      <div className="font-label-bold text-xs leading-4">
        © 2024–2026 PackIntel – AI-Powered Packaged Commodity Compliance Intelligence
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <Link
          href="/rules"
          className="text-on-secondary-container hover:text-primary underline transition-colors"
        >
          Rule Database v2.4.1
        </Link>
        <Link
          href="/privacy"
          className="text-on-secondary-container hover:text-primary underline transition-colors"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="text-on-secondary-container hover:text-primary underline transition-colors"
        >
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
