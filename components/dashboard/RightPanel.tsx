'use client';

/**
 * RightPanel.tsx — 300px right-side physics output panel.
 *
 * Displays live results from the Zustand store in 5 domain cards:
 *   Dynamics | Aerodynamics | Braking | Structural | MAHSR Readiness
 *
 * Each card has a coloured left border indicating ok / warn / err status.
 * MAHSR card shows per-domain progress bars and composite score.
 * Shows skeleton shimmer while computing.
 */

import React from 'react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Progress from '@radix-ui/react-progress';
import { Activity, Wind, Disc, Wrench, RadioTower } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import type { PhysicsResults, MAHSRScore } from '@/lib/types';

// ── Status colours ─────────────────────────────────────────────────────────────

type StatusLevel = 'ok' | 'warn' | 'err' | 'idle';

const BORDER_COLOUR: Record<StatusLevel, string> = {
  ok:   '#1B7A45',
  warn: '#A05A00',
  err:  '#CE1726',
  idle: '#D8DFEE',
};

const BADGE_STYLE: Record<StatusLevel, string> = {
  ok:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  err:  'bg-rose-50 text-rose-700 border-rose-200',
  idle: 'bg-surface-muted text-text-muted border-surface-border',
};

const BADGE_LABEL: Record<StatusLevel, string> = {
  ok:   'OK',
  warn: 'WARN',
  err:  'FAULT',
  idle: '—',
};

// ── Skeleton shimmer ───────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`rounded bg-surface-muted animate-pulse ${className}`}
    />
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-card border border-surface-border p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-10" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

