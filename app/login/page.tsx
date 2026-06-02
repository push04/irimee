'use client';

/**
 * app/login/page.tsx — VBHSR-SIM authentication gate.
 *
 * Supabase signInWithPassword → redirect to / on success.
 * Restricted to authorised IRIMEE personnel only.
 * Branding: Indian Railways blue/saffron palette, DM Sans / DM Mono.
 */

import { useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Loader2, Lock, Mail, AlertTriangle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      });

      if (authError) {
        setError(
          authError.message === 'Invalid login credentials'
            ? 'Incorrect email or password. Access is restricted to authorised IRIMEE personnel.'
            : authError.message
        );
        setLoading(false);
        return;
      }

      // Hard redirect so middleware picks up the new session cookie
      window.location.href = '/';
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F4FC] flex flex-col">

      {/* ── IR header strip ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-8 py-3 shadow-md"
        style={{ background: '#003893' }}
      >
        {/* India emblem */}
        <img
          src="/emblem-india.svg"
          alt="Emblem of India"
          className="h-10 w-10 object-contain invert opacity-90 shrink-0"
        />
        {/* IR logo */}
        <img
          src="/ir-logo.png"
          alt="Indian Railways"
          className="h-10 w-10 object-contain rounded-full border border-white/20 shrink-0"
        />
        <div className="h-8 w-px bg-white/20 mx-1" />
        <div className="flex flex-col leading-none">
          <span className="text-white font-bold text-[15px] tracking-wide font-sans">
            INDIAN RAILWAYS
          </span>
          <span className="text-white/60 text-[10px] tracking-[0.06em] font-sans mt-0.5">
            भारतीय रेल · Ministry of Railways, Government of India
          </span>
        </div>
        <div className="h-8 w-px bg-white/20 mx-1" />
        <div className="flex flex-col leading-none">
          <span className="text-[#F7C948] font-semibold text-[13px] font-sans">
            VBHSR-SIM
          </span>
          <span className="text-white/50 text-[9px] tracking-widest font-sans mt-0.5 uppercase">
            MAHSR Multi-Physics Platform · IRIMEE Jamalpur
          </span>
        </div>
      </div>

      {/* ── Centre login card ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">

          {/* Card */}
          <div className="bg-white rounded-2xl border border-[#D8DFEE] shadow-[0_8px_32px_rgba(0,56,147,0.12)] overflow-hidden">

            {/* Card header */}
            <div className="px-8 pt-8 pb-6 border-b border-[#E8EEFA]">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: '#EEF2FB' }}
                >
                  <Lock className="w-5 h-5 text-[#003893]" />
                </div>
                <div>
                  <h1 className="font-sans font-bold text-[17px] text-[#1A1D2E] leading-tight">
                    Restricted Access
                  </h1>
                  <p className="font-mono text-[10px] text-[#8A91A8] mt-0.5">
                    Authorised IRIMEE personnel only
                  </p>
                </div>
              </div>

              <p className="font-sans text-[12px] text-[#4A5068] leading-relaxed">
                This platform contains confidential field inspection data and
                engineering analysis for the Mumbai-Ahmedabad High Speed Rail
                (MAHSR) feasibility study. Unauthorised access is prohibited.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-8 py-6 flex flex-col gap-4">

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-[10px] font-sans uppercase tracking-widest text-[#4A5068] font-semibold"
                >
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A91A8]" />
                  <input
                    ref={emailRef}
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@irimee.org"
                    className="
                      w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#D8DFEE]
                      font-mono text-[13px] text-[#1A1D2E] bg-[#F7F9FD]
                      outline-none focus:border-[#003893] focus:ring-2 focus:ring-[#003893]/10
                      placeholder:text-[#C0C8DB] transition-all
                    "
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-[10px] font-sans uppercase tracking-widest text-[#4A5068] font-semibold"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8A91A8]" />
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="
                      w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#D8DFEE]
                      font-mono text-[13px] text-[#1A1D2E] bg-[#F7F9FD]
                      outline-none focus:border-[#003893] focus:ring-2 focus:ring-[#003893]/10
                      placeholder:text-[#C0C8DB] transition-all
                    "
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-[#FFF0F0] border border-[#CE1726]/30 px-3 py-2.5">
                  <AlertTriangle className="w-4 h-4 text-[#CE1726] shrink-0 mt-0.5" />
                  <p className="font-mono text-[10px] text-[#CE1726] leading-relaxed">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !email || !password}
                className="
                  w-full py-3 rounded-lg font-sans font-semibold text-[13px] text-white
                  flex items-center justify-center gap-2
                  transition-all duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed
                "
                style={{
                  background: loading ? '#2A4FA0' : '#003893',
                  boxShadow: loading ? 'none' : '0 2px 8px rgba(0,56,147,0.35)',
                }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign In to Platform'
                )}
              </button>
            </form>

            {/* Footer note */}
            <div className="px-8 pb-6">
              <p className="font-mono text-[9px] text-[#8A91A8] text-center leading-relaxed">
                All access is logged. This system contains IRIMEE field inspection data
                under the MAHSR research programme. Report access issues to your
                supervisor or the IRIMEE IT cell.
              </p>
            </div>
          </div>

          {/* Below card note */}
          <p className="font-mono text-[9px] text-[#8A91A8] text-center mt-4">
            VBHSR-SIM v1.0 · IRIMEE Jamalpur · Not for operational railway use
          </p>
        </div>
      </div>
    </div>
  );
}
