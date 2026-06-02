'use client';

/**
 * OverviewTab.tsx — Aggregate health dashboard across all physics domains.
 *
 * Layout:
 *   Row 1: 5 domain KPI cards (Aero, Dynamics, Braking, Traction, Tunnel)
 *   Row 2: Left — MAHSR readiness radar + composite score gauge
 *          Right — Field data completeness + inspection metadata
 *   Row 3: Cross-domain comparison table (VB Chair vs B-28 target vs E5)
 *
 * All values flow from Zustand — no local computation beyond display formatting.
 * When results are null, each card shows a "Run simulation" prompt.
 */

import { useMemo } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { MAHSR, VB_NOMINAL } from '@/lib/config';

// ── colour tokens ──────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_AMBER  = '#A05A00';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';
const C_BG     = '#F7F9FD';

// ── helper: status colour from 0–100 score ────────────────────────────────────
function scoreColor(score: number): string {
  if (score >= 75) return C_GREEN;
  if (score >= 50) return C_AMBER;
  return C_RED;
}

function scoreBg(score: number): string {
  if (score >= 75) return '#F0FBF4';
  if (score >= 50) return '#FFF8E8';
  return '#FFF0F0';
}

function scoreBorder(score: number): string {
  if (score >= 75) return '#1B7A45';
  if (score >= 50) return '#A05A00';
  return '#CE1726';
}

function scoreLabel(score: number): string {
  if (score >= 85) return 'Compliant';
  if (score >= 70) return 'Near-compliant';
  if (score >= 50) return 'Partially compliant';
  return 'Non-compliant';
}

// ── Domain KPI card ────────────────────────────────────────────────────────────

interface DomainCard {
  domain:    string;
  score:     number | null;
  primary:   string;
  unit:      string;
  secondary: string;
  target:    string;
  source:    string;
}

function KPICard({ card }: { card: DomainCard }) {
  const noData = card.score === null;
  const bg     = noData ? '#FAFBFD' : scoreBg(card.score!);
  const border = noData ? '#D8DFEE' : scoreBorder(card.score!);
  const color  = noData ? C_MUTED   : scoreColor(card.score!);

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-2"
      style={{ background: bg, borderColor: border }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
          {card.domain}
        </span>
        {!noData && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded-full"
            style={{ color, background: bg, border: `1px solid ${border}` }}
          >
            {scoreLabel(card.score!)}
          </span>
        )}
      </div>

      {noData ? (
        <p className="font-mono text-[11px] text-[#8A91A8]">Run simulation</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-[22px] font-bold leading-none" style={{ color }}>
              {card.primary}
            </span>
            <span className="font-mono text-[11px] text-[#8A91A8]">{card.unit}</span>
          </div>
          <p className="font-mono text-[10px] text-[#4A5068]">{card.secondary}</p>
        </>
      )}

      <div className="mt-auto pt-1 border-t border-[#D8DFEE]">
        <p className="font-mono text-[9px] text-[#8A91A8]">
          Target: {card.target}
        </p>
        <p className="font-mono text-[8px] text-[#8A91A8] mt-0.5">{card.source}</p>
      </div>
    </div>
  );
}

// ── Radar tooltip ──────────────────────────────────────────────────────────────

function RadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg px-3 py-2 shadow text-[11px] font-mono">
      <p className="text-[#4A5068]">{d.domain}</p>
      <p className="font-semibold" style={{ color: scoreColor(d.score) }}>
        {d.score.toFixed(0)} / 100
      </p>
    </div>
  );
}

// ── Cross-domain comparison table ──────────────────────────────────────────────

