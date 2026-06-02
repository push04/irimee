'use client';

/**
 * AeroTab.tsx — Aerodynamics physics tab.
 *
 * Left:  Resistance (N) vs Speed (km/h) — total, aero-only, current speed marker.
 * Right: Power required (kW) vs Speed — with installed power dashed line and
 *        red shade above installed power.
 * Below: Nose length sensitivity table (3/5/7/10/12/15 m → Cd, drag @250, power, MAHSR pass/fail).
 *
 * Chart data built with useMemo from Zustand physics results + inline physics.
 * Physics functions imported from @/lib/physics — dashboard never calls them directly
 * at slider time (surrogate handles that), but for static sweep tables here we call
 * them once on render since the table is not hot-path.
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Area, AreaChart, ComposedChart,
  ReferenceArea,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR, RHO_AIR_STD, RTRI_CD_TABLE } from '@/lib/config';
import {
  davisResistance, aerodynamicDrag, cdFromNoseLength,
  powerRequired, maximumSpeed, resistanceCurve,
} from '@/lib/physics/aerodynamics';

// ── colour tokens ──────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_INST   = '#8A91A8';   // installed power dashed line

// ── nose sensitivity table rows ────────────────────────────────────────────────
const NOSE_LENGTHS = [3, 5, 7, 10, 12, 15];
const MAHSR_SPEED  = 250;   // km/h Phase-1 operational
const SEATS_16CAR  = 1128;  // nominal VB-16 coach seating

// Lerp helper (same logic as physics/aerodynamics.ts)
function lerp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return table[table.length - 1][1];
}

// ── custom tooltip ─────────────────────────────────────────────────────────────
function ResistanceTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">{label} km/h</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{Math.round(p.value).toLocaleString()} N</span>
        </p>
      ))}
    </div>
  );
}

function PowerTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">{label} km/h</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{Math.round(p.value).toLocaleString()} kW</span>
        </p>
      ))}
    </div>
  );
}

// ── skeleton ───────────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white h-[260px] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#003893] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-[12px] font-mono text-[#4A5068]">Run simulation to populate chart</p>
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────────
export function AeroTab() {
  const { results, params } = useSimulationStore();

  // Davis coefficients — prefer from results, fall back to VB nominal
  const A = results?.aero?.davis_A ?? VB_NOMINAL.davis_A;
  const B = results?.aero?.davis_B ?? VB_NOMINAL.davis_B;
  const C = results?.aero?.davis_C ?? VB_NOMINAL.davis_C;
  const Cd = results?.aero?.Cd ?? cdFromNoseLength(params.nose_length_m);
  const A_ref = VB_NOMINAL.car_width_m * VB_NOMINAL.car_height_m;
  const n_axles = VB_NOMINAL.n_powered_axles;
  const installed_kW = params.motor_power_kw * n_axles;
  const installed_W  = installed_kW * 1000;

  // ── Resistance curve data (0–320 km/h, 65 points) ────────────────────────
  const resistanceData = useMemo(() => {
    const speeds = Array.from({ length: 65 }, (_, i) => i * 5);
    return speeds.map(v => {
      const v_ms = v / 3.6;
      const resistance_N = davisResistance(v, A, B, C);
      const aero_N       = aerodynamicDrag(v_ms, RHO_AIR_STD, Cd, A_ref);
      return {
        speed_kmh:    v,
        total_N:      Math.round(resistance_N),
        aero_N:       Math.round(Math.min(aero_N, resistance_N)),
      };
    });
  }, [A, B, C, Cd, A_ref]);

  // ── Power curve data ───────────────────────────────────────────────────────
  const powerData = useMemo(() => {
    const speeds = Array.from({ length: 65 }, (_, i) => i * 5);
    return speeds.map(v => {
      const v_ms  = v / 3.6;
      const pwr_W = v > 0 ? davisResistance(v, A, B, C) * v_ms : 0;
      const pwr_kW = Math.round(pwr_W / 1000);
      return {
        speed_kmh:   v,
        required_kW: pwr_kW,
        installed_kW,   // constant — drawn as reference line
      };
    });
  }, [A, B, C, installed_kW]);

  // ── Nose length sensitivity table ──────────────────────────────────────────
  const noseSensitivity = useMemo(() => {
    const v_ms_250 = MAHSR_SPEED / 3.6;
    return NOSE_LENGTHS.map(nl => {
      const cd   = lerp(RTRI_CD_TABLE, nl);
      const drag = Math.round(aerodynamicDrag(v_ms_250, RHO_AIR_STD, cd, A_ref));
      const pwr  = Math.round(davisResistance(MAHSR_SPEED, A, B, C + cd * RHO_AIR_STD * A_ref / (2)) * v_ms_250 / 1000);
      // Simplified power at 250: R(250) * v
      const r250 = davisResistance(MAHSR_SPEED, A, B, C);
      const p250 = Math.round((r250 + aerodynamicDrag(v_ms_250, RHO_AIR_STD, cd, A_ref)) * v_ms_250 / 1000);
      // MAHSR: installed power must exceed required power at 250 km/h
      const meets = installed_kW >= p250;
      return { nose_m: nl, cd: cd.toFixed(3), drag_N: drag, power_kW: p250, meets };
    });
  }, [A, B, C, A_ref, installed_kW]);

  const currentSpeedIsValid = params.speed_kmh > 0;

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: Resistance vs Speed */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Running Resistance vs Speed
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Davis R = A + Bv + Cv² — Source: RDSO MP-0.2401 (2018)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={resistanceData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                label={{ value: 'Speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
                tickFormatter={v => `${v}`}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                label={{ value: 'Resistance (N)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<ResistanceTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              <Line
                type="monotone"
                dataKey="total_N"
                name="Total resistance"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="aero_N"
                name="Aero drag only"
                stroke={C_ORANGE}
                strokeWidth={1.5}
                strokeDasharray="4 2"
                dot={false}
              />
              {currentSpeedIsValid && (
                <ReferenceLine
                  x={params.speed_kmh}
                  stroke={C_RED}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  label={{ value: `${params.speed_kmh} km/h`, position: 'top', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Nominal specification — ICF/RDSO | Cd = {Cd.toFixed(3)} at nose {params.nose_length_m} m
          </p>
        </div>

        {/* Right: Power required vs Speed */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Power Required vs Speed
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            P = R(v) × v — Installed: {installed_kW.toLocaleString()} kW ({params.motor_power_kw} kW × {n_axles} axles)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={powerData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                label={{ value: 'Speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v.toLocaleString()}`}
                label={{ value: 'Power (kW)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<PowerTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              {/* Red shade above installed power */}
              <ReferenceArea
                y1={installed_kW}
                y2={installed_kW * 2}
                fill={C_RED}
                fillOpacity={0.06}
              />
              <Line
                type="monotone"
                dataKey="required_kW"
                name="Required power"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <ReferenceLine
                y={installed_kW}
                stroke={C_INST}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: `Installed ${installed_kW.toLocaleString()} kW`, position: 'right', fontSize: 9, fill: C_INST, fontFamily: 'DM Mono' }}
              />
              {currentSpeedIsValid && (
                <ReferenceLine
                  x={params.speed_kmh}
                  stroke={C_RED}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  label={{ value: `${params.speed_kmh}`, position: 'top', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — aerodynamics | Rochard & Schmid (2000) IMechE Part F
          </p>
        </div>
      </div>

      {/* ── Nose length sensitivity table ───────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE]">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Nose Length Sensitivity — Cd, Drag &amp; Power at 250 km/h
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
            Source: RTRI Quarterly Vol.45 No.2 (2004) | MAHSR Phase-1 = 250 km/h | Installed = {installed_kW.toLocaleString()} kW
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Nose Length (m)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">C<sub>d</sub></th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Aero Drag @250 km/h (N)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Power @250 km/h (kW)</th>
                <th className="px-4 py-2 text-center text-[#4A5068] font-medium">MAHSR Feasible</th>
              </tr>
            </thead>
            <tbody>
              {noseSensitivity.map((row, i) => {
                const isCurrentNose = Math.abs(row.nose_m - params.nose_length_m) < 0.1;
                return (
                  <tr
                    key={row.nose_m}
                    className={`border-b border-[#D8DFEE] last:border-0 transition-colors ${
                      isCurrentNose ? 'bg-[#E8F0FB]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'
                    }`}
                  >
                    <td className="px-4 py-2 text-[#1A1D2E] flex items-center gap-2">
                      {isCurrentNose && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#003893]" />
                      )}
                      {!isCurrentNose && <span className="inline-block w-1.5 h-1.5" />}
                      {row.nose_m} m
                    </td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.cd}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.drag_N.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.power_kW.toLocaleString()}</td>
                    <td className="px-4 py-2 text-center">
                      {row.meets ? (
                        <span className="inline-flex items-center gap-1 text-[#1B7A45] font-semibold">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <circle cx="6" cy="6" r="5.5" stroke="#1B7A45" strokeWidth="1"/>
                            <path d="M3 6l2 2 4-4" stroke="#1B7A45" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Pass
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#CE1726] font-semibold">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <circle cx="6" cy="6" r="5.5" stroke="#CE1726" strokeWidth="1"/>
                            <path d="M4 4l4 4M8 4l-4 4" stroke="#CE1726" strokeWidth="1.5" strokeLinecap="round"/>
                          </svg>
                          Fail
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Key metrics strip ─────────────────────────────────────────────── */}
      {results?.aero && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Current Drag', value: `${Math.round(results.aero.drag_N).toLocaleString()} N`, sub: `at ${params.speed_kmh} km/h` },
            { label: 'Power Required', value: `${Math.round(results.aero.power_required_W / 1000).toLocaleString()} kW`, sub: `at ${params.speed_kmh} km/h` },
            { label: 'Max Speed (aero limit)', value: `${Math.round(results.aero.max_speed_kmh)} km/h`, sub: 'resistance equilibrium' },
            { label: 'Drag Coefficient', value: results.aero.Cd.toFixed(3), sub: `nose ${params.nose_length_m} m — RTRI` },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-[#D8DFEE] p-3 bg-white">
              <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">{m.label}</p>
              <p className="font-mono text-[20px] font-semibold text-[#003893] leading-tight mt-0.5">{m.value}</p>
              <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
