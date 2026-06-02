'use client';

/**
 * TunnelTab.tsx — Tunnel Aerodynamics.
 *
 * Left:  AreaChart — Pressure (Pa) vs Time (s).
 *        From physicsResults.tunnel.pressure_array_Pa.
 *        EN14067 limit (6000 Pa in 4 s) shaded red above.
 * Right: LineChart — Nose length (3–15 m) vs max dp/dt (Pa/s).
 *        Current nose as red dot. EN14067 3000 Pa/s limit horizontal line.
 * Below: Blockage ratio table (VB vs MAHSR tunnel vs E5 vs N700S).
 *
 * Physics: tunnelPressureWave() from @/lib/physics/aerodynamics.
 */

import { useMemo } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer, ReferenceArea,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR, RTRI_CD_TABLE } from '@/lib/config';
import { tunnelPressureWave, cdFromNoseLength } from '@/lib/physics/aerodynamics';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';

// EN 14067-5:2020 pressure limits
const EN14067_DPDT_LIMIT   = 3000;   // Pa/s
const EN14067_DP4S_LIMIT   = 6000;   // Pa in 4 seconds window

// MAHSR Sagarmala tunnel
const MAHSR_TUNNEL_LEN  = MAHSR.tunnel_length_m;    // 21 000 m
const MAHSR_TUNNEL_AREA = MAHSR.tunnel_area_m2;      // 66.5 m²

// Blockage ratio reference data
// σ = A_train / A_tunnel
const BLOCKAGE_TABLE = [
  {
    system:      'VB Chair (BG 1676)',
    train_area:  VB_NOMINAL.car_width_m * VB_NOMINAL.car_height_m,
    tunnel_area: MAHSR_TUNNEL_AREA,
    ref_tunnel:  'MAHSR (66.5 m²)',
  },
  {
    system:      'E5 Shinkansen',
    train_area:  3.35 * 4.5,   // E5 frontal area m²
    tunnel_area: 64.0,         // Shinkansen tunnel m² — Source: JR East technical standard
    ref_tunnel:  'Shinkansen (64 m²)',
  },
  {
    system:      'N700S Shinkansen',
    train_area:  3.36 * 4.5,
    tunnel_area: 64.0,
    ref_tunnel:  'Shinkansen (64 m²)',
  },
  {
    system:      'TGV Duplex',
    train_area:  2.90 * 4.30,  // ASSUMED: TGV Duplex cross-section estimate
    tunnel_area: 56.0,          // ASSUMED: LGV tunnel cross-section
    ref_tunnel:  'LGV (56 m², ASSUMED)',
  },
  {
    system:      'ICE3 (DB)',
    train_area:  3.02 * 4.10,  // ASSUMED: ICE3 cross-section
    tunnel_area: 55.0,          // ASSUMED: NBS tunnel cross-section
    ref_tunnel:  'NBS (55 m², ASSUMED)',
  },
];

const NOSE_SWEEP = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Subsample helper
function subsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const step = Math.ceil(arr.length / n);
  return arr.filter((_, i) => i % step === 0);
}

// ── tooltips ────────────────────────────────────────────────────────────────────
function PressureTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">t = {Number(label).toFixed(2)} s</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? p.stroke }}>
          Pressure: <span className="font-semibold">{Math.round(p.value)} Pa</span>
        </p>
      ))}
    </div>
  );
}

function DpdtTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">Nose length: {Number(label).toFixed(1)} m</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          max dp/dt: <span className="font-semibold">{Math.round(p.value).toLocaleString()} Pa/s</span>
        </p>
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function TunnelTab() {
  const { results, params } = useSimulationStore();

  const v_ms    = params.speed_kmh / 3.6;
  const A_train = VB_NOMINAL.car_width_m * VB_NOMINAL.car_height_m;

  // ── Pressure vs time from results or fresh compute ─────────────────────────
  const pressureChartData = useMemo(() => {
    let time_s: number[];
    let pressure_Pa: number[];

    if (results?.tunnel?.time_array_s?.length && results.tunnel.pressure_array_Pa?.length) {
      time_s      = results.tunnel.time_array_s;
      pressure_Pa = results.tunnel.pressure_array_Pa;
    } else {
      // Compute fresh for current params (200 points for performance)
      const tw = tunnelPressureWave(
        MAHSR_TUNNEL_LEN, MAHSR_TUNNEL_AREA, A_train, v_ms, params.nose_length_m, 200
      );
      time_s      = tw.time_s;
      pressure_Pa = tw.pressure_Pa;
    }

    const raw = time_s.map((t, i) => ({ time_s: +t.toFixed(3), pressure_Pa: Math.round(pressure_Pa[i] ?? 0) }));
    return subsample(raw, 120);
  }, [results?.tunnel, params.speed_kmh, params.nose_length_m]);

  // Peak pressure and compliance from results or compute
  const tunnelSummary = useMemo(() => {
    if (results?.tunnel) return results.tunnel;
    const tw = tunnelPressureWave(MAHSR_TUNNEL_LEN, MAHSR_TUNNEL_AREA, A_train, v_ms, params.nose_length_m, 200);
    return {
      peak_pressure_Pa:  tw.peak_pressure_Pa,
      max_dpdt_Pa_per_s: tw.max_dpdt,
      en14067_compliant: tw.en14067_compliant,
    };
  }, [results?.tunnel, params.speed_kmh, params.nose_length_m]);

  // ── Nose sweep: max dp/dt vs nose length ──────────────────────────────────
  const noseDpdtData = useMemo(() => {
    return NOSE_SWEEP.map(nl => {
      const tw = tunnelPressureWave(MAHSR_TUNNEL_LEN, MAHSR_TUNNEL_AREA, A_train, v_ms, nl, 150);
      return {
        nose_m:   nl,
        max_dpdt: Math.round(tw.max_dpdt),
        _isCurrent: Math.abs(nl - params.nose_length_m) < 0.6,
      };
    });
  }, [v_ms, params.nose_length_m]);

  // Pressure chart upper bound for shading
  const maxPressureInChart = Math.max(...pressureChartData.map(d => Math.abs(d.pressure_Pa)));
  const shadeUpper = Math.max(EN14067_DP4S_LIMIT, maxPressureInChart * 1.2);

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Compliance banner ─────────────────────────────────────────────── */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
        tunnelSummary.en14067_compliant
          ? 'bg-[#F0FBF4] border-[#1B7A45]'
          : 'bg-[#FFF0F0] border-[#CE1726]'
      }`}>
        <div className={`w-2 h-2 rounded-full ${tunnelSummary.en14067_compliant ? 'bg-[#1B7A45]' : 'bg-[#CE1726]'}`} />
        <p className="text-[12px] font-mono text-[#1A1D2E]">
          Peak pressure: <span className="font-semibold">{Math.round(tunnelSummary.peak_pressure_Pa ?? 0).toLocaleString()} Pa</span>
          {' '}| max dp/dt: <span className="font-semibold">{Math.round(tunnelSummary.max_dpdt_Pa_per_s ?? 0).toLocaleString()} Pa/s</span>
          {' '}| EN14067-5 limit: {EN14067_DPDT_LIMIT.toLocaleString()} Pa/s —{' '}
          <span className={`font-semibold ${tunnelSummary.en14067_compliant ? 'text-[#1B7A45]' : 'text-[#CE1726]'}`}>
            {tunnelSummary.en14067_compliant ? 'Compliant' : 'Non-compliant'}
          </span>
        </p>
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: Pressure vs time */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Tunnel Pressure Wave — Pressure vs Time
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            MAHSR tunnel 21 km × 66.5 m² | {params.speed_kmh} km/h | 1D method of characteristics
            | EN14067-5:2020 §5.3
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={pressureChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="pressureGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={C_BLUE} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={C_BLUE} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="pressureRedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor={C_RED} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={C_RED} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="time_s"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}s`}
                label={{ value: 'Time (s)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v.toLocaleString()}`}
                label={{ value: 'Pressure (Pa)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<PressureTooltip />} />
              {/* EN14067 ΔP limit shade above 6000 Pa */}
              <ReferenceArea
                y1={EN14067_DP4S_LIMIT}
                y2={shadeUpper}
                fill={C_RED}
                fillOpacity={0.07}
              />
              <ReferenceLine
                y={EN14067_DP4S_LIMIT}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: `EN14067 6000 Pa`, position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              <ReferenceLine
                y={-EN14067_DP4S_LIMIT}
                stroke={C_RED}
                strokeWidth={1}
                strokeDasharray="4 2"
              />
              <Area
                type="monotone"
                dataKey="pressure_Pa"
                name="Pressure"
                stroke={C_BLUE}
                strokeWidth={2}
                fill="url(#pressureGradient)"
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — tunnel | Ogawa & Fujii (1997) Computers & Fluids 26(2):135–152
          </p>
        </div>

        {/* Right: Nose length vs max dp/dt */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Nose Length vs Peak dp/dt
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            MAHSR tunnel | {params.speed_kmh} km/h entry | Longer nose = shallower pressure gradient
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={noseDpdtData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="nose_m"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v}m`}
                label={{ value: 'Nose length (m)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v.toLocaleString()}`}
                label={{ value: 'max dp/dt (Pa/s)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<DpdtTooltip />} />
              <ReferenceLine
                y={EN14067_DPDT_LIMIT}
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: 'EN14067 limit 3000 Pa/s', position: 'right', fontSize: 9, fill: C_RED, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="max_dpdt"
                name="max dp/dt"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={(props: any) => {
                  if (props.payload._isCurrent) {
                    return <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={C_RED} stroke="white" strokeWidth={2} />;
                  }
                  return <circle key={props.index} cx={props.cx} cy={props.cy} r={2} fill={C_BLUE} />;
                }}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — tunnel | Howe et al. (2006) J. Fluid Mech. 538:231–255 | Red dot = current nose length
          </p>
        </div>
      </div>

      {/* ── Blockage ratio table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE]">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Train–Tunnel Blockage Ratio Comparison
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
            σ = A<sub>train</sub> / A<sub>tunnel</sub> — EN14067 validity: σ &lt; 0.20 for 1D method
            | Sources: MAHSR Design Standards, JR East Technical Report (2011), ASSUMED for TGV/ICE
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">System</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Train Area (m²)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Tunnel Area (m²)</th>
                <th className="px-4 py-2 text-right text-[#4A5068] font-medium">σ (Blockage)</th>
                <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Reference Tunnel</th>
                <th className="px-4 py-2 text-center text-[#4A5068] font-medium">EN14067 Valid</th>
              </tr>
            </thead>
            <tbody>
              {BLOCKAGE_TABLE.map((row, i) => {
                const sigma = row.train_area / row.tunnel_area;
                const valid = sigma < 0.20;
                const isVB  = row.system.startsWith('VB');
                return (
                  <tr key={row.system} className={`border-b border-[#D8DFEE] last:border-0 ${isVB ? 'bg-[#E8F0FB]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                    <td className="px-4 py-2 text-[#1A1D2E] flex items-center gap-2">
                      {isVB && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#003893]" />}
                      {!isVB && <span className="inline-block w-1.5 h-1.5" />}
                      {row.system}
                    </td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.train_area.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.tunnel_area.toFixed(1)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${sigma >= 0.20 ? 'text-[#CE1726]' : sigma >= 0.15 ? 'text-[#A05A00]' : 'text-[#1B7A45]'}`}>
                      {(sigma * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-[#8A91A8]">{row.ref_tunnel}</td>
                    <td className="px-4 py-2 text-center">
                      {valid ? (
                        <span className="text-[#1B7A45] font-semibold">Yes</span>
                      ) : (
                        <span className="text-[#CE1726] font-semibold">CFD required</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Key metrics ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Peak Pressure', value: `${Math.round(tunnelSummary.peak_pressure_Pa ?? 0).toLocaleString()} Pa`, sub: `EN14067 ΔP4s: ${EN14067_DP4S_LIMIT.toLocaleString()} Pa` },
          { label: 'Max dp/dt', value: `${Math.round(tunnelSummary.max_dpdt_Pa_per_s ?? 0).toLocaleString()} Pa/s`, sub: `EN14067 limit: ${EN14067_DPDT_LIMIT.toLocaleString()} Pa/s` },
          { label: 'Blockage Ratio σ', value: `${((A_train / MAHSR_TUNNEL_AREA) * 100).toFixed(1)}%`, sub: `${A_train.toFixed(2)} m² / ${MAHSR_TUNNEL_AREA} m²` },
          { label: 'EN14067 Status', value: tunnelSummary.en14067_compliant ? 'Compliant' : 'Non-compliant', sub: `at ${params.speed_kmh} km/h, nose ${params.nose_length_m} m` },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-[#D8DFEE] p-3 bg-white">
            <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">{m.label}</p>
            <p className={`font-mono text-[18px] font-semibold leading-tight mt-0.5 ${
              m.label === 'EN14067 Status'
                ? tunnelSummary.en14067_compliant ? 'text-[#1B7A45]' : 'text-[#CE1726]'
                : 'text-[#003893]'
            }`}>{m.value}</p>
            <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">{m.sub}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
