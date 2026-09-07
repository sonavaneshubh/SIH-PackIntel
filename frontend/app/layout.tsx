import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/authContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '900'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'PackIntel – AI-Powered Packaged Commodity Compliance Intelligence',
  description:
    'AI-powered packaged commodity compliance and inspection intelligence. Scan. Verify. Compare. Detect. Prioritize.',
  applicationName: 'PackIntel',
  openGraph: {
    title: 'PackIntel – AI-Powered Packaged Commodity Compliance Intelligence',
    description:
      'AI-powered packaged commodity compliance and inspection intelligence. Scan. Verify. Compare. Detect. Prioritize.',
    siteName: 'PackIntel',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} light`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="bg-background text-on-background font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
