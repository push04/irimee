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

        {/* Gov.in accessibility strip */}
        <div className="bg-[#1A1A1A] py-1 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/emblem-india.svg" alt="Emblem of India" className="h-4 w-4 opacity-60 invert" />
            <span className="text-white/50 text-[10px] font-sans tracking-wide">
              Government of India — Ministry of Railways
            </span>
          </div>
          <div className="flex gap-4 text-[10px] text-white/40 font-sans">
            <span>Screen Reader</span>
            <span>Skip to Content</span>
            <span>हिन्दी</span>
          </div>
        </div>

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
