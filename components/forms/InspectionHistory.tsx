'use client';

/**
 * components/forms/InspectionHistory.tsx
 *
 * Displays a paginated list of past inspection records loaded from Supabase
 * via GET /api/field-data/load. Each row shows: date, location, coach number,
 * train type, and field-data completeness %.
 *
 * Click any row to load that FieldDataRecord into the form (calls onSelect).
 * Uses SWR for data fetching with 60-second revalidation interval.
 *
 * Completeness % is computed client-side from the FieldDataRecord to avoid
 * a round-trip — the same heuristic as store/simulation.ts:computeCompleteness.
 */

import React, { useState } from 'react';
import useSWR from 'swr';
import { clsx } from 'clsx';
import { MapPin, Calendar, Train, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import type { FieldDataRecord } from '@/lib/types';

// ── SWR fetcher ────────────────────────────────────────────────────────────────

async function fetcher(url: string): Promise<FieldDataRecord[]> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
    throw new Error(err?.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<FieldDataRecord[]>;
}

// ── Completeness heuristic — mirrors store/simulation.ts:computeCompleteness ──

function computeCompleteness(fd: FieldDataRecord): number {
  let filled = 0;
  let total  = 0;

  const check = (v: unknown) => {
    total++;
    if (v !== null && v !== undefined) filled++;
  };

  fd.wheelset_measurements.forEach(w => {
    [w.wheel_diameter_left_mm, w.wheel_diameter_right_mm, w.flange_height_left_mm,
     w.flange_height_right_mm, w.back_to_back_mm, w.tread_hollow_left_mm,
     w.tread_hollow_right_mm].forEach(check);
  });

  fd.bogie_measurements.forEach(b => {
    [b.air_spring_pressure_left_bar, b.air_spring_pressure_right_bar,
     b.air_spring_height_fl_mm, b.air_spring_height_fr_mm,
     b.primary_spring_height_fl_mm, b.primary_spring_height_fr_mm].forEach(check);
  });

  fd.brake_disc_measurements.forEach(d => {
    [d.outer_diameter_mm, d.pad_thickness_mm, d.thermal_crack_count].forEach(check);
    (d.thickness_12pt_mm ?? []).forEach(check);
  });

  const a = fd.aerodynamic_measurements;
  [a.nose_length_m, a.car_body_width_skirt_mm, a.car_body_height_mm,
   a.inter_car_gap_mm].forEach(check);

  const p = fd.pantograph_measurements;
  [p.static_contact_force_N, p.strip_condition].forEach(check);
  (p.contact_strip_thickness_mm ?? []).forEach(check);

  const t = fd.traction_measurements;
  [t.motor_rated_power_kW, t.motor_rated_frequency_Hz, t.tcms_dc_link_voltage_V].forEach(check);

  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

// ── Completeness pill ──────────────────────────────────────────────────────────

function CompletenessPill({ pct }: { pct: number }) {
  const colour =
    pct >= 70 ? 'bg-[#DCFCE7] text-[#1B7A45] border-[#A7F3C0]' :
    pct >= 40 ? 'bg-[#FEF9C3] text-[#A05A00] border-[#FDE68A]' :
                'bg-[#FEE2E2] text-[#CE1726] border-[#FECACA]';

  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[10px] font-mono font-semibold',
      colour
    )}>
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          pct >= 70 ? 'bg-[#1B7A45]' : pct >= 40 ? 'bg-[#A05A00]' : 'bg-[#CE1726]'
        )}
      />
      {pct}%
    </span>
  );
}

// ── Location label helper ──────────────────────────────────────────────────────

function locationLabel(loc: 'jheel' | 'rncc'): string {
  return loc === 'jheel' ? 'Jheel Siding' : 'RNCC Patna';
}

function trainTypeLabel(tt: 'vb_sleeper' | 'vb_chair'): string {
  return tt === 'vb_sleeper' ? 'VB Sleeper' : 'VB Chair Car';
}

// ── Location filter tabs ────────────────────────────────────────────────────────

type LocationFilter = 'all' | 'jheel' | 'rncc';

// ── Main component ─────────────────────────────────────────────────────────────

export interface InspectionHistoryProps {
  /** Called when user clicks a row — caller should load this into FieldDataForm */
  onSelect: (record: FieldDataRecord) => void;
  /** Optional CSS class for the outer container */
  className?: string;
}

