/**
 * POST /api/ai/analyze
 *
 * Accepts { fieldData, physics, params } — a complete inspection context —
 * runs analyzeInspection() via Groq LLaMA-3.3-70B, caches the result in
 * the ai_analyses table, and returns an AIAnalysis object.
 *
 * Cache strategy: if an analysis already exists for the same inspection_id
 * (from inspection_metadata.id), return it without re-calling Groq.
 * The cache can be busted by passing ?refresh=true.
 *
 * Vercel timeout: 60 s (configured in vercel.json).
 * Runtime: nodejs (Groq SDK uses Node fetch under the hood).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { analyzeInspection } from '@/lib/groq';
import type { FieldDataRecord, PhysicsResults, SimulationParams } from '@/lib/types';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------
interface AnalyzeBody {
  fieldData: FieldDataRecord;
  physics:   PhysicsResults;
  params:    SimulationParams;
}

function validateBody(body: unknown): body is AnalyzeBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.fieldData === 'object' && b.fieldData !== null &&
    typeof b.physics   === 'object' && b.physics   !== null &&
    typeof b.params    === 'object' && b.params    !== null
  );
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse body ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body is not valid JSON.' },
        { status: 400 }
      );
    }

    if (!validateBody(body)) {
      return NextResponse.json(
        {
          error:
            'Request must have shape { fieldData: FieldDataRecord, ' +
            'physics: PhysicsResults, params: SimulationParams }.',
        },
        { status: 400 }
      );
    }

    const { fieldData, physics, params } = body;
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const supabase       = createServerClient();
    const inspectionId   = fieldData.inspection_metadata?.id ?? null;

    // ── 2. Cache lookup (skip if ?refresh=true or no inspection ID) ───────────
    if (inspectionId && !forceRefresh) {
      const { data: cached } = await supabase
        .from('ai_analyses')
        .select('analysis, created_at, model')
        .eq('inspection_id', inspectionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.analysis) {
        return NextResponse.json(
          { ...cached.analysis, _cached: true },
          { status: 200 }
        );
      }
    }

    // ── 3. Run Groq inference ──────────────────────────────────────────────────
    const analysis = await analyzeInspection(fieldData, physics, params);

    // ── 4. Persist to cache (non-blocking) ────────────────────────────────────
    if (inspectionId) {
      supabase
        .from('ai_analyses')
        .insert({
          inspection_id: inspectionId,
          analysis:      analysis,
          model:         analysis.model,
          created_at:    analysis.generated_at,
        })
        .then(({ error }) => {
          if (error) {
            console.error('[ai/analyze] Cache write failed:', error.message);
          }
        });
    }

    // ── 5. Return ─────────────────────────────────────────────────────────────
    return NextResponse.json(analysis, { status: 200 });

  } catch (err) {
    console.error('[ai/analyze] Unhandled error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
