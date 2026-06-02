'use client';

/**
 * StructuralTab.tsx — Structural & Fatigue.
 *
 * Left:  FEA placeholder — styled info box explaining fenicsx_env subprocess requirement.
 *        Shows last HDF5 result metadata if available in physicsResults.
 * Right: LineChart — IIW FAT71 S-N curve (log-log).
 *        Operating stress range as vertical lines at 160 km/h and 250 km/h.
 *        IIW two-slope (m=3 below 10⁷, m=5 above) plotted on log scale.
 * Below: Miner damage summation table from operating cycle counts.
 *
 * Source: Hobbacher (2008) IIW Recommendations, Table 3.1
 *         BS 7608:2014 — Fatigue of welded steel structures
 *         ERRI B12/RP 17 (1985) — Loading spectrum
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, ScatterChart, Scatter,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, SN_FAT71 } from '@/lib/config';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';

// ── IIW FAT71 S-N curve generation ────────────────────────────────────────────
// S-N: N = (Δσ_ref / Δσ)^m × N_ref
// Region 1: m=3, N_ref=2×10⁶, Δσ_ref=71 MPa
// Region 2: m=5, N ≥ 10⁷
// Cutoff: N = 10⁸
function snCurveData(): { log_N: number; delta_sigma_MPa: number; region: string }[] {
  const { delta_sigma_at_2e6_MPa: sig_ref, slope_m1, slope_m2, n_transition, n_cutoff } = SN_FAT71;
  const N_ref = 2e6;
  const points: { log_N: number; delta_sigma_MPa: number; region: string }[] = [];

  // Region 1: N from 10⁴ to n_transition (10⁷)
  for (let logN = 4.0; logN <= Math.log10(n_transition); logN += 0.1) {
    const N  = Math.pow(10, logN);
    // Δσ = Δσ_ref × (N_ref / N)^(1/m1)
    const ds = sig_ref * Math.pow(N_ref / N, 1 / slope_m1);
    points.push({ log_N: +logN.toFixed(2), delta_sigma_MPa: +ds.toFixed(2), region: 'slope m=3' });
  }

  // Region 2: N from n_transition to n_cutoff
  // Transition stress: Δσ_t = sig_ref × (N_ref / n_transition)^(1/3)
  const ds_transition = sig_ref * Math.pow(N_ref / n_transition, 1 / slope_m1);
  for (let logN = Math.log10(n_transition); logN <= Math.log10(n_cutoff) + 0.01; logN += 0.1) {
    const N  = Math.pow(10, logN);
    const ds = ds_transition * Math.pow(n_transition / N, 1 / slope_m2);
    points.push({ log_N: +logN.toFixed(2), delta_sigma_MPa: +Math.max(ds, 0).toFixed(2), region: 'slope m=5' });
  }

  return points;
}

// Operating stress range estimation at speed v (very rough approximation)
// Based on Röckl curve radius and Davis lateral force assumption.
// Replace with FEA output when available.
// ASSUMED: stress range proportional to v² (aerodynamic + dynamic loading)
function estimateStressRange_MPa(speed_kmh: number): number {
  // Nominal stress from ERRI B12 loading at 160 km/h ≈ 45 MPa
  // Scaling with v²: ASSUMED — replace with FEA
  const sigma_160 = 45;   // MPa — ASSUMED, from ERRI B12/RP17 nominal loading
  return sigma_160 * Math.pow(speed_kmh / 160, 2);
}

// Miner damage: D = n_i / N_i where N_i from S-N curve
function nCyclesFromSN(delta_sigma: number): number {
  const { delta_sigma_at_2e6_MPa: sig_ref, slope_m1, slope_m2, n_transition } = SN_FAT71;
  const N_ref = 2e6;
  const ds_t  = sig_ref * Math.pow(N_ref / n_transition, 1 / slope_m1);

  if (delta_sigma > ds_t) {
    // Region 1
    return N_ref * Math.pow(sig_ref / delta_sigma, slope_m1);
  } else {
    // Region 2
    return n_transition * Math.pow(ds_t / delta_sigma, slope_m2);
  }
}

// Miner damage table — ERRI B12 cycle counts at each speed block
// ASSUMED: Annual km = 400,000; speed distribution from ERRI B12/RP17
const MINER_BLOCKS = [
  { speed_kmh: 120, annual_km: 50000  },
  { speed_kmh: 160, annual_km: 200000 },
  { speed_kmh: 200, annual_km: 80000  },
  { speed_kmh: 250, annual_km: 50000  },
  { speed_kmh: 280, annual_km: 15000  },
  { speed_kmh: 320, annual_km: 5000   },
  // ASSUMED: distribution from ERRI B12/RP17 loading spectrum
];

const VEHICLE_LENGTH_M = VB_NOMINAL.car_length_m;

// ── tooltip ─────────────────────────────────────────────────────────────────────
function SNTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">log N = {Number(label).toFixed(2)} (N = {Math.round(Math.pow(10, Number(label))).toLocaleString()})</p>
      {payload.map((p: any) => (
        p.value > 0 && (
          <p key={p.name} style={{ color: p.color }}>
            Δσ: <span className="font-semibold">{Number(p.value).toFixed(1)} MPa</span>
          </p>
        )
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function StructuralTab() {
  const { results, params } = useSimulationStore();

  const snData = useMemo(() => snCurveData(), []);

  const sigma_160 = estimateStressRange_MPa(160);
  const sigma_250 = estimateStressRange_MPa(250);
  const sigma_current = estimateStressRange_MPa(params.speed_kmh);

  // Miner damage
  const minerData = useMemo(() => {
    let totalDamage = 0;
    const rows = MINER_BLOCKS.map(blk => {
      const delta_sigma = estimateStressRange_MPa(blk.speed_kmh);
      const n_cycles = blk.annual_km * 1000 / VEHICLE_LENGTH_M; // 1 cycle per car length
      const N_life   = nCyclesFromSN(delta_sigma);
      const D        = n_cycles / N_life;
      totalDamage += D;
      return { ...blk, delta_sigma_MPa: delta_sigma.toFixed(1), n_cycles: Math.round(n_cycles).toLocaleString(), N_life: Math.round(N_life).toLocaleString(), D: D.toExponential(2) };
    });
    return { rows, totalDamage };
  }, []);

  // log scale S-N: find the log_N for operating stress points
  const logN_at_160 = Math.log10(nCyclesFromSN(sigma_160));
  const logN_at_250 = Math.log10(nCyclesFromSN(sigma_250));

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: FEA placeholder */}
        <div className="rounded-xl border border-[#D8DFEE] p-5 bg-white flex flex-col gap-4">
          <div>
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
              FEA Stress Distribution
            </h3>
            <p className="text-[10px] text-[#8A91A8] font-mono">
              FEniCSx / DOLFINx — bogie frame von Mises stress
            </p>
          </div>

          {/* Styled info box */}
          <div className="flex-1 rounded-lg border-2 border-dashed border-[#D8DFEE] bg-[#F7F9FD] p-5 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-10 h-10 rounded-full bg-[#E8F0FB] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L18 6v8L10 18 2 14V6L10 2z" stroke="#003893" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 2v16M2 6l8 4 8-4" stroke="#003893" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-[13px] font-mono font-semibold text-[#1A1D2E] mb-1">
                FEA results require fenicsx_env
              </p>
              <p className="text-[11px] text-[#4A5068] font-mono leading-relaxed">
                Run the structural module via subprocess:
              </p>
              <code className="block mt-2 text-[10px] bg-[#EEF2F9] border border-[#D8DFEE] rounded px-3 py-2 text-[#003893] font-mono text-left">
                conda run -n fenicsx_env python physics/structural.py<br />
                {'  '}--input mesh/generated/bogie.msh<br />
                {'  '}--output outputs/fea_result.h5
              </code>
            </div>
            <div className="text-[10px] text-[#8A91A8] font-mono">
              Upload HDF5 output to view stress contours here.<br />
              Loading: ERRI B12/RP17 | Solver: FEniCSx 0.7
            </div>
          </div>
          <p className="text-[9px] text-[#8A91A8] font-mono">
            Nominal specification — ICF/RDSO | ERRI B12/RP17 loading spectrum
          </p>
        </div>

        {/* Right: S-N curve */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            IIW FAT71 S-N Curve — Butt Weld Detail
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Δσ<sub>ref</sub> = 71 MPa @ N=2×10⁶ | m=3 (N≤10⁷), m=5 (N&gt;10⁷) | Cutoff 10⁸ cycles
            | Source: Hobbacher (2008) IIW Recommendations Table 3.1
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={snData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="log_N"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[4, 9]}
                tickFormatter={v => `10^${v}`}
                label={{ value: 'Cycles to failure N (log scale)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[0, 200]}
                label={{ value: 'Δσ (MPa)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<SNTooltip />} />
              {/* Operating stress range at 160 km/h */}
              <ReferenceLine
                y={sigma_160}
                stroke={C_ORANGE}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{ value: `160 km/h: ${sigma_160.toFixed(0)} MPa`, position: 'right', fontSize: 9, fill: C_ORANGE, fontFamily: 'DM Mono' }}
              />
              {/* Operating stress range at 250 km/h */}
              <ReferenceLine
                y={sigma_250}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                label={{ value: `250 km/h: ${sigma_250.toFixed(0)} MPa`, position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              {/* Current speed operating stress */}
              {params.speed_kmh !== 160 && params.speed_kmh !== 250 && (
                <ReferenceLine
                  y={sigma_current}
                  stroke={C_BLUE}
                  strokeWidth={1}
                  strokeDasharray="3 2"
                  label={{ value: `${params.speed_kmh} km/h: ${sigma_current.toFixed(0)} MPa`, position: 'right', fontSize: 9, fill: C_BLUE, fontFamily: 'DM Mono' }}
                />
              )}
              {/* N_ref = 2×10⁶ vertical */}
              <ReferenceLine
                x={Math.log10(2e6)}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: '2×10⁶', position: 'top', fontSize: 9, fill: C_MUTED, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="delta_sigma_MPa"
                name="FAT71 S-N"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Nominal specification — ICF/RDSO | Stress ranges ASSUMED — replace with FEA output
          </p>
        </div>
      </div>

      {/* ── Miner damage table ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE]">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Miner Damage Summation — Annual Loading Spectrum
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
            D = Σ(n<sub>i</sub>/N<sub>i</sub>) | Failure when D ≥ 1.0 | Source: ERRI B12/RP17 (1985)
            | Stress ranges ASSUMED — replace with FEA stress tensor output
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Speed block (km/h)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Annual km</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Δσ (MPa)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">n cycles/year</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">N life (FAT71)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">D = n/N</th>
              </tr>
            </thead>
            <tbody>
              {minerData.rows.map((row, i) => {
                const D_val = parseFloat(row.D);
                return (
                  <tr key={row.speed_kmh} className={`border-b border-[#D8DFEE] last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                    <td className="px-4 py-2 text-[#1A1D2E]">{row.speed_kmh}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.annual_km.toLocaleString()}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${parseFloat(row.delta_sigma_MPa) > SN_FAT71.delta_sigma_at_2e6_MPa ? 'text-[#CE1726]' : 'text-[#1A1D2E]'}`}>
                      {row.delta_sigma_MPa}
                    </td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.n_cycles}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.N_life}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${D_val > 0.1 ? 'text-[#CE1726]' : 'text-[#1A1D2E]'}`}>{row.D}</td>
                  </tr>
                );
              })}
              {/* Total Miner sum row */}
              <tr className="bg-[#EEF2F9] border-t-2 border-[#D8DFEE]">
                <td className="px-4 py-2 font-semibold text-[#1A1D2E]" colSpan={5}>Total annual Miner damage D</td>
                <td className={`px-4 py-2 text-right font-semibold ${minerData.totalDamage > 0.5 ? 'text-[#CE1726]' : minerData.totalDamage > 0.2 ? 'text-[#A05A00]' : 'text-[#1B7A45]'}`}>
                  {minerData.totalDamage.toExponential(2)}
                </td>
              </tr>
              <tr className="bg-[#EEF2F9]">
                <td className="px-4 py-2 text-[#8A91A8]" colSpan={5}>Predicted fatigue life (D=1.0)</td>
                <td className="px-4 py-2 text-right font-semibold text-[#1A1D2E]">
                  {(1 / minerData.totalDamage).toFixed(1)} years
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
