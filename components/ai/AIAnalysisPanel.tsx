'use client';
/**
 * components/ai/AIAnalysisPanel.tsx
 * Groq-powered AI analysis panel — full-width card shown below tabs.
 */

import { useState } from 'react';
import { Sparkles, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import type { AIAnalysis } from '@/lib/types';

interface Props {
  analysis: AIAnalysis | null;
  isLoading: boolean;
  onRequestAnalysis: () => void;
}

export default function AIAnalysisPanel({ analysis, isLoading, onRequestAnalysis }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-[#D8DFEE] bg-white">
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEF2F9]">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#F26522]/10">
            <Sparkles className="w-4 h-4 text-[#F26522]" />
          </div>
          <div>
            <span className="text-[11px] font-700 uppercase tracking-[0.12em] text-[#003893] font-sans">
              Groq AI Analysis
            </span>
            {analysis && (
              <span className="ml-2 text-[9px] text-[#8A91A8] font-mono">
                {analysis.model} · {new Date(analysis.generated_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!analysis && !isLoading && (
            <button
              onClick={onRequestAnalysis}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F26522] text-white text-[11px] font-semibold rounded-lg hover:bg-[#D44F0C] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Analyse Inspection
            </button>
          )}
          {isLoading && (
            <div className="flex items-center gap-2 text-[11px] text-[#4A5068]">
              <Loader2 className="w-4 h-4 animate-spin text-[#F26522]" />
              Analysing with Llama 3.3 70B…
            </div>
          )}
          {analysis && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] text-[#003893] hover:text-[#F26522] transition-colors"
            >
              {expanded ? 'Collapse' : 'Expand full report'}
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {analysis && (
        <div className="px-5 py-4">
          {/* Summary */}
          <p className="text-[13px] text-[#1A1D2E] leading-relaxed mb-4 font-sans">
            {analysis.summary}
          </p>

          {/* Critical findings */}
          {analysis.critical_findings.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#CE1726]" />
                <span className="text-[10px] font-700 uppercase tracking-[0.12em] text-[#CE1726]">
                  Critical Findings
                </span>
              </div>
              <ul className="space-y-1.5">
                {analysis.critical_findings.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-[#1A1D2E] font-sans">
                    <span className="text-[#CE1726] mt-0.5 flex-shrink-0">→</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {expanded && (
            <>
              {/* Safety assessment */}
              <div className="mb-4 p-4 bg-[#F7F9FD] rounded-xl border border-[#D8DFEE]">
                <div className="text-[10px] font-700 uppercase tracking-[0.12em] text-[#003893] mb-2">
                  Safety Assessment
                </div>
                <p className="text-[12px] text-[#4A5068] leading-relaxed font-sans">
                  {analysis.safety_assessment}
                </p>
              </div>

              {/* MAHSR feasibility */}
              <div className="mb-4 p-4 bg-[#EEF2F9] rounded-xl border border-[#D8DFEE]">
                <div className="text-[10px] font-700 uppercase tracking-[0.12em] text-[#003893] mb-2">
                  MAHSR Phase 1 Feasibility
                </div>
                <p className="text-[12px] text-[#4A5068] leading-relaxed font-sans">
                  {analysis.mahsr_feasibility}
                </p>
              </div>

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <CheckCircle className="w-3.5 h-3.5 text-[#1B7A45]" />
                    <span className="text-[10px] font-700 uppercase tracking-[0.12em] text-[#1B7A45]">
                      Recommendations
                    </span>
                  </div>
                  <ol className="space-y-2">
                    {analysis.recommendations.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-[#1A1D2E] font-sans">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#003893] text-white text-[10px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        {r}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}

          {!expanded && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-[#1B7A45]" />
                <span className="text-[11px] text-[#1B7A45] font-sans">
                  {analysis.recommendations.length} recommendations
                </span>
              </div>
              <span className="text-[#D8DFEE]">·</span>
              <button
                onClick={onRequestAnalysis}
                className="text-[11px] text-[#003893] hover:text-[#F26522] transition-colors"
              >
                Refresh analysis
              </button>
            </div>
          )}
        </div>
      )}

      {!analysis && !isLoading && (
        <div className="px-5 py-6 text-center">
          <div className="text-[12px] text-[#8A91A8] font-sans mb-1">
            No analysis yet. Load field data and click Analyse Inspection.
          </div>
          <div className="text-[10px] text-[#B8BEC8] font-mono">
            Powered by Llama 3.3 70B via Groq · sub-2s response
          </div>
        </div>
      )}
    </div>
  );
}