export function InspectionHistory({ onSelect, className }: InspectionHistoryProps) {
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all');
  const [limit, setLimit] = useState(20);

  // Build URL based on filter
  const swrKey =
    locationFilter === 'all'
      ? [`/api/field-data/load?location=jheel&limit=${limit}`,
         `/api/field-data/load?location=rncc&limit=${limit}`]
      : `/api/field-data/load?location=${locationFilter}&limit=${limit}`;

  // For 'all', fetch both locations in parallel
  const isAll = locationFilter === 'all';

  const { data: jheelData, error: jheelError, isLoading: jheelLoading, mutate: jheelMutate } = useSWR<FieldDataRecord[]>(
    isAll ? `/api/field-data/load?location=jheel&limit=${limit}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: rnccData, error: rnccError, isLoading: rnccLoading, mutate: rnccMutate } = useSWR<FieldDataRecord[]>(
    isAll ? `/api/field-data/load?location=rncc&limit=${limit}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: filteredData, error: filteredError, isLoading: filteredLoading, mutate: filteredMutate } = useSWR<FieldDataRecord[]>(
    !isAll ? `/api/field-data/load?location=${locationFilter}&limit=${limit}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  // Merge and sort
  let records: FieldDataRecord[] = [];
  if (isAll) {
    records = [
      ...(jheelData ?? []),
      ...(rnccData ?? []),
    ].sort((a, b) =>
      new Date(b.inspection_metadata.date).getTime() -
      new Date(a.inspection_metadata.date).getTime()
    );
  } else {
    records = filteredData ?? [];
  }

  const isLoading = isAll ? (jheelLoading || rnccLoading) : filteredLoading;
  const error     = isAll ? (jheelError || rnccError) : filteredError;

  const handleRefresh = () => {
    if (isAll) {
      jheelMutate();
      rnccMutate();
    } else {
      filteredMutate();
    }
  };

  return (
    <div className={clsx('flex flex-col h-full bg-white font-sans', className)}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-[#D8DFEE] flex items-center justify-between shrink-0">
        <div>
          <h3 className="font-serif text-[14px] font-bold text-[#1A1D2E]">Inspection History</h3>
          <p className="text-[10px] text-[#8A91A8] mt-0.5 font-sans">
            Click a row to load into the form
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isLoading}
          className="
            flex items-center gap-1 px-2.5 py-1.5 rounded-lg
            border border-[#D8DFEE] text-[#4A5068] text-[11px]
            hover:bg-[#F7F9FD] hover:border-[#003893] hover:text-[#003893]
            disabled:opacity-50 disabled:cursor-not-allowed transition-colors
          "
        >
          <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* ── Location filter tabs ─────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-b border-[#D8DFEE] flex gap-1 shrink-0">
        {(['all', 'jheel', 'rncc'] as LocationFilter[]).map(loc => (
          <button
            key={loc}
            type="button"
            onClick={() => setLocationFilter(loc)}
            className={clsx(
              'px-3 py-1 rounded text-[11px] font-sans font-medium transition-colors',
              locationFilter === loc
                ? 'bg-[#003893] text-white'
                : 'text-[#4A5068] hover:bg-[#F7F9FD] hover:text-[#003893]'
            )}
          >
            {loc === 'all' ? 'All Locations' :
             loc === 'jheel' ? 'Jheel Siding' : 'RNCC Patna'}
          </button>
        ))}
      </div>

      {/* ── Table body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Column headers */}
        <div className="px-4 py-1.5 bg-[#F7F9FD] border-b border-[#D8DFEE] grid grid-cols-[1fr_1.2fr_1.2fr_0.8fr_0.6fr] gap-3">
          {['Date', 'Location', 'Coach', 'Train Type', 'Complete'].map(h => (
            <span key={h} className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8A91A8]">
              {h}
            </span>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-[#8A91A8]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[12px] font-sans">Loading inspections…</span>
          </div>
        )}

        {/* Error */}
        {!isLoading && error && (
          <div className="flex items-center gap-2 mx-4 mt-4 px-3 py-2 rounded-lg border border-[#CE1726] bg-[#FFF5F5] text-[#CE1726] text-[12px]">
            <AlertTriangle size={13} />
            <span>{error instanceof Error ? error.message : 'Failed to load inspections'}</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && records.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-10 h-10 rounded-full bg-[#F7F9FD] border-2 border-[#D8DFEE] flex items-center justify-center mb-3">
              <Train size={18} className="text-[#8A91A8]" />
            </div>
            <p className="text-[13px] font-sans text-[#4A5068] font-medium">No inspections found</p>
            <p className="text-[11px] text-[#8A91A8] mt-1">
              {locationFilter === 'all'
                ? 'No inspection records exist yet. Save your first record using the form.'
                : `No inspections at ${locationFilter === 'jheel' ? 'Jheel Siding' : 'RNCC Patna'} yet.`
              }
            </p>
          </div>
        )}

        {/* Rows */}
        {!isLoading && !error && records.map((record, idx) => {
          const meta = record.inspection_metadata;
          const completeness = computeCompleteness(record);

          return (
            <button
              key={meta.id ?? idx}
              type="button"
              onClick={() => onSelect(record)}
              className="
                w-full px-4 py-2.5 grid grid-cols-[1fr_1.2fr_1.2fr_0.8fr_0.6fr] gap-3
                border-b border-[#D8DFEE] hover:bg-[#E8F0FB]
                text-left transition-colors duration-100 group
              "
            >
              {/* Date */}
              <div className="flex items-center gap-1.5 min-w-0">
                <Calendar size={10} className="text-[#8A91A8] shrink-0" />
                <span className="text-[12px] font-mono text-[#1A1D2E] truncate group-hover:text-[#003893]">
                  {meta.date}
                </span>
              </div>

              {/* Location */}
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin size={10} className="text-[#8A91A8] shrink-0" />
                <span className="text-[12px] font-sans text-[#4A5068] truncate">
                  {locationLabel(meta.location)}
                </span>
              </div>

              {/* Coach */}
              <div className="min-w-0">
                <span className="text-[12px] font-mono text-[#1A1D2E] truncate block">
                  {meta.coach_number || <span className="text-[#8A91A8]">—</span>}
                </span>
              </div>

              {/* Train type */}
              <div className="min-w-0">
                <span className={clsx(
                  'text-[10px] font-sans font-medium px-1.5 py-0.5 rounded',
                  meta.train_type === 'vb_sleeper'
                    ? 'bg-[#E8F0FB] text-[#003893]'
                    : 'bg-[#FFF3E8] text-[#D44F0C]'
                )}>
                  {trainTypeLabel(meta.train_type)}
                </span>
              </div>

              {/* Completeness */}
              <div className="flex items-center">
                <CompletenessPill pct={completeness} />
              </div>
            </button>
          );
        })}

        {/* Load more */}
        {!isLoading && !error && records.length > 0 && records.length >= limit && (
          <div className="px-4 py-3 border-t border-[#D8DFEE]">
            <button
              type="button"
              onClick={() => setLimit(l => l + 20)}
              className="
                w-full py-1.5 text-[11px] text-[#003893] font-sans
                border border-[#D8DFEE] rounded-lg hover:bg-[#E8F0FB] hover:border-[#003893]
                transition-colors
              "
            >
              Load {20} more
            </button>
          </div>
        )}
      </div>

      {/* ── Footer summary ──────────────────────────────────────────────────── */}
      {!isLoading && !error && records.length > 0 && (
        <div className="px-4 py-2 border-t border-[#D8DFEE] shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8A91A8] font-sans">
              {records.length} inspection{records.length !== 1 ? 's' : ''} shown
            </span>
            <div className="flex items-center gap-3">
              {/* Summary by location */}
              {isAll && (
                <>
                  <span className="text-[10px] font-sans text-[#4A5068]">
                    Jheel: <span className="font-mono font-medium text-[#1A1D2E]">
                      {records.filter(r => r.inspection_metadata.location === 'jheel').length}
                    </span>
                  </span>
                  <span className="text-[10px] font-sans text-[#4A5068]">
                    RNCC: <span className="font-mono font-medium text-[#1A1D2E]">
                      {records.filter(r => r.inspection_metadata.location === 'rncc').length}
                    </span>
                  </span>
                </>
              )}
              {/* Average completeness */}
              <span className="text-[10px] font-sans text-[#4A5068]">
                Avg complete:{' '}
                <span className="font-mono font-medium text-[#1A1D2E]">
                  {records.length > 0
                    ? Math.round(records.reduce((sum, r) => sum + computeCompleteness(r), 0) / records.length)
                    : 0}%
                </span>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
