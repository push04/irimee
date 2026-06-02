'use client';

/**
 * TractionTab.tsx — Traction & Power.
 *
 * Left:  TE-V diagram — TE curve (blue) + resistance curve (red).
 *        Intersection = max speed. MAHSR 250 km/h vertical line.
 * Right: Horizontal BarChart — Energy kWh/seat-km comparison across trains.
 * Below: Motor upgrade sensitivity table (210/250/300/350 kW →
 *        max speed, power at 250 km/h, MAHSR pass/fail).
 *
 * Physics: tevDiagram() + tractiveEffort() + maximumSpeed() + powerBudget()
 * from @/lib/physics/traction.
 */

import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Cell,
  LabelList,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR } from '@/lib/config';
import { tevDiagram, maximumSpeed, baseSpeed, tractiveEffort } from '@/lib/physics/traction';
import { davisResistance } from '@/lib/physics/aerodynamics';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';

// ── Energy efficiency comparison
// kWh per seat-km at operating speed — published/approximate values
// Sources: JR East E5 technical report (2011), N700S spec sheet (JR Central 2020),
//          UIC Leaflet 930-R (2012) for TGV/ICE, VB from RDSO estimates
// ASSUMED: VB at 160 km/h — 0.048 kWh/seat-km (rough estimate from installed power/capacity)
const ENERGY_COMPARISON = [
  { train: 'VB Chair 160', kwh_per_seat_km: 0.048, color: C_ORANGE },
  { train: 'VB Sleeper 160', kwh_per_seat_km: 0.052, color: C_ORANGE },
  { train: 'B-28 Target 250', kwh_per_seat_km: 0.038, color: '#5C8CE3' },
  { train: 'E5 320 km/h', kwh_per_seat_km: 0.033, color: C_BLUE },
  { train: 'N700S 285 km/h', kwh_per_seat_km: 0.030, color: '#002B74' },
  { train: 'TGV Duplex', kwh_per_seat_km: 0.028, color: '#9FBCEF' },
  { train: 'ICE3 300 km/h', kwh_per_seat_km: 0.036, color: C_MUTED },
];
// ASSUMED: All energy values are approximate — replace with traction energy model when available

// ── motor upgrade sensitivity rows ─────────────────────────────────────────────
const MOTOR_POWERS_KW = [210, 250, 300, 350];

// ── tooltips ───────────────────────────────────────────────────────────────────
function TEVTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">{Number(label).toFixed(1)} km/h</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value.toFixed(2)} kN</span>
        </p>
      ))}
    </div>
  );
}

function EnergyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg p-3 shadow-panel text-[11px] font-mono">
      <p className="text-[#4A5068] mb-1">{payload[0]?.payload?.train}</p>
      <p style={{ color: payload[0]?.fill }}>
        Energy: <span className="font-semibold">{payload[0]?.value?.toFixed(3)} kWh/seat-km</span>
      </p>
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function TractionTab() {
  const { results, params } = useSimulationStore();

  const A = results?.aero?.davis_A ?? VB_NOMINAL.davis_A;
  const B = results?.aero?.davis_B ?? VB_NOMINAL.davis_B;
  const C = results?.aero?.davis_C ?? VB_NOMINAL.davis_C;

  const v_base_ms = useMemo(() =>
    baseSpeed(50, 1500, 4.316, VB_NOMINAL.wheel_diameter_mm / 1000),
    []
  );

  // ── TE-V diagram data ──────────────────────────────────────────────────────
  const tevData = useMemo(() => {
    return tevDiagram({
      motor_rated_power_kW: params.motor_power_kw,
      n_powered_axles:      VB_NOMINAL.n_powered_axles,
      drivetrain_eff:       0.89,
      base_speed_ms:        v_base_ms,
      A, B, C,
      max_speed_kmh: 340,
      n_points: 200,
    });
  }, [params.motor_power_kw, A, B, C, v_base_ms]);

  // Max speed from results or compute
  const maxSpeedKmh = results?.traction?.max_speed_kmh ?? maximumSpeed({
    motor_rated_power_kW: params.motor_power_kw,
    n_powered_axles:      VB_NOMINAL.n_powered_axles,
    drivetrain_eff:       0.89,
    base_speed_ms:        v_base_ms,
    A, B, C,
    aux_power_kW: 150,
  });

  const baseSpeedKmh = results?.traction?.base_speed_kmh ?? (v_base_ms * 3.6);

  // ── Motor sensitivity table ────────────────────────────────────────────────
  const motorSensitivity = useMemo(() => {
    return MOTOR_POWERS_KW.map(kw => {
      const vmax = maximumSpeed({
        motor_rated_power_kW: kw,
        n_powered_axles:      VB_NOMINAL.n_powered_axles,
        drivetrain_eff:       0.89,
        base_speed_ms:        v_base_ms,
        A, B, C,
        aux_power_kW: 150,
      });
      const v_ms_250 = MAHSR.operational_speed_ph1_kmh / 3.6;
      const te_at_250 = tractiveEffort(v_ms_250, kw * VB_NOMINAL.n_powered_axles * 1000, 0.89, v_base_ms) / 1000;
      const r_at_250  = davisResistance(MAHSR.operational_speed_ph1_kmh, A, B, C) / 1000;
      const power_at_250_kW = Math.round(te_at_250 * v_ms_250);
      const meets = vmax >= MAHSR.operational_speed_ph1_kmh;
      return { kw, vmax_kmh: Math.round(vmax), power_at_250_kW, te_at_250_kN: te_at_250.toFixed(1), r_at_250_kN: r_at_250.toFixed(1), meets };
    });
  }, [A, B, C, v_base_ms]);

  const installedPower_kW = params.motor_power_kw * VB_NOMINAL.n_powered_axles;
  const powerBudgetResult = results?.traction?.power_budget;

  return (
    <div className="flex flex-col gap-6 p-6 font-sans">

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Left: TE-V diagram */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Tractive Effort — Speed Diagram
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            Constant torque below V<sub>base</sub> = {baseSpeedKmh.toFixed(1)} km/h — constant power above
            | {params.motor_power_kw} kW × {VB_NOMINAL.n_powered_axles} axles = {installedPower_kW.toLocaleString()} kW
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={tevData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} />
              <XAxis
                dataKey="speed_kmh"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${Math.round(v)}`}
                domain={[0, 340]}
                label={{ value: 'Speed (km/h)', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => `${v.toFixed(0)}`}
                domain={[0, 'auto']}
                label={{ value: 'Force (kN)', angle: -90, position: 'insideLeft', offset: 12, fontSize: 10, fill: C_AXIS }}
              />
              <Tooltip content={<TEVTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(value) => <span style={{ color: C_AXIS }}>{value}</span>}
              />
              {/* MAHSR 250 km/h vertical */}
              <ReferenceLine
                x={MAHSR.operational_speed_ph1_kmh}
                stroke={C_ORANGE}
                strokeWidth={1.5}
                strokeDasharray="6 3"
                label={{ value: 'MAHSR 250', position: 'top', fontSize: 9, fill: C_ORANGE, fontFamily: 'DM Mono' }}
              />
              {/* Max speed vertical */}
              {maxSpeedKmh > 0 && (
                <ReferenceLine
                  x={maxSpeedKmh}
                  stroke={C_GREEN}
                  strokeWidth={1.5}
                  strokeDasharray="4 2"
                  label={{ value: `V_max ${Math.round(maxSpeedKmh)}`, position: 'top', fontSize: 9, fill: C_GREEN, fontFamily: 'DM Mono' }}
                />
              )}
              {/* V_base vertical */}
              <ReferenceLine
                x={baseSpeedKmh}
                stroke={C_MUTED}
                strokeWidth={1}
                strokeDasharray="3 2"
                label={{ value: `V_base`, position: 'insideTopLeft', fontSize: 9, fill: C_MUTED, fontFamily: 'DM Mono' }}
              />
              <Line
                type="monotone"
                dataKey="te_kN"
                name="Tractive effort"
                stroke={C_BLUE}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="resistance_kN"
                name="Running resistance"
                stroke={C_RED}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            Computed — traction | Iwnicki (2006) ch.4 | Rochard & Schmid (2000) IMechE Part F
          </p>
        </div>

        {/* Right: Energy comparison horizontal bar chart */}
        <div className="rounded-xl border border-[#D8DFEE] p-4 bg-white">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Energy Efficiency Comparison
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mb-3">
            kWh per seat-km at operational speed — lower is better
            | ASSUMED values — replace with traction energy model
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={ENERGY_COMPARISON}
              layout="vertical"
              margin={{ top: 4, right: 50, left: 90, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                tickFormatter={v => v.toFixed(3)}
                domain={[0, 0.06]}
                label={{ value: 'kWh/seat-km', position: 'insideBottom', offset: -2, fontSize: 10, fill: C_AXIS }}
              />
              <YAxis
                type="category"
                dataKey="train"
                tick={{ fontSize: 9, fontFamily: 'DM Mono', fill: C_AXIS }}
                width={85}
              />
              <Tooltip content={<EnergyTooltip />} />
              <Bar dataKey="kwh_per_seat_km" radius={[0, 4, 4, 0]}>
                {ENERGY_COMPARISON.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
                <LabelList
                  dataKey="kwh_per_seat_km"
                  position="right"
                  formatter={(v: number) => v.toFixed(3)}
                  style={{ fontSize: 9, fontFamily: 'DM Mono', fill: C_AXIS }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[9px] text-[#8A91A8] font-mono mt-1">
            ASSUMED — approximate values | E5: JR East Tech Report (2011) | VB: RDSO estimate
          </p>
        </div>
      </div>

      {/* ── Power budget strip ─────────────────────────────────────────────── */}
      {powerBudgetResult && (
        <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] p-4">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-3">
            Power Budget at {params.speed_kmh} km/h
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: 'Traction', value: powerBudgetResult.traction_kW, color: C_BLUE },
              { label: 'Gradient', value: powerBudgetResult.gradient_kW, color: C_ORANGE },
              { label: 'Curve resistance', value: powerBudgetResult.curve_kW, color: '#5C8CE3' },
              { label: 'Auxiliary', value: powerBudgetResult.aux_kW, color: C_MUTED },
              { label: 'Total', value: powerBudgetResult.total_kW, color: C_GREEN },
            ].map(item => (
              <div key={item.label} className="bg-white rounded-lg border border-[#D8DFEE] p-3">
                <div className="h-0.5 rounded mb-2" style={{ backgroundColor: item.color }} />
                <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">{item.label}</p>
                <p className="font-mono text-[18px] font-semibold leading-tight mt-0.5" style={{ color: item.color }}>
                  {Math.round(item.value).toLocaleString()}
                  <span className="text-[11px] text-[#8A91A8] ml-1">kW</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Motor upgrade sensitivity table ────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE]">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Motor Power Upgrade Sensitivity
          </h3>
          <p className="text-[10px] text-[#8A91A8] font-mono mt-0.5">
            MAHSR Phase-1 = 250 km/h | η = 0.89 drivetrain | {VB_NOMINAL.n_powered_axles} powered axles
          </p>
        </div>
        <table className="w-full text-[11px] font-mono">
          <thead>
            <tr className="bg-[#F7F9FD] border-b border-[#D8DFEE]">
              <th className="px-4 py-2 text-left text-[#4A5068] font-medium">Motor Power (kW/axle)</th>
              <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Installed Power (kW)</th>
              <th className="px-4 py-2 text-right text-[#4A5068] font-medium">Max Speed (km/h)</th>
              <th className="px-4 py-2 text-right text-[#4A5068] font-medium">TE at 250 (kN)</th>
              <th className="px-4 py-2 text-center text-[#4A5068] font-medium">MAHSR 250 km/h</th>
            </tr>
          </thead>
          <tbody>
            {motorSensitivity.map((row, i) => {
              const isCurrent = row.kw === params.motor_power_kw;
              return (
                <tr key={row.kw} className={`border-b border-[#D8DFEE] last:border-0 ${isCurrent ? 'bg-[#E8F0FB]' : i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}>
                  <td className="px-4 py-2 text-[#1A1D2E] flex items-center gap-2">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-[#003893]' : 'invisible'}`} />
                    {row.kw} kW
                  </td>
                  <td className="px-4 py-2 text-right text-[#1A1D2E]">{(row.kw * VB_NOMINAL.n_powered_axles).toLocaleString()}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${row.vmax_kmh >= 250 ? 'text-[#1B7A45]' : 'text-[#CE1726]'}`}>
                    {row.vmax_kmh}
                  </td>
                  <td className="px-4 py-2 text-right text-[#1A1D2E]">{row.te_at_250_kN}</td>
                  <td className="px-4 py-2 text-center">
                    {row.meets ? (
                      <span className="inline-flex items-center gap-1 text-[#1B7A45] font-semibold">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="#1B7A45" strokeWidth="1"/><path d="M3 6l2 2 4-4" stroke="#1B7A45" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Pass
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#CE1726] font-semibold">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5.5" stroke="#CE1726" strokeWidth="1"/><path d="M4 4l4 4M8 4l-4 4" stroke="#CE1726" strokeWidth="1.5" strokeLinecap="round"/></svg>
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
  );
}
