/**
 * POST /api/ai/quick
 *
 * Lightweight AI endpoint for single-question engineering queries.
 * Uses LLaMA-3.1-8B-Instant (low latency, < 2 s typical) rather than
 * the 70B model used for full inspection analysis.
 *
 * Request body: { question: string, context: string }
 *   question — the engineer's question (e.g. "Is the flange height safe?")
 *   context  — relevant data as a pre-formatted string (caller's responsibility)
 *
 * Response: { answer: string }
 *
 * Results are NOT cached — quick insights are ephemeral and context-dependent.
 * Call volume is expected to be low (interactive dashboard use only).
 *
 * Vercel timeout: 60 s (configured in vercel.json).
 * Runtime: nodejs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateQuickInsight } from '@/lib/groq';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------
interface QuickBody {
  question: string;
  context:  string;
}

function validateBody(body: unknown): body is QuickBody {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.question === 'string' && b.question.trim().length > 0 &&
    typeof b.context  === 'string'
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
            'Request must have shape { question: string (non-empty), context: string }.',
        },
        { status: 400 }
      );
    }

    const { question, context } = body;

    // ── 2. Guard against excessively long payloads ────────────────────────────
    // 8B model context window is 128 k tokens; 20 k chars is a safe cap for
    // dashboard interactions and avoids unexpectedly large Groq bills.
    const MAX_CONTEXT_CHARS = 20_000;
    const MAX_QUESTION_CHARS = 1_000;

    if (question.length > MAX_QUESTION_CHARS) {
      return NextResponse.json(
        { error: `question must be ≤ ${MAX_QUESTION_CHARS} characters. Use /api/ai/analyze for extended analysis.` },
        { status: 400 }
      );
    }

    const truncatedContext =
      context.length > MAX_CONTEXT_CHARS
        ? context.slice(0, MAX_CONTEXT_CHARS) + '\n[context truncated]'
        : context;

    // ── 3. Run Groq inference ──────────────────────────────────────────────────
    const answer = await generateQuickInsight(question, truncatedContext);

    // ── 4. Return ─────────────────────────────────────────────────────────────
    return NextResponse.json({ answer }, { status: 200 });

  } catch (err) {
    console.error('[ai/quick] Unhandled error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
