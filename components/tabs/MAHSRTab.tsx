'use client';

/**
 * MAHSRTab.tsx — MAHSR Readiness Assessment.
 *
 * Left:  RadarChart — 6-axis readiness scores (Gauge, Speed, Aero, Braking,
 *        Structural, Signalling). Overlaid: VB Chair (orange) vs B-28 Target (blue).
 * Right: Gap analysis table — current value, MAHSR Phase 1/Phase 2 target, gap,
 *        action required.
 * Below: Upgrade roadmap cards — Near-term / Medium-term / Long-term.
 *        Each card has a timeline, investment estimate, and impact score.
 *
 * All readiness scores flow from Zustand mahsrScore (derived in store from results).
 * B-28 reference scores are hardcoded nominal estimates (ASSUMED).
 *
 * Source: NHSRCL Rolling Stock Technical Specification Rev.4 (2023)
 *         NHSRCL Civil Engineering Specification (2022)
 *         JR East E5 Series Technical Data (2011)
 */

import { useMemo, useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from 'recharts';
import { useSimulationStore } from '@/store/simulation';
import { MAHSR } from '@/lib/config';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE    = '#003893';
const C_ORANGE  = '#F26522';
const C_RED     = '#CE1726';
const C_GREEN   = '#1B7A45';
const C_AMBER   = '#A05A00';
const C_GRID    = '#E8EEFA';
const C_AXIS    = '#4A5068';
const C_MUTED   = '#8A91A8';
const C_PURPLE  = '#7C3AED';

// ── B-28 nominal MAHSR scores (ASSUMED — estimated from published specs) ──────
// Source: BEML-ICF-Medha B-28 concept brief (2022); ASSUMED where not confirmed
const B28_SCORES = {
  gauge:        100,
  speed:        100,
  aerodynamics: 84,
  braking:      88,
  structural:   72,
  signalling:   40,   // ASSUMED: ATP/OCS fitment not confirmed in public brief
};

// ── Gap analysis rows ──────────────────────────────────────────────────────────
interface GapRow {
  domain:      string;
  current:     string;
  ph1_target:  string;
  ph2_target:  string;
  gap:         string;
  effort:      'high' | 'medium' | 'low';
  action:      string;
  source:      string;
}

const GAP_ROWS: GapRow[] = [
  {
    domain:     'Track Gauge',
    current:    '1676 mm (BG)',
    ph1_target: '1435 mm (SG)',
    ph2_target: '1435 mm (SG)',
    gap:        '241 mm — incompatible',
    effort:     'high',
    action:     'Complete gauge conversion or dedicated SG trainset (B-28)',
    source:     'NHSRCL Civil Works Spec §3.1',
  },
  {
    domain:     'Max Design Speed',
    current:    '180 km/h',
    ph1_target: '250 km/h',
    ph2_target: '320 km/h',
    gap:        '70 km/h (Ph.1) | 140 km/h (Ph.2)',
    effort:     'high',
    action:     'New high-speed bogie, motor upgrade (≥280 kW/axle), wheel profile redesign',
    source:     'NHSRCL Traction & RS Spec §4.2',
  },
  {
    domain:     'Aerodynamic Drag',
    current:    'Cd ≈ 0.30 (nose 3.5 m)',
    ph1_target: 'Cd ≤ 0.22 (nose ≥ 7 m)',
    ph2_target: 'Cd ≤ 0.15 (nose ≥ 12 m)',
    gap:        'Cd gap 0.08–0.15 (26–50%)',
    effort:     'high',
    action:     'Redesign nose to ≥10 m; add bogie skirts, inter-car covers, smooth underbelly',
    source:     'RTRI Quarterly Vol.45 No.2 (2004)',
  },
  {
    domain:     'Braking (disc type)',
    current:    'Grey cast iron, 640 mm',
    ph1_target: 'Composite ≥ 660 mm',
    ph2_target: 'Carbon-ceramic',
    gap:        'Material and diameter upgrade required',
    effort:     'medium',
    action:     'Retrofit composite discs; validate per UIC 541-3 §6; update brake system logic',
    source:     'UIC 541-3, MAHSR RS Spec §9.4',
  },
  {
    domain:     'Wheel Profile / Conicity',
    current:    'IR wheel profile (BG, 1676 mm)',
    ph1_target: 'SG profile per UIC 519, eq. conicity ≤ 0.15',
    ph2_target: 'eq. conicity ≤ 0.10',
    gap:        'Complete redesign for SG; hunting risk at >200 km/h on BG',
    effort:     'high',
    action:     'Adopt SG wheel profile from B-28 spec; verify on roller rig per UIC 518',
    source:     'UIC 519, UIC 518, Wickens (2003)',
  },
  {
    domain:     'Signalling / ATP',
    current:    'TCAS (Indian ATP)',
    ph1_target: 'ETCS L2 or Shinkansen ATC',
    ph2_target: 'ETCS L2 with ERTMS',
    gap:        'Full replacement — TCAS incompatible with MAHSR OCS',
    effort:     'high',
    action:     'Procure and certify ETCS Level 2 OBU; MAHSR OCS trackside works in parallel',
    source:     'NHSRCL Signalling Spec §5 (2022)',
  },
  {
    domain:     'Tunnel Pressure (nose)',
    current:    'N/A at operating speed',
    ph1_target: 'dp/dt ≤ 3000 Pa/s in 21 km tunnel',
    ph2_target: 'dp/dt ≤ 2500 Pa/s',
    gap:        'Estimated ~4200 Pa/s at 250 km/h with 3.5 m nose',
    effort:     'medium',
    action:     'Nose ≥10 m (reduces dp/dt by ~40%); add tunnel micro-pressure wave absorbers',
    source:     'EN 14067-5:2006, MAHSR Tunnel Spec §7.3',
  },
  {
    domain:     'Pass-By Noise',
    current:    '~80 dB(A) at 250 km/h (est.)',
    ph1_target: '≤ 80 dB(A) at 250 km/h',
    ph2_target: '≤ 80 dB(A) at 300 km/h',
    gap:        'Ph.1 borderline; Ph.2 requires ~7 dB reduction',
    effort:     'medium',
    action:     'Bogie shrouds, inter-car covers, wheel roughness control, rail grinding programme',
    source:     'TSI Noise EU 1304/2014 Table B.3',
  },
];

// ── Upgrade roadmap items ──────────────────────────────────────────────────────
interface RoadmapItem {
  phase:    'near' | 'medium' | 'long';
  horizon:  string;
  title:    string;
  items:    string[];
  impact:   number;   // 0–100 score improvement
  note:     string;
}

const ROADMAP: RoadmapItem[] = [
  {
    phase:   'near',
    horizon: '0–2 years',
    title:   'Immediate Engineering Studies',
    items: [
      'Commission aerodynamic CFD study — nose 7 m, 10 m, 15 m variants',
      'Wheel profile conicity measurement programme on Jheel/RNCC fleet',
      'Composite disc brake fitment pilot — 4 wheelsets',
      'MAHSR corridor tunnel dp/dt simulation (EN 14067-5 method of characteristics)',
      'Acoustics pass-by measurement campaign (EN ISO 3095:2013)',
    ],
    impact: 5,
    note: 'Establishes baseline data for all design decisions. No major capex.',
  },
  {
    phase:   'medium',
    horizon: '2–5 years',
    title:   'B-28 Platform Development',
    items: [
      'Standard gauge bogie design — hunting critical speed >300 km/h',
      'Nose 10 m — Cd ≤ 0.21 verified in RTRI wind tunnel',
      'Composite disc brakes fleet-wide — validate stopping distance <3.5 km',
      'Traction package — 280–320 kW/axle PMSM motors',
      'Interior NVH: vibration damping to Sperling Wz < 2.5',
    ],
    impact: 55,
    note: 'Core platform qualification. Target: MAHSR Phase 1 (250 km/h) certification.',
  },
  {
    phase:   'long',
    horizon: '5–10 years',
    title:   'MAHSR Phase 2 — 320 km/h Certification',
    items: [
      'Nose ≥ 15 m or active nose cone — Cd ≤ 0.15',
      'ETCS Level 2 + ERTMS integration with NHSRCL OCS',
      'Active aerodynamic suspension for yaw control at 320 km/h',
      'Carbon-ceramic brake discs — validated per UIC 541-3',
      'Full EN 14067-5 tunnel pressure compliance at 320 km/h operational speed',
    ],
    impact: 90,
    note: 'Phase 2 full-speed certification. Reference: E5/N700S architecture.',
  },
];

// ── effort badge ───────────────────────────────────────────────────────────────
function EffortBadge({ effort }: { effort: GapRow['effort'] }) {
  const styles = {
    high:   { bg: '#FFF0F0', border: '#CE1726', color: '#CE1726', label: 'High effort' },
    medium: { bg: '#FFF8E8', border: '#A05A00', color: '#A05A00', label: 'Medium effort' },
    low:    { bg: '#F0FBF4', border: '#1B7A45', color: '#1B7A45', label: 'Low effort' },
  };
  const s = styles[effort];
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── tooltips ───────────────────────────────────────────────────────────────────
function RadarTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-[#D8DFEE] rounded-lg px-3 py-2 shadow text-[10px] font-mono">
      <p className="text-[#4A5068] mb-1">{d.domain}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke }}>
          {p.name}: <span className="font-semibold">{Number(p.value).toFixed(0)} / 100</span>
        </p>
      ))}
    </div>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────

