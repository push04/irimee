'use client';

/**
 * AcousticsTab.tsx — Acoustics & NVH.
 *
 * Left:  LineChart — Pass-by noise dB(A) vs Speed.
 *        Rolling noise + aerodynamic noise + total.
 *        TSI noise limits (250 km/h = 80 dB(A), 300 km/h = 87 dB(A)) as horizontal lines.
 * Right: LineChart — A-weighted noise at 25 m vs speed for VB Chair, B-28, E5.
 * Below: Sperling ride comfort index info card and measurement note.
 *
 * Physics models:
 *   Rolling noise: Remington (1976) + Thompson (2009) wheel-rail noise model (simplified)
 *   Aerodynamic noise: Ffowcs Williams & Hawkings (FW-H) power law (v^6)
 *   Source: Thompson, D.J. (2009) Railway Noise and Vibration: Mechanisms, Modelling
 *           and Means of Control. Elsevier.
 *           TSI Noise (EU) 1304/2014: Annex Table B.3
 *           EN ISO 3095:2013 — Measurement of noise emitted by railbound vehicles
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR } from '@/lib/config';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';
const C_PURPLE = '#7C3AED';

// TSI noise limits (pass-by at 25 m)
// Source: TSI Noise EU 1304/2014, Table B.3 for high-speed passenger trains
const TSI_LIMIT_250 = 80;   // dB(A) at 250 km/h
const TSI_LIMIT_300 = 87;   // dB(A) at 300 km/h (extrapolated from TSI)
const TSI_REF_SPEED = 250;  // km/h

// ── Noise model (simplified physics-based) ────────────────────────────────────
// Rolling noise: L_roll = L_ref_roll + 30×log10(v/v_ref)
//   where v_ref = 250 km/h, L_ref = 73 dB(A) for VB nominal
//   Source: Thompson (2009) Eq. 12.1 — v^3 power law for wheel-rail contact
// Aerodynamic noise: L_aero = L_ref_aero + 60×log10(v/v_ref)
//   FW-H v^6 dipole source model — Source: Ffowcs Williams & Hawkings (1969)
//   Above ~250 km/h aerodynamic noise dominates
// Total: L_total = 10×log10(10^(L_roll/10) + 10^(L_aero/10))

interface TrainNoiseParams {
  label:         string;
  color:         string;
  L_ref_roll:    number;   // dB(A) at v_ref
  L_ref_aero:    number;   // dB(A) at v_ref
  v_ref:         number;   // km/h reference speed
}

const TRAIN_NOISE_PARAMS: TrainNoiseParams[] = [
  {
    label:      'VB Chair',
    color:      C_BLUE,
    L_ref_roll: 74,   // ASSUMED: estimated from wheel roughness level & BG gauge
    L_ref_aero: 68,   // ASSUMED: nose Cd 0.30 reference
    v_ref:      250,
  },
  {
    label:      'B-28 Target',
    color:      C_ORANGE,
    L_ref_roll: 70,   // ASSUMED: optimised wheel roughness
    L_ref_aero: 63,   // ASSUMED: nose Cd 0.21
    v_ref:      250,
  },
  {
    label:      'E5 Shinkansen',
    color:      C_GREEN,
    L_ref_roll: 68,   // Source: JR East E5 technical report (2011) — ~77 dB(A) at 25m/315 km/h
    L_ref_aero: 62,   // Source: JR East (2011) — aerodynamic noise isolated
    v_ref:      250,
  },
];

function rollingNoise(v: number, p: TrainNoiseParams): number {
  return p.L_ref_roll + 30 * Math.log10(Math.max(v, 10) / p.v_ref);
}

function aeroNoise(v: number, p: TrainNoiseParams): number {
  return p.L_ref_aero + 60 * Math.log10(Math.max(v, 10) / p.v_ref);
}

function totalNoise(v: number, p: TrainNoiseParams): number {
  const L_r = rollingNoise(v, p);
  const L_a = aeroNoise(v, p);
  return 10 * Math.log10(Math.pow(10, L_r / 10) + Math.pow(10, L_a / 10));
}

// ── tooltips ────────────────────────────────────────────────────────────────────
function NoiseTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">{label} km/h</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{Number(p.value).toFixed(1)} dB(A)</span>
        </p>
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function AcousticsTab() {
  const { params } = useSimulationStore();

  const speeds = useMemo(() => Array.from({ length: 53 }, (_, i) => 60 + i * 5), []);

  // VB Chair noise components
  const vbParams = TRAIN_NOISE_PARAMS[0];
  const noiseComponentData = useMemo(() => {
    return speeds.map(v => ({
      speed_kmh:    v,
      rolling_dBA:  +rollingNoise(v, vbParams).toFixed(1),
      aero_dBA:     +aeroNoise(v, vbParams).toFixed(1),
      total_dBA:    +totalNoise(v, vbParams).toFixed(1),
    }));
  }, []);

  // Comparison chart: total noise across 3 trains
  const comparisonData = useMemo(() => {
    return speeds.map(v => {
      const row: Record<string, number> = { speed_kmh: v };
      TRAIN_NOISE_PARAMS.forEach(tp => {
        row[tp.label] = +totalNoise(v, tp).toFixed(1);
      });
      return row;
    });
  }, []);

  // Current speed noise values
  const currentRolling = rollingNoise(params.speed_kmh, vbParams);
  const currentAero    = aeroNoise(params.speed_kmh, vbParams);
  const currentTotal   = totalNoise(params.speed_kmh, vbParams);

  // Crossover speed: where aero > rolling
  const crossoverSpeed = speeds.find(v => aeroNoise(v, vbParams) >= rollingNoise(v, vbParams)) ?? 300;

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Status strip ──────────────────────────────────────────────────── */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
        currentTotal <= TSI_LIMIT_250 ? 'bg-[#F0FBF4] border-[#1B7A45]' :
        currentTotal <= TSI_LIMIT_300 ? 'bg-[#FFF8E8] border-[#A05A00]' :
        'bg-[#FFF0F0] border-[#CE1726]'
      }`}>
        <div className={`w-2 h-2 rounded-full ${
          currentTotal <= TSI_LIMIT_250 ? 'bg-[#1B7A45]' :
          currentTotal <= TSI_LIMIT_300 ? 'bg-[#A05A00]' : 'bg-[#CE1726]'
        }`} />
        <p className="text-[12px] font-mono text-[#1A1D2E]">
          VB Chair at <span className="font-semibold">{params.speed_kmh} km/h</span>:
          Total = <span className="font-semibold">{currentTotal.toFixed(1)} dB(A)</span>,
          Rolling = {currentRolling.toFixed(1)} dB(A),
          Aero = {currentAero.toFixed(1)} dB(A)
          {' '}| TSI 250 km/h limit: {TSI_LIMIT_250} dB(A)
          {currentTotal <= TSI_LIMIT_250
            ? <span className="ml-2 text-[#1B7A45] font-semibold">— Compliant</span>
            : <span className="ml-2 text-[#CE1726] font-semibold">— Exceeds limit</span>
          }
        </p>
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: Noise components vs speed (VB Chair) */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Pass-By Noise Components — VB Chair Car
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            At 25 m from track centreline | Rolling v³ + Aero v⁶ (FW-H) | EN ISO 3095:2013
            | Values ASSUMED — replace with on-track measurement
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={noiseComponentData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}`}
                label={{ value: 'Speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[50, 100]}
                label={{ value: 'SPL dB(A)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<NoiseTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              {/* TSI limits */}
              <ReferenceLine
                y={TSI_LIMIT_250}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: `TSI 250 km/h: ${TSI_LIMIT_250} dB(A)`, position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              <ReferenceLine
                y={TSI_LIMIT_300}
                stroke={C_ORANGE}
                strokeWidth={1}
                strokeDasharray="4 2"
                label={{ value: `TSI 300 km/h: ${TSI_LIMIT_300} dB(A)`, position: 'right', fontSize: 9, fill: C_ORANGE, fontFamily: 'DM Mono' }}
              />
              {/* Crossover speed */}
              <ReferenceLine
                x={crossoverSpeed}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: `Aero dominates`, position: 'top', fontSize: 9, fill: C_MUTED, fontFamily: 'DM Mono' }}
              />
              {/* Current speed marker */}
              <ReferenceLine
                x={params.speed_kmh}
                stroke={C_BLUE}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              <Line type="monotone" dataKey="rolling_dBA" name="Rolling noise"   stroke={C_BLUE}   strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              <Line type="monotone" dataKey="aero_dBA"    name="Aerodynamic noise" stroke={C_ORANGE} strokeWidth={1.5} strokeDasharray="5 3" dot={false} />
              <Line type="monotone" dataKey="total_dBA"   name="Total pass-by"   stroke={C_RED}    strokeWidth={2.5} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            ASSUMED — Thompson (2009) Railway Noise & Vibration | FW-H model | TSI EU 1304/2014
          </p>
        </div>

        {/* Right: Comparison across trains */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Total Pass-By Noise Comparison at 25 m
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            VB Chair vs B-28 target vs E5 Shinkansen | Same model, different reference parameters
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={comparisonData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}`}
                label={{ value: 'Speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[50, 100]}
                label={{ value: 'Total dB(A) at 25 m', angle: -90, position: 'insideLeft', offset: 12, fill: C_AXIS }}
              />
              <Tooltip content={<NoiseTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              <ReferenceLine
                y={TSI_LIMIT_250}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: `TSI ${TSI_LIMIT_250} dB(A)`, position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              <ReferenceLine
                x={params.speed_kmh}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
              />
              {TRAIN_NOISE_PARAMS.map(tp => (
                <Line
                  key={tp.label}
                  type="monotone"
                  dataKey={tp.label}
                  name={tp.label}
                  stroke={tp.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            ASSUMED — E5 reference: JR East Tech Report (2011) | VB: estimated from geometry
          </p>
        </div>
      </div>

      {/* ── Noise metrics cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Rolling Noise', value: `${currentRolling.toFixed(1)} dB(A)`, sub: `at ${params.speed_kmh} km/h — v³ model` },
          { label: 'Aero Noise', value: `${currentAero.toFixed(1)} dB(A)`, sub: `at ${params.speed_kmh} km/h — FW-H v⁶` },
          { label: 'Total Pass-By', value: `${currentTotal.toFixed(1)} dB(A)`, sub: 'at 25 m from track — EN ISO 3095' },
          { label: 'Dominant Source', value: currentAero >= currentRolling ? 'Aerodynamic' : 'Rolling', sub: `crossover ≈ ${crossoverSpeed} km/h` },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-[#D8DFEE] p-3 bg-white">
            <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">{m.label}</p>
            <p className="font-mono text-[20px] font-semibold text-[#003893] leading-tight mt-0.5">{m.value}</p>
            <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Sperling ride comfort info card ─────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] p-5">
        <div className="flex items-start gap-4">
          <div className="w-8 h-8 rounded-full bg-[#E8F0FB] flex items-center justify-center shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="#003893" strokeWidth="1.5"/>
              <path d="M8 5v4M8 11v1" stroke="#003893" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h3 className="text-[12px] font-mono font-semibold text-[#1A1D2E] mb-1">
              Sperling Ride Quality Index W<sub>z</sub>
            </h3>
            <p className="text-[11px] font-mono text-[#4A5068] leading-relaxed mb-2">
              Full Sperling W<sub>z</sub> requires on-board tri-axial accelerometer data (EN 12299:2009, UIC 513:2007).
              The W<sub>z</sub> table shown in the Dynamics tab uses published approximate values for this speed class.
              For certification purposes, field measurement of vertical and lateral acceleration RMS at bogie frame
              and car body is required per EN ISO 2631-1.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {[
                { wz: '1–2', label: 'Very comfortable', color: C_GREEN },
                { wz: '2–2.5', label: 'Comfortable', color: C_GREEN },
                { wz: '2.5–3.0', label: 'Acceptable', color: C_ORANGE },
                { wz: '3.0–3.5', label: 'Still acceptable', color: C_ORANGE },
                { wz: '3.5–4.0', label: 'Uncomfortable', color: C_RED },
                { wz: '>4.0', label: 'Very uncomfortable', color: C_RED },
              ].map(item => (
                <div key={item.wz} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="font-mono text-[10px] text-[#1A1D2E]">W<sub>z</sub> {item.wz}:</span>
                  <span className="font-mono text-[10px] text-[#8A91A8]">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-[#8A91A8] font-mono mt-3">
              Source: Sperling & Betzhold (1956) Glasers Annalen 80(10):314 | UIC 513:2007 Section 7
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
