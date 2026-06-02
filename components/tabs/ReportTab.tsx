'use client';

/**
 * ReportTab.tsx — PDF Report Generator.
 *
 * Layout:
 *   Left:  Report configuration panel — inspector name, date override,
 *          section checkboxes, signature block.
 *   Right: Report preview — structured list of sections with data status
 *          (populated / awaiting simulation / awaiting field data).
 *   Bottom: Generate button → calls POST /api/report and downloads JSON,
 *           or triggers client-side jsPDF rendering.
 *
 * Data flows from Zustand — results, fieldData, mahsrScore, aiAnalysis.
 * When field data is absent, each section shows what will be substituted
 * with nominal values and logs a warning in the preview.
 *
 * Source note format: "From field data — Jheel YYYY-MM-DD" or
 *   "Nominal specification — ICF/RDSO" per CLAUDE.md rule 17.
 */

import { useState, useMemo } from 'react';
import { useSimulationStore } from '@/store/simulation';
import { VB_NOMINAL, MAHSR } from '@/lib/config';

// ── colours ────────────────────────────────────────────────────────────────────
const C_BLUE   = '#003893';
const C_ORANGE = '#F26522';
const C_RED    = '#CE1726';
const C_GREEN  = '#1B7A45';
const C_AMBER  = '#A05A00';
const C_GRID   = '#E8EEFA';
const C_AXIS   = '#4A5068';
const C_MUTED  = '#8A91A8';
const C_BG     = '#F7F9FD';

// ── report section definitions ─────────────────────────────────────────────────
interface ReportSection {
  id:          string;
  title:       string;
  description: string;
  requiresField: boolean;
  requiresPhysics: boolean;
  requiresAI: boolean;
  pages:       number;
}

const SECTIONS: ReportSection[] = [
  {
    id: 'cover',
    title: '1. Cover Page',
    description: 'Title, inspection metadata, IRIMEE letterhead, date, inspector signature.',
    requiresField: true, requiresPhysics: false, requiresAI: false,
    pages: 1,
  },
  {
    id: 'executive',
    title: '2. Executive Summary',
    description: 'Composite MAHSR readiness score, critical findings, top 3 recommendations.',
    requiresField: false, requiresPhysics: true, requiresAI: true,
    pages: 1,
  },
  {
    id: 'field_data',
    title: '3. Field Measurement Data',
    description: 'All wheelset, bogie, brake disc, pantograph, traction measurements with out-of-spec flags.',
    requiresField: true, requiresPhysics: false, requiresAI: false,
    pages: 4,
  },
  {
    id: 'aerodynamics',
    title: '4. Aerodynamic Analysis',
    description: 'Davis resistance curve, Cd vs nose length, drag at 250 km/h, tunnel pressure compliance.',
    requiresField: false, requiresPhysics: true, requiresAI: false,
    pages: 2,
  },
  {
    id: 'dynamics',
    title: '5. Vehicle Dynamics',
    description: 'Klingel wavelength, critical hunting speed, Nadal Y/Q ratio, Sperling Wz index.',
    requiresField: true, requiresPhysics: true, requiresAI: false,
    pages: 2,
  },
  {
    id: 'braking',
    title: '6. Braking Performance',
    description: 'Stopping distance, disc temperature transient, Paris\' law fatigue, crack growth.',
    requiresField: true, requiresPhysics: true, requiresAI: false,
    pages: 2,
  },
  {
    id: 'traction',
    title: '7. Traction Performance',
    description: 'TE-V diagram, max speed, power budget, energy per seat-km comparison.',
    requiresField: false, requiresPhysics: true, requiresAI: false,
    pages: 2,
  },
  {
    id: 'structural',
    title: '8. Structural & Fatigue',
    description: 'S-N curve, Miner damage summation, crack observations with photo index.',
    requiresField: true, requiresPhysics: true, requiresAI: false,
    pages: 3,
  },
  {
    id: 'acoustics',
    title: '9. Acoustics & NVH',
    description: 'Pass-by noise model, TSI compliance status, Sperling ride comfort index.',
    requiresField: false, requiresPhysics: false, requiresAI: false,
    pages: 1,
  },
  {
    id: 'mahsr',
    title: '10. MAHSR Readiness Assessment',
    description: 'Per-domain scores, gap analysis table, upgrade roadmap, Phase 1/2 compliance matrix.',
    requiresField: false, requiresPhysics: true, requiresAI: false,
    pages: 3,
  },
  {
    id: 'ai_analysis',
    title: '11. AI Engineering Analysis',
    description: 'Claude-generated findings: safety assessment, MAHSR feasibility, recommendations.',
    requiresField: false, requiresPhysics: true, requiresAI: true,
    pages: 1,
  },
  {
    id: 'signature',
    title: '12. Signature & Certification Block',
    description: 'Inspector name, designation, date, IRIMEE stamp, supervisor countersign line.',
    requiresField: true, requiresPhysics: false, requiresAI: false,
    pages: 1,
  },
];

