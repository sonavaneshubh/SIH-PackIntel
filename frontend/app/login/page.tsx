import React from 'react';
import { Metadata } from 'next';
import { LoginForm } from '@/components/auth/LoginForm';
import { EvaluationDemoCard } from '@/components/auth/EvaluationDemoCard';
import { HomeHeroPanel } from '@/components/auth/HomeHeroPanel';

export const metadata: Metadata = {
  title: 'Inspector Sign In | PackIntel',
  description: 'Authorized inspector authentication for PackIntel Legal Metrology compliance platform.',
};

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-gradient-to-br from-[#F8FAFC] via-[#F8FDFC] to-[#F0FBF7] antialiased">
      {/* Page-wide ambient glows using the Home Page palette */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 -top-24 h-[26rem] w-[26rem] rounded-full bg-cyan-100/60 blur-3xl" />
        <div className="absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-[#EAF7FF] opacity-70 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 h-96 w-96 rounded-full bg-emerald-100/70 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:h-screen lg:min-h-0 lg:flex-row">
        {/* Login card column — first on mobile, right on desktop */}
        <div className="order-1 flex w-full flex-col items-center gap-6 px-4 py-6 sm:px-6 lg:order-2 lg:w-[42%] lg:justify-center lg:py-6 lg:pr-6">
          <LoginForm />
          <EvaluationDemoCard />
        </div>

        {/* Home Page hero panel — left on desktop */}
        <div className="order-2 w-full border-t border-[#E5F0FF] lg:order-1 lg:flex lg:w-[58%] lg:items-stretch lg:border-t-0 lg:border-r">
          <HomeHeroPanel />
        </div>
      </div>
    </div>
  );
}