const COMPARISON_ROWS = [
  {
    metric: 'Gauge (mm)',
    vb: '1676 (BG)',
    b28: '1435 (SG)',
    e5: '1435 (SG)',
    mahsr_req: '1435 (SG)',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'NHSRCL Civil Works Spec Rev.3',
  },
  {
    metric: 'Max Design Speed (km/h)',
    vb: '180',
    b28: '280',
    e5: '320',
    mahsr_req: '≥ 250 (Ph.1)',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'NHSRCL Traction & Rolling Stock Spec §4.2',
  },
  {
    metric: 'Nose Length (m)',
    vb: '3.5',
    b28: '10',
    e5: '15',
    mahsr_req: '≥ 7 recommended',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'RTRI Quarterly Vol.45 No.2 (2004) — Nishimura',
  },
  {
    metric: 'Drag Coefficient Cd',
    vb: '0.30',
    b28: '0.21',
    e5: '0.14',
    mahsr_req: '≤ 0.20 (Ph.2)',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'RTRI Cd–nose length correlation',
  },
  {
    metric: 'Disc Type',
    vb: 'Grey cast iron',
    b28: 'Composite',
    e5: 'Composite',
    mahsr_req: 'Composite / Carbon-ceramic',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'UIC 541-3 §6, MAHSR Rolling Stock Spec §9.4',
  },
  {
    metric: 'Pass-By Noise @ 250 km/h',
    vb: '~80 dB(A) est.',
    b28: '~76 dB(A) est.',
    e5: '~77 dB(A)',
    mahsr_req: '≤ 80 dB(A) (TSI)',
    vb_ok: true, b28_ok: true, e5_ok: true,
    source: 'TSI Noise EU 1304/2014 Table B.3 | JR East E5 Tech Report (2011)',
  },
  {
    metric: 'Hunting Critical Speed (km/h)',
    vb: '~200',
    b28: '~280',
    e5: '≥ 320',
    mahsr_req: '> 300 (margin req.)',
    vb_ok: false, b28_ok: true, e5_ok: true,
    source: 'Klingel–Boedecker formula, UIC 518',
  },
  {
    metric: 'EN14067-5 Tunnel dp/dt',
    vb: 'N/A at 180',
    b28: '~2400 Pa/s',
    e5: '~1800 Pa/s',
    mahsr_req: '≤ 3000 Pa/s',
    vb_ok: null, b28_ok: true, e5_ok: true,
    source: 'EN 14067-5:2006 | MAHSR Tunnel Spec §7.3',
  },
];

// ── main ────────────────────────────────────────────────────────────────────────

