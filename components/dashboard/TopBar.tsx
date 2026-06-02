'use client';

/**
 * TopBar.tsx — 48px top navigation bar for VBHSR-SIM.
 *
 * Layout: [IR logo | INDIAN RAILWAYS | VBHSR-SIM] [session context + completeness] [actions]
 * Background: IR Blue (#003893). Primary action: saffron/orange.
 */

import React, { useRef, useCallback } from 'react';
import Image from 'next/image';
import { Settings, FileUp, FileText, Play, Loader2, AlertTriangle, LogOut } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { useSimulationStore } from '@/store/simulation';
import type { FieldDataRecord } from '@/lib/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Small helper: completeness bar ────────────────────────────────────────────

function CompletenessBar({ value }: { value: number }) {
  // Segment colour: red < 40, amber 40–70, green >= 70
  const colour =
    value >= 70 ? 'bg-emerald-400' :
    value >= 40 ? 'bg-amber-400'   :
                  'bg-rose-400';

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-white/60 uppercase tracking-widest">
        Field Data
      </span>
      <div className="w-28 h-1.5 rounded-pill bg-white/20 overflow-hidden">
        <div
          className={`h-full rounded-pill transition-all duration-500 ${colour}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-[11px] text-white/80">{value}%</span>
    </div>
  );
}

// ── Session context pill ────────────────────────────────────────────────────────

function SessionPill({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="text-[9px] uppercase tracking-widest text-white/40 font-sans">{label}</span>
      <span className={`text-[12px] font-mono font-medium mt-0.5 ${dim ? 'text-white/50' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Divider ──────�export function TopBar() {
  const {
    fieldData,
    fieldDataCompleteness,
    computeStatus,
    computeError,
    runCompute,
    setFieldData,
    setSettingsOpen,
  } = useSimulationStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse uploaded JSON field data file
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const parsed: FieldDataRecord = JSON.parse(text);
        setFieldData(parsed);
      } catch {
        // Non-blocking — field data errors are surfaced in LeftPanel validation
      } finally {
        // Reset input so same file can be re-loaded
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [setFieldData]
  );

  const handleLoadFieldData = () => fileInputRef.current?.click();

  const handleExportPDF = async () => {
    window.open('/api/report/generate', '_blank');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const isComputing = computeStatus === 'computing';

  // Pull session context from loaded field data (or show placeholders)
  const meta = fieldData?.inspection_metadata;
  const locationLabel = meta?.location === 'jheel' ? 'Jheel Siding' :
                        meta?.location === 'rncc'  ? 'RNCC Patna'   : '—';
  const coachLabel    = meta?.coach_number ?? '—';
  const dateLabel     = meta?.date ?? '—';
  const trainLabel    = meta?.train_type === 'vb_sleeper' ? 'VB Sleeper' :
                        meta?.train_type === 'vb_chair'   ? 'VB Chair Car' : '—';

  return (
    <div className="flex flex-col shrink-0">
      {/* ── Top tier: Govt of India Strip ──────────────────────────────── */}
      <div className="h-7 bg-[#232323] flex items-center justify-between px-4 text-[10px] font-sans text-white/70 border-b border-black/50">
        <div className="flex items-center gap-2">
          {/* Emblem placeholder / text */}
          <span>Government of India — Ministry of Railways</span>
        </div>
        <div className="flex items-center gap-4">
          <button className="hover:text-white transition-colors">Screen Reader</button>
          <button className="hover:text-white transition-colors">Skip to Content</button>
          <button className="hover:text-white transition-colors font-medium">हिन्दी</button>
        </div>
      </div>

      {/* ── Main tier: Application Header ──────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: 80, background: '#003893' }}
      >
        {/* ── Left: identity ───────────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          {/* IR logo */}
          <div className="relative w-10 h-10 shrink-0">
            <Image
              src="/ir-logo.png"
              alt="Indian Railways"
              fill
              className="object-contain"
              priority
            />
          </div>

          <div className="flex flex-col leading-none">
            <span className="font-bold text-[16px] text-white tracking-wide">
              INDIAN RAILWAYS
            </span>
            <span className="font-sans text-[11px] text-white/80 mt-1">
              भारतीय रेल · Ministry of Railways, Government of India
            </span>
          </div>

          <div className="h-10 w-px bg-white/20 mx-2" />

          <div className="flex flex-col leading-none">
            <span className="font-bold text-[15px] text-[#FFD200] tracking-wide">
              VBHSR-SIM
            </span>
            <span className="font-sans text-[10px] text-white/80 uppercase tracking-wider mt-1">
              MAHSR Multi-Physics Platform · IRIMEE Jamalpur
            </span>
          </div>
        </div>

        {/* ── Centre: session context ──────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <SessionPill label="Location"  value={locationLabel} dim={!meta} />
          <VDivider />
          <SessionPill label="Coach"     value={coachLabel}    dim={!meta} />
          <VDivider />
          <SessionPill label="Train"     value={trainLabel}    dim={!meta} />
          <VDivider />
          <SessionPill label="Date"      value={dateLabel}     dim={!meta} />
          <VDivider />
          <CompletenessBar value={fieldDataCompleteness} />

          {computeError && (
            <div className="flex items-center gap-1 text-amber-400" title={computeError}>
              <AlertTriangle className="w-4 h-4" />
              <span className="text-[11px] font-mono">Compute error</span>
            </div>
          )}
        </div>

        {/* ── Right: actions ───────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          {/* Load Field Data */}
          <button
            onClick={handleLoadFieldData}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded
              border border-white/30 text-white text-[12px] font-sans
              hover:bg-white/10 active:bg-white/20
              transition-colors duration-150
            "
          >
            <FileUp className="w-3.5 h-3.5" />
            Load Field Data
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Export PDF */}
          <button
            onClick={handleExportPDF}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded
              border border-white/30 text-white text-[12px] font-sans
              hover:bg-white/10 active:bg-white/20
              transition-colors duration-150
            "
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF
          </button>

          {/* Run Simulation — primary action */}
          <button
            onClick={runCompute}
            disabled={isComputing}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded
              text-white text-[12px] font-sans font-medium
              transition-all duration-150
              disabled:opacity-60 disabled:cursor-not-allowed
            "
            style={{
              background: isComputing ? '#D44F0C' : '#F26522',
              boxShadow: isComputing ? 'none' : '0 0 0 1px #F26522',
            }}
          >
            {isComputing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white" />
            )}
            {isComputing ? 'Computing…' : 'Run Simulation'}
          </button>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="
              flex items-center justify-center w-8 h-8 rounded
              border border-white/30 text-white
              hover:bg-white/10 active:bg-white/20
              transition-colors duration-150
            "
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            title="Sign out"
            className="
              flex items-center justify-center w-8 h-8 rounded
              border border-white/30 text-white/70
              hover:bg-red-600/30 hover:text-white hover:border-red-400/40
              active:bg-red-700/40
              transition-colors duration-150
            "
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
    </div>
  );
}
