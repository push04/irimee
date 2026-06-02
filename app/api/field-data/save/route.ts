/**
 * POST /api/field-data/save
 *
 * Saves a complete FieldDataRecord to Supabase, creating the parent
 * inspection row plus all child records (wheelsets, bogies, brake discs,
 * and the blob row for aero/pantograph/traction) inside a single logical
 * transaction (sequential inserts with rollback on any failure).
 *
 * Returns: { id: uuid }  — the newly created inspection UUID.
 *
 * All inserts use the service-role client so Row Level Security policies
 * do not block server-side writes.
 *
 * Vercel timeout: 30 s (inherits from vercel.json default).
 * Runtime: nodejs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type {
  FieldDataRecord,
  WheelsetMeasurement,
  BogieFrameMeasurement,
  BrakeDiscMeasurement,
} from '@/lib/types';

export const maxDuration = 30;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Minimal shape check — full Zod validation would be preferable for
// production hardening but is out of scope here.
// ---------------------------------------------------------------------------
function validateRecord(body: unknown): body is FieldDataRecord {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  const meta = b.inspection_metadata as Record<string, unknown> | undefined;
  if (!meta) return false;
  return (
    typeof meta.date           === 'string' &&
    (meta.location === 'jheel' || meta.location === 'rncc') &&
    (meta.train_type === 'vb_sleeper' || meta.train_type === 'vb_chair') &&
    typeof meta.coach_number   === 'string' &&
    typeof meta.inspector_name === 'string' &&
    Array.isArray(b.wheelset_measurements) &&
    Array.isArray(b.bogie_measurements) &&
    Array.isArray(b.brake_disc_measurements)
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

    if (!validateRecord(body)) {
      return NextResponse.json(
        {
          error:
            'Invalid FieldDataRecord. inspection_metadata must include date, ' +
            'location ("jheel"|"rncc"), train_type, coach_number, inspector_name. ' +
            'wheelset_measurements, bogie_measurements, and brake_disc_measurements ' +
            'must be arrays.',
        },
        { status: 400 }
      );
    }

    const record: FieldDataRecord = body;
    const meta = record.inspection_metadata;
    const supabase = createServerClient();

    // ── 2. Insert parent inspection row ───────────────────────────────────────
    const { data: inspectionRow, error: inspectionErr } = await supabase
      .from('inspections')
      .insert({
        date:           meta.date,
        location:       meta.location,
        train_type:     meta.train_type,
        coach_number:   meta.coach_number,
        ambient_temp_c: meta.ambient_temperature_C ?? null,
        weather:        meta.weather ?? null,
        inspector_name: meta.inspector_name,
      })
      .select('id')
      .single();

    if (inspectionErr || !inspectionRow) {
      console.error('[field-data/save] inspections insert failed:', inspectionErr?.message);
      return NextResponse.json(
        { error: `Failed to create inspection record: ${inspectionErr?.message ?? 'unknown error'}` },
        { status: 500 }
      );
    }

    const inspectionId: string = inspectionRow.id;

    // ── 3. Helpers — insert child tables, roll back on failure ────────────────
    // Supabase JS client does not expose true multi-statement transactions;
    // we simulate rollback by deleting the inspection row (CASCADE removes children).
    async function rollback(reason: string): Promise<NextResponse> {
      await supabase.from('inspections').delete().eq('id', inspectionId);
      console.error('[field-data/save] rolled back inspection', inspectionId, '—', reason);
      return NextResponse.json({ error: reason }, { status: 500 });
    }

    // ── 4. Wheelset measurements ──────────────────────────────────────────────
    if (record.wheelset_measurements.length > 0) {
      const wheelsetRows = record.wheelset_measurements.map(
        (w: WheelsetMeasurement) => ({
          inspection_id:               inspectionId,
          wheelset_id:                 w.wheelset_id,
          wheel_diameter_left_mm:      w.wheel_diameter_left_mm  ?? null,
          wheel_diameter_right_mm:     w.wheel_diameter_right_mm ?? null,
          flange_height_left_mm:       w.flange_height_left_mm   ?? null,
          flange_height_right_mm:      w.flange_height_right_mm  ?? null,
          flange_thickness_left_mm:    w.flange_thickness_left_mm  ?? null,
          flange_thickness_right_mm:   w.flange_thickness_right_mm ?? null,
          tread_hollow_left_mm:        w.tread_hollow_left_mm   ?? null,
          tread_hollow_right_mm:       w.tread_hollow_right_mm  ?? null,
          back_to_back_mm:             w.back_to_back_mm         ?? null,
          axle_box_clearance_left_mm:  w.axle_box_clearance_left_mm  ?? null,
          axle_box_clearance_right_mm: w.axle_box_clearance_right_mm ?? null,
        })
      );

      const { error: wsErr } = await supabase
        .from('wheelset_measurements')
        .insert(wheelsetRows);

      if (wsErr) return rollback(`Wheelset insert failed: ${wsErr.message}`);
    }

    // ── 5. Bogie measurements (with JSONB cracks array) ───────────────────────
    if (record.bogie_measurements.length > 0) {
      const bogieRows = record.bogie_measurements.map(
        (b: BogieFrameMeasurement) => ({
          inspection_id:                  inspectionId,
          bogie_id:                       b.bogie_id,
          wheelbase_mm:                   b.wheelbase_mm ?? null,
          air_spring_pressure_left_bar:   b.air_spring_pressure_left_bar  ?? null,
          air_spring_pressure_right_bar:  b.air_spring_pressure_right_bar ?? null,
          air_spring_height_fl_mm:        b.air_spring_height_fl_mm ?? null,
          air_spring_height_fr_mm:        b.air_spring_height_fr_mm ?? null,
          air_spring_height_rl_mm:        b.air_spring_height_rl_mm ?? null,
          air_spring_height_rr_mm:        b.air_spring_height_rr_mm ?? null,
          primary_spring_height_fl_mm:    b.primary_spring_height_fl_mm ?? null,
          primary_spring_height_fr_mm:    b.primary_spring_height_fr_mm ?? null,
          damper_condition:               b.damper_condition ?? null,
          cracks:                         b.cracks ?? [],
        })
      );

      const { error: bogieErr } = await supabase
        .from('bogie_measurements')
        .insert(bogieRows);

      if (bogieErr) return rollback(`Bogie insert failed: ${bogieErr.message}`);
    }

    // ── 6. Brake disc measurements ────────────────────────────────────────────
    if (record.brake_disc_measurements.length > 0) {
      const discRows = record.brake_disc_measurements.map(
        (d: BrakeDiscMeasurement) => ({
          inspection_id:       inspectionId,
          disc_id:             d.disc_id,
          outer_diameter_mm:   d.outer_diameter_mm ?? null,
          thickness_12pt_mm:   d.thickness_12pt_mm ?? null,
          thermal_crack_count: d.thermal_crack_count ?? null,
          max_crack_length_mm: d.max_crack_length_mm ?? null,
          pad_thickness_mm:    d.pad_thickness_mm ?? null,
          thermal_discoloration: d.thermal_discoloration ?? null,
        })
      );

      const { error: discErr } = await supabase
        .from('brake_disc_measurements')
        .insert(discRows);

      if (discErr) return rollback(`Brake disc insert failed: ${discErr.message}`);
    }

    // ── 7. JSONB blob: aero, pantograph, traction, coupler, gauge ────────────
    const { error: blobErr } = await supabase
      .from('inspection_blobs')
      .insert({
        inspection_id:            inspectionId,
        aerodynamic_measurements: record.aerodynamic_measurements  ?? null,
        pantograph_measurements:  record.pantograph_measurements   ?? null,
        traction_measurements:    record.traction_measurements     ?? null,
        coupler_height_mm:        record.coupler_height_above_rail_mm ?? null,
        track_gauge_actual_mm:    record.track_gauge_actual_mm     ?? null,
      });

    if (blobErr) return rollback(`Blob insert failed: ${blobErr.message}`);

    // ── 8. All inserts succeeded ──────────────────────────────────────────────
    return NextResponse.json({ id: inspectionId }, { status: 201 });

  } catch (err) {
    console.error('[field-data/save] Unhandled error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
