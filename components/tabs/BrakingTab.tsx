'use client';

/**
 * BrakingTab.tsx — Braking & Thermal.
 *
 * Left:  BarChart grouped — stopping distances from 160/200/250/280/320 km/h.
 *        Three groups: Grey CI, Composite, Carbon ceramic.
 *        MAHSR stopping-distance limit (3500 m at 250 km/h) as dashed reference.
 * Right: LineChart — disc temperature vs time during emergency stop.
 *        Three curves (one per disc material). Thermal limit lines per material.
 * Below: Disc remaining life table from physicsResults.braking.
 *
 * Physics: emergencyBrakingODE() + stoppingDistanceCurve() from @/lib/physics/braking.
 */

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR, DISC_TEMP_LIMITS } from '@/lib/config';
import { emergencyBrakingODE } from '@/lib/physics/braking';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';

// Bar colours per disc material
const DISC_COLORS: Record<string, string> = {
  grey_cast_iron: C_BLUE,
  composite:      C_ORANGE,
  carbon_ceramic: C_GREEN,
};

const DISC_LABELS: Record<string, string> = {
  grey_cast_iron: 'Grey CI',
  composite:      'Composite',
  carbon_ceramic: 'C-Ceramic',
};

// MAHSR braking requirements
// Source: NHSRCL Design Standards for Rolling Stock (Draft 2022)
// Emergency braking from 250 km/h: ≤ 3500 m
const MAHSR_STOP_DIST_M = 3500;

const BRAKING_SPEEDS = [160, 200, 250, 280, 320];
const DISC_MATERIALS = ['grey_cast_iron', 'composite', 'carbon_ceramic'] as const;

// Disc remaining life thresholds (from field data or RDSO C-9601 maintenance manual)
// ASSUMED: min thickness 32 mm (new 45 mm, scrap 32 mm) → life fraction
const DISC_NEW_THICKNESS_MM  = 45;
const DISC_SCRAP_THICKNESS_MM = 32;

// Subsample temp array to ~60 points for chart performance
function subsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = Math.ceil(arr.length / n);
  return arr.filter((_, i) => i % step === 0);
}

// ── tooltips ───────────────────────────────────────────────────────────────────
function StopDistTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">From {label} km/h</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill ?? p.color }}>
          {p.name}: <span className="font-semibold">{Math.round(p.value).toLocaleString()} m</span>
        </p>
      ))}
    </div>
  );
}

function TempTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">t = {Number(label).toFixed(1)} s</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{Math.round(p.value)} °C</span>
        </p>
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function BrakingTab() {
  const { results, params } = useSimulationStore();

  const commonBrakingParams = {
    disc_diameter_mm:  VB_NOMINAL.disc_diameter_mm,
    disc_thickness_mm: DISC_NEW_THICKNESS_MM,
    n_discs:           VB_NOMINAL.formation_cars * 4 * 2,
    train_mass_kg:     VB_NOMINAL.total_mass_t * 1000,
    ambient_temp_C:    30,
  };

  // ── Stopping distance bar chart data ──────────────────────────────────────
  // Compute for each speed × disc material combination
  const stopDistData = useMemo(() => {
    return BRAKING_SPEEDS.map(speed_kmh => {
      const row: Record<string, number | string> = { speed_kmh: `${speed_kmh}` };
      for (const mat of DISC_MATERIALS) {
        try {
          const res = emergencyBrakingODE({
            ...commonBrakingParams,
            initial_speed_ms: speed_kmh / 3.6,
            disc_material:    mat,
          });
          row[mat] = Math.round(res.stopping_distance_m);
        } catch {
          row[mat] = 0;
        }
      }
      return row;
    });
  }, []);

  // ── Disc temperature vs time for current speed ─────────────────────────────
  const tempData = useMemo(() => {
    const v0 = params.speed_kmh / 3.6;
    const curves: Record<string, { time_s: number[]; disc_temp_C: number[] }> = {};

    for (const mat of DISC_MATERIALS) {
      try {
        const res = emergencyBrakingODE({
          ...commonBrakingParams,
          initial_speed_ms: v0,
          disc_material:    mat,
        });
        const n = 80;
        curves[mat] = {
          time_s:      subsample(res.time_s, n),
          disc_temp_C: subsample(res.disc_temp_C, n),
        };
      } catch {
        curves[mat] = { time_s: [], disc_temp_C: [] };
      }
    }

    // Merge into single array keyed by time (use grey_cast_iron as time reference)
    const ref = curves.grey_cast_iron;
    return ref.time_s.map((t, i) => ({
      time_s:         +t.toFixed(2),
      grey_cast_iron: Math.round(curves.grey_cast_iron.disc_temp_C[i] ?? 0),
      composite:      Math.round(curves.composite.disc_temp_C[i] ?? curves.composite.disc_temp_C[Math.min(i, curves.composite.disc_temp_C.length - 1)] ?? 0),
      carbon_ceramic: Math.round(curves.carbon_ceramic.disc_temp_C[i] ?? curves.carbon_ceramic.disc_temp_C[Math.min(i, curves.carbon_ceramic.disc_temp_C.length - 1)] ?? 0),
    }));
  }, [params.speed_kmh]);

  // Peak temperatures for current speed
  const peakTemps = useMemo(() => {
    const v0 = params.speed_kmh / 3.6;
    const out: Record<string, number> = {};
    for (const mat of DISC_MATERIALS) {
      try {
        const res = emergencyBrakingODE({ ...commonBrakingParams, initial_speed_ms: v0, disc_material: mat });
        out[mat] = Math.round(res.peak_temp_C);
      } catch {
        out[mat] = 0;
      }
    }
    return out;
  }, [params.speed_kmh]);

  // Active disc material from params
  const activeMaterial = params.disc_type;

  // Disc life from braking result
  const brakingResult = results?.braking;
  const discLifeRows = brakingResult ? [
    { label: 'Cycles remaining @160 km/h (Paris)', value: brakingResult.cycles_remaining_160kmh > 0 ? brakingResult.cycles_remaining_160kmh.toLocaleString() : 'Load field crack data', unit: 'cycles' },
    { label: 'Cycles remaining @250 km/h (Paris)', value: brakingResult.cycles_remaining_250kmh > 0 ? brakingResult.cycles_remaining_250kmh.toLocaleString() : 'Load field crack data', unit: 'cycles' },
    { label: 'Peak disc temperature @current speed', value: `${brakingResult.peak_disc_temp_C.toFixed(1)} °C`, unit: `limit: ${DISC_TEMP_LIMITS[activeMaterial as keyof typeof DISC_TEMP_LIMITS]} °C` },
    { label: 'Stopping distance @current speed', value: `${Math.round(brakingResult.stopping_distance_m).toLocaleString()} m`, unit: params.speed_kmh <= 250 ? (brakingResult.stopping_distance_m <= MAHSR_STOP_DIST_M ? 'Within MAHSR limit' : 'Exceeds MAHSR 3500 m') : '—' },
  ] : null;

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: Stopping distance grouped bar chart */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Emergency Stopping Distance by Disc Material
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            a<sub>brake</sub> = 1.0 m/s² (full service) — Casini & Rocchi (2004) | MAHSR limit: {MAHSR_STOP_DIST_M.toLocaleString()} m at 250 km/h
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stopDistData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                label={{ value: 'Initial speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v.toLocaleString()}`}
                label={{ value: 'Stop dist (m)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<StopDistTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{DISC_LABELS[value] ?? value}</span>}
              />
              <ReferenceLine
                y={MAHSR_STOP_DIST_M}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: 'MAHSR 3500 m', position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              {DISC_MATERIALS.map(mat => (
                <Bar
                  key={mat}
                  dataKey={mat}
                  name={mat}
                  fill={DISC_COLORS[mat]}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                  opacity={activeMaterial === mat ? 1 : 0.55}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — braking | Casini & Rocchi (2004) Railway Engineering
          </p>
        </div>

        {/* Right: Disc temperature vs time */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Disc Temperature During Emergency Stop
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Initial speed: {params.speed_kmh} km/h | RK4 coupled ODE — dT/dt = (P_heat − P_conv) / (m_disc × C<sub>p</sub>)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={tempData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="time_s"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}s`}
                label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[20, 'auto']}
                label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<TempTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{DISC_LABELS[value] ?? value}</span>}
              />
              {/* Thermal limits per material */}
              <ReferenceLine
                y={DISC_TEMP_LIMITS.grey_cast_iron}
                stroke={C_BLUE}
                strokeWidth={1}
                strokeDasharray="4 2"
                label={{ value: `GCI limit ${DISC_TEMP_LIMITS.grey_cast_iron}°C`, position: 'right', fontSize: 9, fill: C_BLUE, fontFamily: 'DM Mono' }}
              />
              <ReferenceLine
                y={DISC_TEMP_LIMITS.composite}
                stroke={C_ORANGE}
                strokeWidth={1}
                strokeDasharray="4 2"
                label={{ value: `Comp limit ${DISC_TEMP_LIMITS.composite}°C`, position: 'right', fontSize: 9, fill: C_ORANGE, fontFamily: 'DM Mono' }}
              />
              <ReferenceLine
                y={DISC_TEMP_LIMITS.carbon_ceramic}
                stroke={C_GREEN}
                strokeWidth={1}
                strokeDasharray="4 2"
                label={{ value: `C-C limit ${DISC_TEMP_LIMITS.carbon_ceramic}°C`, position: 'right', fontSize: 9, fill: C_GREEN, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="grey_cast_iron"
                name="grey_cast_iron"
                stroke={C_BLUE}
                strokeWidth={activeMaterial === 'grey_cast_iron' ? 2.5 : 1.5}
                strokeOpacity={activeMaterial === 'grey_cast_iron' ? 1 : 0.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="composite"
                name="composite"
                stroke={C_ORANGE}
                strokeWidth={activeMaterial === 'composite' ? 2.5 : 1.5}
                strokeOpacity={activeMaterial === 'composite' ? 1 : 0.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="carbon_ceramic"
                name="carbon_ceramic"
                stroke={C_GREEN}
                strokeWidth={activeMaterial === 'carbon_ceramic' ? 2.5 : 1.5}
                strokeOpacity={activeMaterial === 'carbon_ceramic' ? 1 : 0.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — braking | Knorr-Bremse TB disc thermal model — convection ASSUMED
          </p>
        </div>
      </div>

      {/* ── Peak temps strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {DISC_MATERIALS.map(mat => {
          const peak = peakTemps[mat] ?? 0;
          const limit = DISC_TEMP_LIMITS[mat as keyof typeof DISC_TEMP_LIMITS];
          const pct = Math.min(100, Math.round(peak / limit * 100));
          const isActive = activeMaterial === mat;
          const exceeded = peak > limit;
          return (
            <div key={mat} className={`rounded-xl border p-3 bg-white ${isActive ? 'border-[#003893]' : 'border-[#D8DFEE]'}`}>
              <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">{DISC_LABELS[mat]}</p>
              <p className={`font-mono text-[20px] font-semibold leading-tight mt-0.5 ${exceeded ? 'text-[#CE1726]' : 'text-[#1B7A45]'}`}>
                {peak} °C
              </p>
              <p className="text-[10px] text-[#8A91A8] font-mono">limit: {limit} °C — {pct}% of limit</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#E8EEFA] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: exceeded ? C_RED : pct > 75 ? C_ORANGE : C_GREEN,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Disc life / results table ─────────────────────────────────────── */}
      {discLifeRows ? (
        <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#D8DFEE]">
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
              Disc Remaining Life &amp; Braking Performance
            </h3>
            <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
              Paris' law crack propagation | Active disc: {DISC_LABELS[activeMaterial]} | Load field crack data for Paris' law cycles
            </p>
          </div>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Metric</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Value</th>
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Context</th>
              </tr>
            </thead>
            <tbody>
              {discLifeRows.map((row, i) => (
                <tr key={row.label} className={`border-b border-[#D8DFEE] last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                  <td className="px-4 py-2 text-[#4A5068]">{row.label}</td>
                  <td className="px-4 py-2 text-right font-semibold text-[#1A1D2E]">{row.value}</td>
                  <td className="px-4 py-2 text-[#8A91A8]">{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] p-6 text-center">
          <p className="text-[13px] font-mono text-[#4A5068]">
            Run simulation to view disc life analysis
          </p>
          <p className="text-[11px] text-[#8A91A8] font-mono mt-1">
            Paris' law crack growth requires field data — upload inspection HDF5 or run simulation first
          </p>
        </div>
      )}

    </div>
  );
}