export function OverviewTab() {
  const { results, mahsrScore, params, fieldData, fieldDataCompleteness } =
    useSimulationStore();

  // Build domain KPI cards from results
  const cards: DomainCard[] = useMemo(() => [
    {
      domain:    'Aerodynamics',
      score:     results?.aero
        ? Math.min(100, Math.max(0, (0.32 - (results.aero.Cd ?? 0.32)) / (0.32 - 0.14) * 100))
        : null,
      primary:   results?.aero ? results.aero.Cd.toFixed(3) : '—',
      unit:      'Cd',
      secondary: results?.aero
        ? `Drag ${(results.aero.drag_N / 1000).toFixed(1)} kN @ ${params.speed_kmh} km/h`
        : '',
      target:    'Cd ≤ 0.20 (MAHSR Ph.2)',
      source:    'RTRI nose–Cd correlation',
    },
    {
      domain:    'Dynamics',
      score:     results?.dynamics
        ? Math.min(100, Math.max(0,
            (results.dynamics.critical_hunting_speed_kmh - params.speed_kmh) /
            (320 - params.speed_kmh) * 100))
        : null,
      primary:   results?.dynamics
        ? results.dynamics.critical_hunting_speed_kmh.toFixed(0) : '—',
      unit:      'km/h V_crit',
      secondary: results?.dynamics
        ? `Safety margin ${results.dynamics.safety_margin_kmh.toFixed(0)} km/h | Nadal Y/Q ${results.dynamics.nadal_yq.toFixed(3)}`
        : '',
      target:    'V_crit > 300 km/h (MAHSR)',
      source:    'Klingel–Boedecker, UIC 518',
    },
    {
      domain:    'Braking',
      score:     results?.braking
        ? Math.min(100, Math.max(0, (4000 - results.braking.stopping_distance_m) / (4000 - 2000) * 100))
        : null,
      primary:   results?.braking
        ? (results.braking.stopping_distance_m / 1000).toFixed(2) : '—',
      unit:      'km stop dist.',
      secondary: results?.braking
        ? `Peak disc ${results.braking.peak_disc_temp_C.toFixed(0)} °C from ${params.speed_kmh} km/h`
        : '',
      target:    '≤ 3.5 km from 250 km/h',
      source:    'UIC 544-1, MAHSR Rolling Stock Spec §8',
    },
    {
      domain:    'Traction',
      score:     results?.traction
        ? Math.min(100, (results.traction.max_speed_kmh / 250) * 100)
        : null,
      primary:   results?.traction
        ? results.traction.max_speed_kmh.toFixed(0) : '—',
      unit:      'km/h V_max',
      secondary: results?.traction
        ? `TE ${results.traction.te_at_speed_kN.toFixed(1)} kN | Base ${results.traction.base_speed_kmh.toFixed(0)} km/h`
        : '',
      target:    'V_max ≥ 250 km/h (Ph.1)',
      source:    'TE-V characteristic, MAHSR Traction Spec §4',
    },
    {
      domain:    'Tunnel Pressure',
      score:     results?.tunnel
        ? (results.tunnel.en14067_compliant ? 90 : 35)
        : null,
      primary:   results?.tunnel
        ? (results.tunnel.max_dpdt_Pa_per_s).toFixed(0) : '—',
      unit:      'Pa/s dp/dt',
      secondary: results?.tunnel
        ? `Peak ΔP ${(results.tunnel.peak_pressure_Pa / 1000).toFixed(2)} kPa | ${results.tunnel.en14067_compliant ? 'EN14067-5 compliant' : 'EN14067-5 FAILS'}`
        : '',
      target:    'dp/dt ≤ 3000 Pa/s (EN14067-5)',
      source:    'EN 14067-5:2006 / MAHSR Tunnel Spec §7',
    },
  ], [results, params]);

  // Radar data from mahsrScore
  const radarData = useMemo(() => {
    if (!mahsrScore) return null;
    return [
      { domain: 'Gauge',        score: mahsrScore.gauge        },
      { domain: 'Speed',        score: mahsrScore.speed        },
      { domain: 'Aero',         score: mahsrScore.aerodynamics },
      { domain: 'Braking',      score: mahsrScore.braking      },
      { domain: 'Structure',    score: mahsrScore.structural   },
      { domain: 'Signalling',   score: mahsrScore.signalling   },
    ];
  }, [mahsrScore]);

  const composite = mahsrScore?.composite ?? null;

  // Field data summary
  const meta = fieldData?.inspection_metadata;

  return (
    <div className="flex flex-col gap-5 p-5 font-sans">

      {/* ── Domain KPI cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-3">
        {cards.map(c => <KPICard key={c.domain} card={c} />)}
      </div>

      {/* ── Middle row: radar + field summary ─────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Radar + composite gauge */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white p-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
                MAHSR Readiness Score
              </h3>
              <p className="text-[10px] font-mono text-[#8A91A8] mt-0.5">
                NHSRCL Phase 1 — 250 km/h standard gauge corridor
              </p>
            </div>
            {composite !== null && (
              <div className="text-right">
                <span
                  className="font-mono text-[28px] font-bold leading-none"
                  style={{ color: scoreColor(composite) }}
                >
                  {composite.toFixed(0)}
                </span>
                <span className="font-mono text-[11px] text-[#8A91A8]"> / 100</span>
                <p className="text-[9px] font-mono mt-0.5" style={{ color: scoreColor(composite) }}>
                  {scoreLabel(composite)}
                </p>
              </div>
            )}
          </div>

          {radarData ? (
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke={C_GRID} />
                <PolarAngleAxis
                  dataKey="domain"
                  tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                />
                <PolarRadiusAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 8, fontFamily: 'DM Mono', fill: C_MUTED }}
                  tickCount={5}
                  angle={30}
                />
                <Radar
                  name="MAHSR Score"
                  dataKey="score"
                  stroke={C_BLUE}
                  fill={C_BLUE}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Tooltip content={<RadarTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px]">
              <p className="font-mono text-[11px] text-[#8A91A8]">
                Run simulation to populate readiness scores
              </p>
            </div>
          )}

          {radarData && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {radarData.map(d => (
                <div key={d.domain} className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: scoreColor(d.score) }}
                  />
                  <span className="font-mono text-[9px] text-[#4A5068]">{d.domain}</span>
                  <span
                    className="font-mono text-[9px] font-semibold ml-auto"
                    style={{ color: scoreColor(d.score) }}
                  >
                    {d.score.toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[8px] font-mono text-[#8A91A8] mt-3">
            Weights: Gauge 25% · Speed 25% · Aero 20% · Braking 15% · Structural 10% · Signalling 5%
          </p>
        </div>

        {/* Field data summary */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
              Inspection Context
            </h3>
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
              style={{
                color: fieldDataCompleteness >= 70 ? C_GREEN : fieldDataCompleteness >= 40 ? C_AMBER : C_RED,
                borderColor: fieldDataCompleteness >= 70 ? C_GREEN : fieldDataCompleteness >= 40 ? C_AMBER : C_RED,
                background: fieldDataCompleteness >= 70 ? '#F0FBF4' : fieldDataCompleteness >= 40 ? '#FFF8E8' : '#FFF0F0',
              }}
            >
              {fieldDataCompleteness}% complete
            </span>
          </div>

          {meta ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[
                { label: 'Location',    value: meta.location === 'jheel' ? 'Jheel Siding, Jamalpur' : 'RNCC Patna' },
                { label: 'Coach',       value: meta.coach_number },
                { label: 'Train Type',  value: meta.train_type === 'vb_sleeper' ? 'VB Sleeper' : 'VB Chair Car' },
                { label: 'Date',        value: meta.date },
                { label: 'Inspector',   value: meta.inspector_name },
                { label: 'Ambient',     value: meta.ambient_temperature_C != null ? `${meta.ambient_temperature_C} °C` : '—' },
                { label: 'Weather',     value: meta.weather || '—' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
                    {item.label}
                  </p>
                  <p className="font-mono text-[11px] text-[#1A1D2E] mt-0.5">{item.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4">
              <div className="w-8 h-8 rounded-full bg-[#E8F0FB] flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2v6l3 3" stroke="#003893" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="8" cy="8" r="6" stroke="#003893" strokeWidth="1.5"/>
                </svg>
              </div>
              <p className="font-mono text-[11px] text-[#8A91A8] text-center">
                No field data loaded
              </p>
              <p className="font-mono text-[9px] text-[#8A91A8] text-center">
                Use "Load Field Data" in the top bar to import inspection JSON
              </p>
            </div>
          )}

          {/* Completeness breakdown */}
          {fieldData && (
            <div className="border-t border-[#D8DFEE] pt-3 grid grid-cols-3 gap-2">
              {[
                { label: 'Wheelsets',    count: fieldData.wheelset_measurements.length,     total: 4 },
                { label: 'Bogies',       count: fieldData.bogie_measurements.length,         total: 2 },
                { label: 'Brake Discs',  count: fieldData.brake_disc_measurements.length,    total: 8 },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="font-mono text-[16px] font-semibold text-[#003893]">
                    {item.count}<span className="text-[10px] text-[#8A91A8]">/{item.total}</span>
                  </p>
                  <p className="text-[9px] font-sans text-[#8A91A8] uppercase tracking-wider">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          <p className="text-[8px] font-mono text-[#8A91A8] mt-auto">
            Source: Field data — {meta?.location === 'jheel' ? 'Jheel Siding' : meta?.location === 'rncc' ? 'RNCC Patna' : 'not loaded'} {meta?.date ?? ''}
          </p>
        </div>
      </div>

      {/* ── Cross-domain comparison table ─────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE] bg-[#F7F9FD] flex items-center justify-between">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            MAHSR Readiness Gap Analysis — Key Metrics
          </h3>
          <p className="text-[9px] font-mono text-[#8A91A8]">
            NHSRCL specification vs VB Chair Car baseline
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-[#D8DFEE] bg-[#F7F9FD]">
                {['Metric', 'VB Chair (BG)', 'B-28 Target (SG)', 'E5 Shinkansen', 'MAHSR Req.', 'Source'].map(h => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-[9px] font-sans uppercase tracking-widest text-[#8A91A8] whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row, i) => (
                <tr
                  key={row.metric}
                  className={`border-b border-[#D8DFEE] ${i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'}`}
                >
                  <td className="px-3 py-2 font-semibold text-[#1A1D2E]">{row.metric}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {row.vb_ok === true && <span className="text-[#1B7A45]">✓</span>}
                      {row.vb_ok === false && <span className="text-[#CE1726]">✗</span>}
                      {row.vb_ok === null && <span className="text-[#8A91A8]">—</span>}
                      <span style={{ color: row.vb_ok === false ? C_RED : row.vb_ok === true ? C_GREEN : C_MUTED }}>
                        {row.vb}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {row.b28_ok && <span className="text-[#1B7A45]">✓</span>}
                      <span style={{ color: row.b28_ok ? C_GREEN : C_RED }}>{row.b28}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      {row.e5_ok && <span className="text-[#1B7A45]">✓</span>}
                      <span style={{ color: row.e5_ok ? C_GREEN : C_RED }}>{row.e5}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-[#4A5068]">{row.mahsr_req}</td>
                  <td className="px-3 py-2 text-[#8A91A8] text-[8px]">{row.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
