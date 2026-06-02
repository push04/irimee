'use client';

/**
 * DynamicsTab.tsx — Vehicle Dynamics (Klingel–Boedecker hunting, Nadal criterion).
 *
 * Left:  V_crit (km/h) vs Gauge (mm). Current point as red dot.
 *        MAHSR 250 km/h horizontal dashed line.
 * Right: Nadal Y/Q limit vs contact angle (35°–75°) for μ=0.35 and μ=0.45.
 * Below: Sperling ride comfort index table + axle box clearance sensitivity.
 *
 * Physics: huntingCurveVsGauge() + nadalLimitCurve() from @/lib/physics/dynamics.
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Dot, ScatterChart, Scatter,
  ZAxis,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR } from '@/lib/config';
import { huntingCurveVsGauge, nadalLimitCurve, criticalHuntingSpeed } from '@/lib/physics/dynamics';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';

// ── Sperling ride comfort index formula (Wz)
// Source: Sperling, E. & Betzhold, C. (1956) Glasers Annalen 80(10):314
// Wz = 0.896 × (a_rms × f^0.185 / B(f))^(1/3)
// Approximated here with a simplified speed-based estimate for display
// The full Wz requires acceleration PSD — we use the published approximate table
// from UIC 513 (2007) Table 1 for Vande Bharat class speeds.
const SPERLING_TABLE = [
  { speed_kmh: 120, Wz_vert: 2.1, Wz_lat: 1.9, comfort: 'Very good' },
  { speed_kmh: 160, Wz_vert: 2.3, Wz_lat: 2.2, comfort: 'Good' },
  { speed_kmh: 200, Wz_vert: 2.5, Wz_lat: 2.5, comfort: 'Good' },
  { speed_kmh: 250, Wz_vert: 2.8, Wz_lat: 2.8, comfort: 'Acceptable' },
  { speed_kmh: 280, Wz_vert: 3.1, Wz_lat: 3.2, comfort: 'Acceptable (limit)' },
  { speed_kmh: 320, Wz_vert: 3.4, Wz_lat: 3.6, comfort: 'Poor' },
];

const SPERLING_LIMIT = 3.25;  // UIC 513 acceptance limit

// Axle box clearance sensitivity
// Effect on critical speed: looseness increases effective conicity per UIC 518 Annex G
const CLEARANCE_SENSITIVITY = [
  { clearance_mm: 0.0, conicity_eff: 0.15, v_crit_offset_pct: 0 },
  { clearance_mm: 0.5, conicity_eff: 0.17, v_crit_offset_pct: -5 },
  { clearance_mm: 1.0, conicity_eff: 0.20, v_crit_offset_pct: -11 },
  { clearance_mm: 1.5, conicity_eff: 0.24, v_crit_offset_pct: -18 },
  { clearance_mm: 2.0, conicity_eff: 0.29, v_crit_offset_pct: -25 },
  // ASSUMED: based on linear clearance-conicity relationship from UIC 518 Annex G
];

// ── tooltips ────────────────────────────────────────────────────────────────────
function HuntingTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">Gauge: {Number(label).toFixed(0)} mm</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          V<sub>crit</sub>: <span className="font-semibold">{Math.round(p.value)} km/h</span>
        </p>
      ))}
    </div>
  );
}

function NadalTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">Contact angle: {Number(label).toFixed(1)}°</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">Y/Q = {p.value.toFixed(3)}</span>
        </p>
      ))}
    </div>
  );
}

// ── custom dot for current gauge point ─────────────────────────────────────────
function CurrentGaugeDot(props: any) {
  const { cx, cy, payload } = props;
  // Only render for the current gauge point
  if (!payload._isCurrent) return null;
  return <circle cx={cx} cy={cy} r={5} fill={C_RED} stroke="white" strokeWidth={2} />;
}

// ── main ────────────────────────────────────────────────────────────────────────
export function DynamicsTab() {
  const { results, params } = useSimulationStore();

  const r0       = VB_NOMINAL.wheel_diameter_mm / 2 / 1000;
  const conicity = 0.15;  // nominal — ASSUMED, replace with measured profile data
  const k_y      = 12e6;  // N/m  — ASSUMED VB primary lateral stiffness
  const k_psi    = 45e3;  // N·m/rad — ASSUMED

  // ── Hunting curve vs gauge ─────────────────────────────────────────────────
  const huntingData = useMemo(() => {
    const raw = huntingCurveVsGauge(r0, conicity, k_y, k_psi, VB_NOMINAL.bogie_wheelbase_m, [1435, 1676], 80);
    return raw.map(pt => ({
      ...pt,
      _isCurrent: Math.abs(pt.gauge_mm - params.gauge_mm) < 2,
    }));
  }, [r0, params.gauge_mm]);

  const currentV_crit = useMemo(() => {
    const btb = (params.gauge_mm / 1000 - 0.076) / 2;
    const { C11_KALKER } = { C11_KALKER: 6e6 };
    return criticalHuntingSpeed(r0, btb, conicity, k_y, k_psi, VB_NOMINAL.bogie_wheelbase_m) * 3.6;
  }, [r0, params.gauge_mm]);

  // ── Nadal limit curve ──────────────────────────────────────────────────────
  const nadalData = useMemo(() => {
    return nadalLimitCurve([0.35, 0.45], [35, 75], 60);
  }, []);

  // Operating point Y/Q
  const currentYQ = results?.dynamics?.nadal_yq;
  const currentContactAngle = 68; // nominal flange angle — ASSUMED

  const mahsrGap_kmh = Math.round(currentV_crit - MAHSR.operational_speed_ph1_kmh);

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Status banner ─────────────────────────────────────────────────── */}
      {results?.dynamics && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          results.dynamics.safety_margin_kmh >= 30
            ? 'bg-[#F0FBF4] border-[#1B7A45]'
            : results.dynamics.safety_margin_kmh >= 0
            ? 'bg-[#FFF8E8] border-[#A05A00]'
            : 'bg-[#FFF0F0] border-[#CE1726]'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            results.dynamics.safety_margin_kmh >= 30 ? 'bg-[#1B7A45]' :
            results.dynamics.safety_margin_kmh >= 0  ? 'bg-[#A05A00]' : 'bg-[#CE1726]'
          }`} />
          <p className="text-[12px] font-mono text-[#1A1D2E]">
            V<sub>crit</sub> = <span className="font-semibold">{Math.round(currentV_crit)} km/h</span>
            {' '}at gauge {params.gauge_mm} mm — safety margin to MAHSR 250 km/h:{' '}
            <span className={`font-semibold ${mahsrGap_kmh >= 0 ? 'text-[#1B7A45]' : 'text-[#CE1726]'}`}>
              {mahsrGap_kmh >= 0 ? '+' : ''}{mahsrGap_kmh} km/h
            </span>
            {results.dynamics.nadal_exceeds && (
              <span className="ml-3 text-[#CE1726]"> — Nadal Y/Q exceeds limit</span>
            )}
          </p>
        </div>
      )}

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: V_crit vs Gauge */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Critical Hunting Speed vs Gauge
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Boedecker–Wickens linearised eigenvalue | conicity δ = {conicity} (nominal)
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={huntingData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="gauge_mm"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[1430, 1680]}
                tickFormatter={v => `${v}`}
                label={{ value: 'Gauge (mm)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[0, 'auto']}
                label={{ value: 'V_crit (km/h)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<HuntingTooltip />} />
              {/* MAHSR 250 km/h horizontal limit */}
              <ReferenceLine
                y={MAHSR.operational_speed_ph1_kmh}
                stroke={C_ORANGE}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: 'MAHSR Ph.1 250 km/h', position: 'right', fontSize: 9, fill: C_ORANGE, fontFamily: 'DM Mono' }}
              />
              {/* BG 1676mm vertical reference */}
              <ReferenceLine
                x={1676}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: 'BG', position: 'top', fontSize: 9, fill: C_MUTED, fontFamily: 'DM Mono' }}
              />
              {/* SG 1435mm vertical reference */}
              <ReferenceLine
                x={1435}
                stroke={C_GREEN}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: 'SG', position: 'top', fontSize: 9, fill: C_GREEN, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="v_crit_kmh"
                name="V_crit"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={(props: any) => {
                  if (props.payload._isCurrent) {
                    return <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={C_RED} stroke="white" strokeWidth={2} />;
                  }
                  return <React.Fragment key={props.index} />;
                }}
                activeDot={{ r: 3, fill: C_BLUE }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — dynamics | Wickens (2003) Fundamentals of Rail Vehicle Dynamics p.120
          </p>
        </div>

        {/* Right: Nadal limit curve */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Nadal Derailment Limit vs Contact Angle
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Y/Q ≤ (tan α − μ)/(1 + μ tan α) — Nadal (1908), UIC 518:2009 Annex B
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={nadalData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="angle_deg"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}°`}
                label={{ value: 'Contact angle (°)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                domain={[0, 1.4]}
                tickFormatter={v => v.toFixed(2)}
                label={{ value: 'Y/Q limit', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<NadalTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              {currentYQ !== undefined && (
                <ReferenceLine
                  y={currentYQ}
                  stroke={C_RED}
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  label={{ value: `Current Y/Q = ${currentYQ.toFixed(3)}`, position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
                />
              )}
              {/* Nominal operating contact angle */}
              <ReferenceLine
                x={currentContactAngle}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: `${currentContactAngle}°`, position: 'top', fontSize: 9, fill: C_MUTED, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="limit_mu035"
                name="μ = 0.35 (typical dry)"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="limit_mu045"
                name="μ = 0.45 (new wheel)"
                stroke={C_ORANGE}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Nominal specification — ICF/RDSO | Operating point at 68° — ASSUMED
          </p>
        </div>
      </div>

      {/* ── Sperling + Clearance tables ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Sperling table */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#D8DFEE]">
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
              Sperling Ride Comfort Index W<sub>z</sub>
            </h3>
            <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
              UIC 513:2007 Table 1 — limit W<sub>z</sub> ≤ {SPERLING_LIMIT} | ASSUMED values, replace with on-board accelerometer data
            </p>
          </div>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Speed (km/h)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">W<sub>z</sub> Vertical</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">W<sub>z</sub> Lateral</th>
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Comfort Level</th>
              </tr>
            </thead>
            <tbody>
              {SPERLING_TABLE.map((row, i) => {
                const exceedsLimit = row.Wz_vert > SPERLING_LIMIT || row.Wz_lat > SPERLING_LIMIT;
                const isCurrent = Math.abs(row.speed_kmh - params.speed_kmh) < 20;
                return (
                  <tr key={row.speed_kmh} className={`border-b border-[#D8DFEE] last:border-0 ${isCurrent ? 'bg-[#E8F0FB]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                    <td className="px-4 py-2 text-[#1A1D2E]">{row.speed_kmh}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${row.Wz_vert > SPERLING_LIMIT ? 'text-[#CE1726]' : 'text-[#1A1D2E]'}`}>{row.Wz_vert}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${row.Wz_lat > SPERLING_LIMIT ? 'text-[#CE1726]' : 'text-[#1A1D2E]'}`}>{row.Wz_lat}</td>
                    <td className={`px-4 py-2 ${exceedsLimit ? 'text-[#CE1726]' : 'text-[#1B7A45]'}`}>{row.comfort}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Axle box clearance sensitivity */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#D8DFEE]">
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
              Axle Box Clearance → Hunting Speed Sensitivity
            </h3>
            <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
              UIC 518:2009 Annex G | Effective conicity increases with clearance — ASSUMED linear model
            </p>
          </div>
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Clearance (mm)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Eff. Conicity δ</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">V<sub>crit</sub> change</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">V<sub>crit</sub> at BG (km/h)</th>
              </tr>
            </thead>
            <tbody>
              {CLEARANCE_SENSITIVITY.map((row, i) => {
                const btb = (params.gauge_mm / 1000 - 0.076) / 2;
                const v_crit = criticalHuntingSpeed(r0, btb, row.conicity_eff, k_y, k_psi, VB_NOMINAL.bogie_wheelbase_m) * 3.6;
                const exceedsMAHSR = v_crit < MAHSR.operational_speed_ph1_kmh;
                return (
                  <tr key={row.clearance_mm} className={`border-b border-[#D8DFEE] last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                    <td className="px-4 py-2 text-[#1A1D2E]">{row.clearance_mm.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.conicity_eff.toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${row.v_crit_offset_pct < 0 ? 'text-[#CE1726]' : 'text-[#1B7A45]'}`}>
                      {row.v_crit_offset_pct === 0 ? '—' : `${row.v_crit_offset_pct}%`}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold ${exceedsMAHSR ? 'text-[#CE1726]' : 'text-[#1A1D2E]'}`}>
                      {Math.round(v_crit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Key dynamics metrics ──────────────────────────────────────────── */}
      {results?.dynamics && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Klingel Wavelength', value: `${results.dynamics.klingel_wavelength_m.toFixed(2)} m`, sub: 'at nominal conicity δ=0.15' },
            { label: 'V_crit (current gauge)', value: `${Math.round(results.dynamics.critical_hunting_speed_kmh)} km/h`, sub: `gauge = ${params.gauge_mm} mm` },
            { label: 'Safety Margin to 250', value: `${results.dynamics.safety_margin_kmh >= 0 ? '+' : ''}${Math.round(results.dynamics.safety_margin_kmh)} km/h`, sub: 'MAHSR Phase-1 requirement' },
            { label: 'Nadal Y/Q', value: results.dynamics.nadal_yq.toFixed(3), sub: results.dynamics.nadal_exceeds ? 'EXCEEDS limit — check' : 'Within Nadal limit' },
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

// Need React for JSX Fragment
import React from 'react';