export function MAHSRTab() {
  const { mahsrScore, params, results } = useSimulationStore();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Build radar data: VB Chair (live) vs B-28 (nominal)
  const radarData = useMemo(() => {
    const vb = mahsrScore ?? {
      gauge: 0, speed: 0, aerodynamics: 0, braking: 0, structural: 0, signalling: 0, composite: 0,
    };
    return [
      { domain: 'Gauge',      vb: vb.gauge,        b28: B28_SCORES.gauge        },
      { domain: 'Speed',      vb: vb.speed,        b28: B28_SCORES.speed        },
      { domain: 'Aero',       vb: vb.aerodynamics, b28: B28_SCORES.aerodynamics },
      { domain: 'Braking',    vb: vb.braking,      b28: B28_SCORES.braking      },
      { domain: 'Structure',  vb: vb.structural,   b28: B28_SCORES.structural   },
      { domain: 'Signalling', vb: vb.signalling,   b28: B28_SCORES.signalling   },
    ];
  }, [mahsrScore]);

  // Bar chart: domain scores comparison
  const barData = useMemo(() => radarData.map(d => ({
    domain:   d.domain,
    vb:       Math.round(d.vb),
    b28:      Math.round(d.b28),
  })), [radarData]);

  const composite     = mahsrScore?.composite ?? 0;
  const b28Composite  = Object.values(B28_SCORES).reduce((a, v) => a + v, 0) / 6;

  return (
    <div className="flex flex-col gap-5 p-5 font-sans">

      {/* ── Status header ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-xl border border-[#D8DFEE] px-5 py-3 bg-[#F7F9FD]">
        <div>
          <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
            Composite Readiness — {params.preset.replace('_', ' ').toUpperCase()}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span
              className="font-mono text-[32px] font-bold leading-none"
              style={{
                color: composite >= 75 ? C_GREEN : composite >= 50 ? C_AMBER : C_RED,
              }}
            >
              {composite.toFixed(0)}
            </span>
            <span className="font-mono text-[13px] text-[#8A91A8]">/ 100</span>
          </div>
        </div>
        <div className="h-10 w-px bg-[#D8DFEE]" />
        <div>
          <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
            B-28 Target Score (est.)
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-mono text-[32px] font-bold leading-none text-[#003893]">
              {b28Composite.toFixed(0)}
            </span>
            <span className="font-mono text-[13px] text-[#8A91A8]">/ 100</span>
          </div>
        </div>
        <div className="h-10 w-px bg-[#D8DFEE]" />
        <div className="flex-1">
          {/* Gap bar */}
          <p className="text-[9px] font-mono text-[#8A91A8] mb-1">Gap to B-28 target</p>
          <div className="w-full h-3 bg-[#E8EEFA] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${composite}%`,
                background: composite >= 75 ? C_GREEN : composite >= 50 ? C_AMBER : C_RED,
              }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="font-mono text-[8px] text-[#8A91A8]">0</span>
            <span className="font-mono text-[8px] text-[#8A91A8]">Phase 1 target: 75</span>
            <span className="font-mono text-[8px] text-[#8A91A8]">100</span>
          </div>
        </div>
        <p className="text-[9px] font-mono text-[#8A91A8] ml-2">
          NHSRCL specification: MAHSR Rolling Stock<br />
          Technical Spec Rev.4 (2023)
        </p>
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Radar */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white p-4">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Domain Scores — Radar Comparison
          </h3>
          <p className="text-[9px] font-mono text-[#8A91A8] mb-3">
            Orange = current preset | Blue = B-28 MAHSR target (ASSUMED nominal)
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart cx="50%" cy="50%" outerRadius="72%" data={radarData}>
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
                name="VB Chair (current)"
                dataKey="vb"
                stroke={C_ORANGE}
                fill={C_ORANGE}
                fillOpacity={0.15}
                strokeWidth={2}
              />
              <Radar
                name="B-28 Target"
                dataKey="b28"
                stroke={C_BLUE}
                fill={C_BLUE}
                fillOpacity={0.12}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
              <Legend
                wrapperStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
                formatter={(v) => <span style={{ color: C_AXIS }}>{v}</span>}
              />
              <Tooltip content={<RadarTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white p-4">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Per-Domain Score — Side-by-Side
          </h3>
          <p className="text-[9px] font-mono text-[#8A91A8] mb-3">
            Score out of 100 | 75 = Phase 1 minimum
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 16, left: 24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C_GRID} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 9, fontFamily: 'DM Mono', fill: C_AXIS }}
              />
              <YAxis
                type="category"
                dataKey="domain"
                tick={{ fontSize: 10, fontFamily: 'DM Mono', fill: C_AXIS }}
                width={60}
              />
              <Tooltip
                formatter={(v: number, name: string) => [`${v} / 100`, name]}
                contentStyle={{ fontSize: 10, fontFamily: 'DM Mono' }}
              />
              {/* Phase 1 line at 75 */}
              <Bar dataKey="vb" name="VB Chair" fill={C_ORANGE} radius={[0, 2, 2, 0]} barSize={8}>
                {barData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.vb >= 75 ? C_GREEN : entry.vb >= 50 ? C_AMBER : C_RED}
                  />
                ))}
              </Bar>
              <Bar dataKey="b28" name="B-28 Target" fill={C_BLUE} radius={[0, 2, 2, 0]} barSize={8}
                   fillOpacity={0.5} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[8px] font-mono text-[#8A91A8] mt-1">
            Green ≥ 75 (compliant) | Amber 50–75 | Red &lt; 50 (non-compliant)
          </p>
        </div>
      </div>

      {/* ── Gap analysis table ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-[#D8DFEE] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#D8DFEE] bg-[#F7F9FD] flex items-center justify-between">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Gap Analysis — VB Chair vs MAHSR Specification
          </h3>
          <p className="text-[9px] font-mono text-[#8A91A8]">
            Click a row for engineering action detail
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-[#D8DFEE] bg-[#F7F9FD]">
                {['Domain', 'Current (VB Chair)', 'Phase 1 Target', 'Phase 2 Target', 'Gap', 'Effort'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-[9px] font-sans uppercase tracking-widest text-[#8A91A8] whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GAP_ROWS.map((row, i) => (
                <>
                  <tr
                    key={row.domain}
                    className={`border-b border-[#D8DFEE] cursor-pointer hover:bg-[#F0F4FC] transition-colors ${
                      i % 2 === 0 ? 'bg-white' : 'bg-[#F7F9FD]'
                    } ${expandedRow === row.domain ? 'bg-[#EEF2FB]' : ''}`}
                    onClick={() => setExpandedRow(expandedRow === row.domain ? null : row.domain)}
                  >
                    <td className="px-3 py-2 font-semibold text-[#1A1D2E]">{row.domain}</td>
                    <td className="px-3 py-2 text-[#CE1726]">{row.current}</td>
                    <td className="px-3 py-2 text-[#4A5068]">{row.ph1_target}</td>
                    <td className="px-3 py-2 text-[#4A5068]">{row.ph2_target}</td>
                    <td className="px-3 py-2 text-[#1A1D2E]">{row.gap}</td>
                    <td className="px-3 py-2">
                      <EffortBadge effort={row.effort} />
                    </td>
                  </tr>
                  {expandedRow === row.domain && (
                    <tr key={`${row.domain}-detail`} className="bg-[#EEF2FB] border-b border-[#D8DFEE]">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="flex items-start gap-3">
                          <div className="w-1 self-stretch rounded bg-[#003893] shrink-0" />
                          <div>
                            <p className="text-[10px] font-semibold text-[#003893] mb-0.5">
                              Engineering Action Required
                            </p>
                            <p className="text-[10px] text-[#4A5068] leading-relaxed mb-1">
                              {row.action}
                            </p>
                            <p className="text-[8px] text-[#8A91A8]">Source: {row.source}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Upgrade roadmap ────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-3">
          Upgrade Roadmap — MAHSR Readiness Pathway
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {ROADMAP.map(phase => {
            const phaseColors = {
              near:   { accent: C_GREEN,  bg: '#F0FBF4', border: '#1B7A45', label: 'Near-term' },
              medium: { accent: C_ORANGE, bg: '#FFF8E8', border: '#A05A00', label: 'Medium-term' },
              long:   { accent: C_BLUE,   bg: '#EEF2FB', border: '#003893', label: 'Long-term' },
            };
            const c = phaseColors[phase.phase];
            return (
              <div
                key={phase.phase}
                className="rounded-xl border p-4 flex flex-col gap-3"
                style={{ background: c.bg, borderColor: c.border }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[9px] font-mono px-2 py-0.5 rounded font-semibold"
                    style={{ background: c.accent + '20', color: c.accent, border: `1px solid ${c.accent}` }}
                  >
                    {c.label}
                  </span>
                  <span className="text-[9px] font-mono text-[#8A91A8]">{phase.horizon}</span>
                </div>

                <div>
                  <h4 className="font-mono text-[11px] font-semibold text-[#1A1D2E] mb-2">
                    {phase.title}
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {phase.items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span
                          className="w-1 h-1 rounded-full mt-1.5 shrink-0"
                          style={{ background: c.accent }}
                        />
                        <span className="font-mono text-[9px] text-[#4A5068] leading-relaxed">
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto border-t pt-3" style={{ borderColor: c.border + '60' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-[#8A91A8]">Score improvement</span>
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: c.accent }}
                    >
                      +{phase.impact} pts
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${phase.impact}%`, background: c.accent }}
                    />
                  </div>
                  <p className="text-[8px] font-mono text-[#8A91A8] mt-2">{phase.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[8px] font-mono text-[#8A91A8]">
        ASSUMED — B-28 scores are estimated from public brief (2022). All targets: NHSRCL RS Spec Rev.4 (2023).
        Roadmap items are engineering recommendations, not NHSRCL commitments.
      </p>
    </div>
  );
}