// ── status badge ──────────────────────────────────────────────────────────────
type SectionStatus = 'ready' | 'partial' | 'missing';

function StatusBadge({ status }: { status: SectionStatus }) {
  const s = {
    ready:   { bg: '#F0FBF4', border: '#1B7A45', color: C_GREEN,  label: 'Ready'   },
    partial: { bg: '#FFF8E8', border: '#A05A00', color: C_AMBER,  label: 'Partial' },
    missing: { bg: '#FFF0F0', border: '#CE1726', color: C_RED,    label: 'Missing data' },
  }[status];
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded-full border"
      style={{ background: s.bg, borderColor: s.border, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ── main ────────────────────────────────────────────────────────────────────────
export function ReportTab() {
  const {
    results, fieldData, mahsrScore, aiAnalysis, aiLoading,
    params, runAIAnalysis, fieldDataCompleteness,
  } = useSimulationStore();

  // Report config state
  const [inspectorName, setInspectorName]     = useState(
    fieldData?.inspection_metadata.inspector_name ?? ''
  );
  const [designation, setDesignation]         = useState('JE / SSE (Mech), IRIMEE Jamalpur');
  const [reportDate, setReportDate]           = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [includeNominal, setIncludeNominal]   = useState(true);
  const [enabledSections, setEnabledSections] = useState<Set<string>>(
    new Set(SECTIONS.map(s => s.id))
  );
  const [generating, setGenerating]           = useState(false);
  const [generateStatus, setGenerateStatus]   = useState<string | null>(null);

  const meta = fieldData?.inspection_metadata;

  // Section status
  const sectionStatuses = useMemo((): Record<string, SectionStatus> => {
    const out: Record<string, SectionStatus> = {};
    for (const sec of SECTIONS) {
      const needsField   = sec.requiresField   && !fieldData;
      const needsPhysics = sec.requiresPhysics && !results;
      const needsAI      = sec.requiresAI      && !aiAnalysis;
      if (needsField && needsPhysics) { out[sec.id] = 'missing';  continue; }
      if (needsField || needsPhysics || needsAI) { out[sec.id] = 'partial'; continue; }
      out[sec.id] = 'ready';
    }
    return out;
  }, [fieldData, results, aiAnalysis]);

  const readyCount   = Object.values(sectionStatuses).filter(s => s === 'ready').length;
  const partialCount = Object.values(sectionStatuses).filter(s => s === 'partial').length;
  const totalPages   = SECTIONS.filter(s => enabledSections.has(s.id))
                                .reduce((sum, s) => sum + s.pages, 0);

  const toggleSection = (id: string) => {
    setEnabledSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Generate report — assembles data client-side and triggers download
  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateStatus('Assembling report data…');

    try {
      // Build the complete report JSON client-side from store data
      const reportPayload = {
        generated_at:   new Date().toISOString(),
        report_date:    reportDate,
        inspector_name: inspectorName,
        designation,
        enabled_sections: Array.from(enabledSections),
        include_nominal_substitutions: includeNominal,
        simulation_params: params,
        field_data: fieldData,
        physics_results: results,
        mahsr_score: mahsrScore,
        ai_analysis: aiAnalysis,
        report_metadata: {
          coach_number:    meta?.coach_number    ?? 'Not specified',
          location:        meta?.location        ?? 'Not specified',
          train_type:      meta?.train_type      ?? 'vb_chair',
          inspection_date: meta?.date            ?? reportDate,
          report_version:  '1.0',
          platform:        'VBHSR-SIM — MAHSR Multi-Physics Platform',
        },
      };

      setGenerateStatus('Downloading report JSON…');
      const blob    = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json' });
      const url     = URL.createObjectURL(blob);
      const anchor  = document.createElement('a');
      anchor.href     = url;
      anchor.download = `VBHSR_Report_${meta?.coach_number ?? 'draft'}_${reportDate}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      setGenerateStatus('Downloaded. Use the Python report builder (reports/generate_pdf.py) to render PDF.');
    } catch (err) {
      setGenerateStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex gap-4 p-5 font-sans h-full">

      {/* ── Left: config panel ─────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col gap-4">

        {/* Inspector details */}
        <div className="rounded-xl border border-[#D8DFEE] bg-white p-4 flex flex-col gap-3">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068]">
            Report Configuration
          </h3>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
              Inspector Name
            </label>
            <input
              type="text"
              value={inspectorName}
              onChange={e => setInspectorName(e.target.value)}
              placeholder="e.g. Pushpal Sarkar"
              className="font-mono text-[11px] border border-[#D8DFEE] rounded px-2.5 py-1.5 outline-none focus:border-[#003893] bg-[#F7F9FD] text-[#1A1D2E]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
              Designation
            </label>
            <input
              type="text"
              value={designation}
              onChange={e => setDesignation(e.target.value)}
              className="font-mono text-[11px] border border-[#D8DFEE] rounded px-2.5 py-1.5 outline-none focus:border-[#003893] bg-[#F7F9FD] text-[#1A1D2E]"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">
              Report Date
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={e => setReportDate(e.target.value)}
              className="font-mono text-[11px] border border-[#D8DFEE] rounded px-2.5 py-1.5 outline-none focus:border-[#003893] bg-[#F7F9FD] text-[#1A1D2E]"
            />
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeNominal}
              onChange={e => setIncludeNominal(e.target.checked)}
              className="mt-0.5 accent-[#003893]"
            />
            <span className="font-mono text-[10px] text-[#4A5068] leading-relaxed">
              Substitute nominal ICF/RDSO values where field data is null
              (with warning note per CLAUDE.md rule 10)
            </span>
          </label>
        </div>

        {/* Data readiness summary */}
        <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] p-4 flex flex-col gap-2">
          <h3 className="text-[11px] font-sans uppercase tracking-widest text-[#4A5068] mb-1">
            Data Readiness
          </h3>
          {[
            {
              label:  'Field data',
              ok:     !!fieldData,
              detail: fieldData
                ? `${fieldDataCompleteness}% complete — ${meta?.location === 'jheel' ? 'Jheel' : meta?.location === 'rncc' ? 'RNCC' : '?'} ${meta?.date ?? ''}`
                : 'Not loaded — use Load Field Data',
            },
            {
              label:  'Physics results',
              ok:     !!results,
              detail: results
                ? `Computed at ${new Date(results.computed_at).toLocaleTimeString()}`
                : 'Run simulation first',
            },
            {
              label:  'AI analysis',
              ok:     !!aiAnalysis,
              detail: aiAnalysis
                ? `Generated by ${aiAnalysis.model}`
                : 'Not generated',
            },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-2">
              <div
                className="w-2 h-2 rounded-full mt-0.5 shrink-0"
                style={{ background: item.ok ? C_GREEN : C_RED }}
              />
              <div>
                <p className="font-mono text-[10px] text-[#1A1D2E]">{item.label}</p>
                <p className="font-mono text-[9px] text-[#8A91A8]">{item.detail}</p>
              </div>
            </div>
          ))}

          {/* Run AI if not done */}
          {!aiAnalysis && results && (
            <button
              onClick={runAIAnalysis}
              disabled={aiLoading}
              className="mt-1 w-full py-1.5 rounded text-[10px] font-mono border transition-colors"
              style={{
                borderColor: C_BLUE, color: aiLoading ? C_MUTED : C_BLUE,
                background: aiLoading ? '#F7F9FD' : '#EEF2FB',
              }}
            >
              {aiLoading ? 'Generating AI analysis…' : 'Generate AI analysis'}
            </button>
          )}
        </div>

        {/* Generate button */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || (!results && !fieldData)}
            className="w-full py-2.5 rounded-lg font-mono text-[12px] font-semibold text-white transition-all"
            style={{
              background: generating ? C_MUTED : C_BLUE,
              opacity: (!results && !fieldData) ? 0.5 : 1,
              cursor: (!results && !fieldData) ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? 'Generating…' : `Download Report JSON (${totalPages} pages est.)`}
          </button>

          {generateStatus && (
            <p className="font-mono text-[9px] text-[#4A5068] leading-relaxed">{generateStatus}</p>
          )}

          <p className="font-mono text-[8px] text-[#8A91A8] leading-relaxed">
            Downloads structured JSON. Use{' '}
            <span className="text-[#003893]">reports/generate_pdf.py</span>
            {' '}in the Python environment to render WeasyPrint PDF with IRIMEE template.
          </p>
        </div>
      </div>

      {/* ── Right: section preview ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 overflow-auto">

        {/* Summary bar */}
        <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] px-4 py-3 flex items-center gap-6 shrink-0">
          <div>
            <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">Sections</p>
            <p className="font-mono text-[18px] font-bold text-[#1A1D2E]">
              {enabledSections.size}
              <span className="text-[11px] font-normal text-[#8A91A8]"> / {SECTIONS.length}</span>
            </p>
          </div>
          <div className="h-8 w-px bg-[#D8DFEE]" />
          <div>
            <p className="text-[9px] font-sans uppercase tracking-widest text-[#8A91A8]">Estimated Pages</p>
            <p className="font-mono text-[18px] font-bold text-[#003893]">{totalPages}</p>
          </div>
          <div className="h-8 w-px bg-[#D8DFEE]" />
          <div className="flex items-center gap-3">
            {[
              { label: 'Ready',   count: readyCount,   color: C_GREEN },
              { label: 'Partial', count: partialCount, color: C_AMBER },
              { label: 'Missing', count: SECTIONS.length - readyCount - partialCount, color: C_RED },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                <span className="font-mono text-[10px] text-[#4A5068]">
                  {item.count} {item.label}
                </span>
              </div>
            ))}
          </div>
          <p className="ml-auto font-mono text-[8px] text-[#8A91A8]">
            Template: Jinja2 + WeasyPrint | reports/templates/inspection_report.html
          </p>
        </div>

        {/* Section list */}
        <div className="flex flex-col gap-1.5">
          {SECTIONS.map(sec => {
            const enabled = enabledSections.has(sec.id);
            const status  = sectionStatuses[sec.id];
            return (
              <div
                key={sec.id}
                className={`rounded-lg border transition-all ${
                  enabled
                    ? 'border-[#D8DFEE] bg-white'
                    : 'border-[#E8EEFA] bg-[#F7F9FD] opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => toggleSection(sec.id)}
                    className="accent-[#003893] w-3.5 h-3.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[11px] font-semibold text-[#1A1D2E]">
                        {sec.title}
                      </p>
                      <StatusBadge status={status} />
                    </div>
                    <p className="font-mono text-[9px] text-[#8A91A8] mt-0.5 leading-relaxed">
                      {sec.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Dependency indicators */}
                    <div className="flex items-center gap-1">
                      {sec.requiresField && (
                        <span
                          className="text-[7px] font-mono px-1 py-0.5 rounded"
                          style={{
                            background: fieldData ? '#F0FBF4' : '#FFF0F0',
                            color: fieldData ? C_GREEN : C_RED,
                          }}
                          title="Requires field data"
                        >
                          field
                        </span>
                      )}
                      {sec.requiresPhysics && (
                        <span
                          className="text-[7px] font-mono px-1 py-0.5 rounded"
                          style={{
                            background: results ? '#F0FBF4' : '#FFF0F0',
                            color: results ? C_GREEN : C_RED,
                          }}
                          title="Requires physics results"
                        >
                          physics
                        </span>
                      )}
                      {sec.requiresAI && (
                        <span
                          className="text-[7px] font-mono px-1 py-0.5 rounded"
                          style={{
                            background: aiAnalysis ? '#F0FBF4' : '#FFF8E8',
                            color: aiAnalysis ? C_GREEN : C_AMBER,
                          }}
                          title="Requires AI analysis"
                        >
                          AI
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[9px] text-[#8A91A8]">{sec.pages} p.</span>
                  </div>
                </div>

                {/* Partial data warning */}
                {enabled && status === 'partial' && (
                  <div className="px-4 pb-2.5 flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-[#A05A00] mt-1 shrink-0" />
                    <p className="font-mono text-[8px] text-[#A05A00] leading-relaxed">
                      {sec.requiresField && !fieldData && 'Field data absent — nominal ICF/RDSO values will be substituted with warning note. '}
                      {sec.requiresPhysics && !results && 'Run simulation to populate physics outputs. '}
                      {sec.requiresAI && !aiAnalysis && 'AI analysis absent — section will show "Not generated" notice.'}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Source note */}
        <div className="rounded-xl border border-[#D8DFEE] bg-[#F7F9FD] px-4 py-3 shrink-0">
          <p className="text-[9px] font-mono text-[#8A91A8] leading-relaxed">
            <span className="font-semibold text-[#4A5068]">Report source attribution (per CLAUDE.md §17):</span>
            {' '}Field measurements → "From field data — {meta?.location === 'jheel' ? 'Jheel Siding' : meta?.location === 'rncc' ? 'RNCC Patna' : '[location]'} {meta?.date ?? '[date]'}".
            Nominal substitutions → "Nominal specification — ICF/RDSO".
            Computed values → "Computed — VBHSR-SIM [module name]".
            AI analysis → "Generated by Claude [model] — not for regulatory submission".
          </p>
        </div>
      </div>
    </div>
  );
}
