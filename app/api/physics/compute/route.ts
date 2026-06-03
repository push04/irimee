/**
 * POST /api/physics/compute
 *
 * Accepts a SimulationParams JSON body, runs all multi-physics domains
 * via computeAllPhysics(), caches the result in the physics_results table,
 * and returns a PhysicsResults object.
 *
 * Vercel timeout: 30 s (configured in vercel.json and enforced below).
 * Runtime: nodejs (required — physics modules use Float64Array math via odex).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { computeAllPhysics } from '@/lib/physics';
import type { SimulationParams } from '@/lib/types';

export const maxDuration = 30;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Input validation — lightweight guard before hitting the physics engine.
// Full Zod schema intentionally omitted here to keep the cold-start small;
// the physics functions themselves validate domain-specific ranges.
// ---------------------------------------------------------------------------
function validateParams(body: unknown): body is SimulationParams {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.gauge_mm      === 'number' &&
    typeof b.nose_length_m === 'number' &&
    typeof b.speed_kmh     === 'number' &&
    typeof b.motor_power_kw === 'number' &&
    (b.disc_type === 'grey_cast_iron' ||
     b.disc_type === 'composite'      ||
     b.disc_type === 'carbon_ceramic') &&
    (b.n_cars === 8 || b.n_cars === 16) &&
    typeof b.preset     === 'string'  &&
    typeof b.mahsr_mode === 'boolean'
  );
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Parse and validate request body ───────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body is not valid JSON.' },
        { status: 400 }
      );
    }

    if (!validateParams(body)) {
      return NextResponse.json(
        {
          error:
            'Invalid SimulationParams. Required fields: gauge_mm (number), ' +
            'nose_length_m (number), speed_kmh (number), motor_power_kw (number), ' +
            'disc_type ("grey_cast_iron"|"composite"|"carbon_ceramic"), ' +
            'n_cars (8|16), preset (string), mahsr_mode (boolean).',
        },
        { status: 400 }
      );
    }

    const params: SimulationParams = body;

    // ── 2. Check cache (Supabase failure must never block physics) ────────────
    try {
      const supabase = createServerClient();
      const { data: cached } = await supabase
        .from('physics_results')
        .select('results, computed_at')
        .eq('params', params as never)   // pass object; PostgREST casts to JSONB
        .order('computed_at', { ascending: false })
        .limit(1)
        .maybeSingle();                  // returns null (not error) when no rows

      if (cached?.results) {
        return NextResponse.json(
          { ...cached.results, _cached: true, computed_at: cached.computed_at },
          { status: 200 }
        );
      }
    } catch (cacheErr) {
      // Cache unavailable — proceed to fresh computation
      console.warn('[physics/compute] Cache check failed, computing fresh:', String(cacheErr));
    }

    // ── 3. Run full physics computation ──────────────────────────────────────
    const results = await computeAllPhysics(params);

    // ── 4. Persist to cache (fire-and-forget, isolated try-catch) ────────────
    try {
      const supabase = createServerClient();
      supabase
        .from('physics_results')
        .insert({
          inspection_id: null,   // param-driven compute, not tied to an inspection
          params:        params,
          results:       results,
          computed_at:   results.computed_at,
        })
        .then(({ error }) => {
          if (error) console.error('[physics/compute] Cache write failed:', error.message);
        });
    } catch {
      // Ignore — cache write failure must never affect the response
    }

    // ── 5. Return computed results ────────────────────────────────────────────
    return NextResponse.json(results, { status: 200 });

  } catch (err) {
    console.error('[physics/compute] Unhandled error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// OPTIONS — needed for cross-origin preflight (CORS headers added by vercel.json)
// ---------------------------------------------------------------------------
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
