/**
 * app/layout.tsx — Root layout for VBHSR-SIM.
 *
 * Provides: HTML shell, fonts, minimal gov accessibility strip, Sonner toasts.
 * The IR blue header / nav is rendered by Dashboard.tsx (TopBar component)
 * so it is not duplicated here. The login page gets the gov strip only.
 */

import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Serif_Display, DM_Mono } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-dm-serif',
  weight: ['400'],
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-dm-mono',
  weight: ['300', '400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'VBHSR-SIM — Vande Bharat HSR Engineering Analytics',
    template: '%s — VBHSR-SIM',
  },
  description:
    'Multi-physics simulation platform for Vande Bharat trainset analysis on the MAHSR corridor. IRIMEE field inspection data, aerodynamics, dynamics, braking, structural, traction at 160–320 km/h.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#003893',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-IN"
      className={`${dmSans.variable} ${dmSerifDisplay.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-surface font-sans antialiased" suppressHydrationWarning>

        {children}

        <Toaster
          position="bottom-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
              fontSize: '0.875rem',
              borderRadius: '10px',
            },
          }}
        />
      </body>
    </html>
  );
}