// ── Metric row ─────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  unit,
  highlight = false,
}: {
  label:     string;
  value:     string | number;
  unit?:     string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[11px] font-sans text-text-secondary truncate">{label}</span>
      <span
        className={`font-mono text-[12px] shrink-0 ml-2 ${
          highlight ? 'text-ir-blue font-semibold' : 'text-text-primary'
        }`}
      >
        {value}
        {unit && <span className="text-[9px] text-text-muted ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

// ── Physics card shell ─────────────────────────────────────────────────────────

function PhysicsCard({
  icon: Icon,
  title,
  status,
  children,
}: {
  icon:     React.ElementType;
  title:    string;
  status:   StatusLevel;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-card border border-surface-border bg-surface-card shadow-card overflow-hidden"
      style={{ borderLeft: `3px solid ${BORDER_COLOUR[status]}` }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-[11px] font-sans font-semibold text-text-primary uppercase tracking-wider">
            {title}
          </span>
        </div>
        <span
          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${BADGE_STYLE[status]}`}
        >
          {BADGE_LABEL[status]}
        </span>
      </div>

      {/* Divider */}
      <div className="mx-3 h-px bg-surface-border mb-1.5" />

      {/* Content */}
      <div className="px-3 pb-2.5">{children}</div>
    </div>
  );
}

// ── Dynamics card ──────────────────────────────────────────────────────────────

function DynamicsCard({ results }: { results: PhysicsResults }) {
  const dyn = results.dynamics;
  if (!dyn) return <CardSkeleton />;

  const status: StatusLevel =
    dyn.nadal_exceeds         ? 'err' :
    dyn.safety_margin_kmh < 20 ? 'warn' :
                                 'ok';

  return (
    <PhysicsCard icon={Activity} title="Dynamics" status={status}>
      <MetricRow label="Klingel λ"          value={dyn.klingel_wavelength_m.toFixed(2)}     unit="m"    />
      <MetricRow label="Hunt. speed"         value={dyn.critical_hunting_speed_kmh.toFixed(1)} unit="km/h" highlight />
      <MetricRow label="Safety margin"       value={dyn.safety_margin_kmh.toFixed(1)}        unit="km/h" />
      <MetricRow label="Nadal Y/Q"           value={dyn.nadal_yq.toFixed(3)}                             />
      <MetricRow
        label="Nadal status"
        value={dyn.nadal_exceeds ? 'EXCEEDS LIMIT' : 'Within limit'}
      />
    </PhysicsCard>
  );
}

// ── Aerodynamics card ──────────────────────────────────────────────────────────

function AerodynamicsCard({ results }: { results: PhysicsResults }) {
  const aero = results.aero;
  if (!aero) return <CardSkeleton />;

  const status: StatusLevel =
    aero.Cd < 0.20 ? 'ok'   :
    aero.Cd < 0.28 ? 'warn' :
                     'err';

  const drag_kN    = (aero.drag_N / 1000).toFixed(2);
  const power_kW   = (aero.power_required_W / 1000).toFixed(1);
  const vmax_kmh   = aero.max_speed_kmh.toFixed(1);

  return (
    <PhysicsCard icon={Wind} title="Aerodynamics" status={status}>
      <MetricRow label="Drag coeff. Cd"  value={aero.Cd.toFixed(3)}    highlight />
      <MetricRow label="Drag force"       value={drag_kN}   unit="kN"   />
      <MetricRow label="Power (Davis)"    value={power_kW}  unit="kW"   />
      <MetricRow label="V_max (equil.)"   value={vmax_kmh}  unit="km/h" />
      <MetricRow label="Davis A"          value={aero.davis_A.toFixed(0)} unit="N" />
      <MetricRow label="Davis B"          value={aero.davis_B.toFixed(1)} unit="N·s/m" />
      <MetricRow label="Davis C"          value={aero.davis_C.toFixed(3)} unit="N·s²/m²" />
    </PhysicsCard>
  );
}

// ── Braking card ───────────────────────────────────────────────────────────────

function BrakingCard({ results }: { results: PhysicsResults }) {
  const brk = results.braking;
  if (!brk) return <CardSkeleton />;

  const status: StatusLevel =
    brk.peak_disc_temp_C > 600 || brk.stopping_distance_m > 3500 ? 'err' :
    brk.peak_disc_temp_C > 450 || brk.stopping_distance_m > 2800 ? 'warn' :
                                                                    'ok';

  return (
    <PhysicsCard icon={Disc} title="Braking" status={status}>
      <MetricRow label="Stop distance"   value={brk.stopping_distance_m.toFixed(0)}  unit="m"   highlight />
      <MetricRow label="Peak disc temp"  value={brk.peak_disc_temp_C.toFixed(0)}     unit="°C"  />
      <MetricRow label="Cycles (160)"    value={
        brk.cycles_remaining_160kmh > 0
          ? brk.cycles_remaining_160kmh.toLocaleString()
          : 'Needs crack data'
      } />
      <MetricRow label="Cycles (250)"    value={
        brk.cycles_remaining_250kmh > 0
          ? brk.cycles_remaining_250kmh.toLocaleString()
          : 'Needs crack data'
      } />
    </PhysicsCard>
  );
}

// ── Structural card ────────────────────────────────────────────────────────────

function StructuralCard({ results }: { results: PhysicsResults }) {
  // FEA runs via subprocess — structural results may not be in physics API response.
  // Show available dynamics data as proxy for structural health, clearly labelled.
  const dyn = results.dynamics;

  const status: StatusLevel = dyn ? (dyn.nadal_exceeds ? 'err' : 'ok') : 'idle';

  return (
    <PhysicsCard icon={Wrench} title="Structural" status={status}>
      {dyn ? (
        <>
          <MetricRow label="Nadal Y/Q"      value={dyn.nadal_yq.toFixed(3)}  />
          <MetricRow label="Derailment risk" value={dyn.nadal_exceeds ? 'HIGH' : 'Low'} highlight />
        </>
      ) : (
        <p className="text-[11px] font-sans text-text-muted leading-snug">
          FEniCSx FEA results will appear here after structural subprocess completes.
        </p>
      )}
      <p className="text-[9px] font-sans text-text-muted mt-2 leading-snug">
        Full FEA: run structural.py via fenicsx_env subprocess.
        Results loaded from HDF5 output.
      </p>
    </PhysicsCard>
  );
}

// ── MAHSR readiness card ───────────────────────────────────────────────────────

const MAHSR_DOMAINS: { key: keyof MAHSRScore; label: string }[] = [
  { key: 'gauge',        label: 'Track Gauge'   },
  { key: 'speed',        label: 'Max Speed'     },
  { key: 'aerodynamics', label: 'Aerodynamics'  },
  { key: 'braking',      label: 'Braking'       },
  { key: 'structural',   label: 'Structural'    },
  { key: 'signalling',   label: 'Signalling'    },
];

function scoreColour(v: number): string {
  if (v >= 70) return '#1B7A45';
  if (v >= 45) return '#A05A00';
  return '#CE1726';
}

function MAHSRCard({ score }: { score: MAHSRScore }) {
  const composite = score.composite;
  const status: StatusLevel =
    composite >= 70 ? 'ok' :
    composite >= 45 ? 'warn' :
                      'err';

  return (
    <PhysicsCard icon={RadioTower} title="MAHSR Readiness" status={status}>
      {/* Composite score */}
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-sans text-text-secondary">Composite Score</span>
        <span
          className="font-mono text-[22px] font-bold leading-none"
          style={{ color: scoreColour(composite) }}
        >
          {composite.toFixed(0)}
          <span className="text-[12px] font-normal text-text-muted">/100</span>
        </span>
      </div>

      {/* Domain bars */}
      <div className="space-y-1.5">
        {MAHSR_DOMAINS.map(({ key, label }) => {
          const val = score[key] as number;
          const col = scoreColour(val);

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] font-sans text-text-secondary">{label}</span>
                <span className="font-mono text-[10px] text-text-primary">{val.toFixed(0)}</span>
              </div>
              <Progress.Root
                className="relative h-1.5 overflow-hidden rounded-pill bg-surface-border"
                value={val}
              >
                <Progress.Indicator
                  className="h-full rounded-pill transition-all duration-500"
                  style={{ width: `${val}%`, background: col }}
                />
              </Progress.Root>
            </div>
          );
        })}
      </div>
    </PhysicsCard>
  );
}

// ── RightPanel ─────────────────────────────────────────────────────────────────

export function RightPanel() {
  const { results, computeStatus, mahsrScore } = useSimulationStore();
  const isComputing = computeStatus === 'computing';

  return (
    <aside
      className="flex flex-col bg-white border-l border-surface-border shrink-0 overflow-hidden"
      style={{ width: 300 }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 shrink-0 border-b border-surface-border"
        style={{ height: 40 }}
      >
        <span className="text-[10px] font-sans font-semibold uppercase tracking-widest text-text-muted">
          Physics Output
        </span>
        {isComputing && (
          <span className="text-[10px] font-mono text-ir-orange animate-pulse">
            Computing…
          </span>
        )}
        {results && !isComputing && (
          <span className="text-[10px] font-mono text-text-muted">
            {new Date(results.computed_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Scrollable cards */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="w-full h-full">
          <div className="flex flex-col gap-2.5 p-3">
            {isComputing ? (
              // Full skeleton state while computing
              <>
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
                <CardSkeleton />
              </>
            ) : results ? (
              // Live results
              <>
                <DynamicsCard     results={results} />
                <AerodynamicsCard results={results} />
                <BrakingCard      results={results} />
                <StructuralCard   results={results} />
                {mahsrScore && <MAHSRCard score={mahsrScore} />}
              </>
            ) : (
              // Idle — no results yet
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-4 text-center">
                <div
                  className="w-12 h-12 rounded-full bg-ir-50 flex items-center justify-center border border-ir-200"
                >
                  <Activity className="w-6 h-6 text-ir-blue" />
                </div>
                <div>
                  <p className="text-[13px] font-sans font-medium text-text-primary mb-1">
                    No results yet
                  </p>
                  <p className="text-[11px] font-sans text-text-secondary leading-snug">
                    Press <span className="font-mono text-ir-orange">Run Simulation</span> in the top bar to compute physics outputs.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-1.5 p-0.5 touch-none select-none transition-colors"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-surface-border" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
