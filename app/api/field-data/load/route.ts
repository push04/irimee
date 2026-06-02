/**
 * GET /api/field-data/load
 *
 * Query modes:
 *   ?id=<uuid>                    — fetch one specific inspection by UUID
 *   ?location=jheel&limit=10      — fetch recent inspections at a location
 *   ?location=rncc&limit=5
 *
 * Returns an array of fully-hydrated FieldDataRecord objects.
 * Each record assembles the inspection row, all child table rows,
 * and the JSONB blob into the canonical FieldDataRecord shape.
 *
 * All reads use the service-role client so RLS does not block server queries.
 *
 * Vercel timeout: inherits 30 s default.
 * Runtime: nodejs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type {
  FieldDataRecord,
  InspectionMetadata,
  WheelsetMeasurement,
  BogieFrameMeasurement,
  BrakeDiscMeasurement,
  AerodynamicMeasurements,
  PantographMeasurements,
  TractionMeasurements,
} from '@/lib/types';

export const maxDuration = 30;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Reassemble a flat DB row set into FieldDataRecord shape
// ---------------------------------------------------------------------------
function assembleRecord(
  inspection:   Record<string, unknown>,
  wheelsets:    Record<string, unknown>[],
  bogies:       Record<string, unknown>[],
  discs:        Record<string, unknown>[],
  blob:         Record<string, unknown> | null
): FieldDataRecord {
  const meta: InspectionMetadata = {
    id:                    inspection.id           as string,
    date:                  inspection.date         as string,
    location:              inspection.location     as 'jheel' | 'rncc',
    train_type:            inspection.train_type   as 'vb_sleeper' | 'vb_chair',
    coach_number:          inspection.coach_number as string,
    ambient_temperature_C: (inspection.ambient_temp_c as number | null) ?? null,
    weather:               (inspection.weather     as string | null)    ?? '',
    inspector_name:        inspection.inspector_name as string,
    created_at:            inspection.created_at   as string | undefined,
  };

  const wheelsetMeasurements: WheelsetMeasurement[] = wheelsets.map(w => ({
    wheelset_id:                 w.wheelset_id                 as string,
    wheel_diameter_left_mm:      (w.wheel_diameter_left_mm      as number | null) ?? null,
    wheel_diameter_right_mm:     (w.wheel_diameter_right_mm     as number | null) ?? null,
    flange_height_left_mm:       (w.flange_height_left_mm       as number | null) ?? null,
    flange_height_right_mm:      (w.flange_height_right_mm      as number | null) ?? null,
    flange_thickness_left_mm:    (w.flange_thickness_left_mm    as number | null) ?? null,
    flange_thickness_right_mm:   (w.flange_thickness_right_mm   as number | null) ?? null,
    tread_hollow_left_mm:        (w.tread_hollow_left_mm        as number | null) ?? null,
    tread_hollow_right_mm:       (w.tread_hollow_right_mm       as number | null) ?? null,
    back_to_back_mm:             (w.back_to_back_mm             as number | null) ?? null,
    axle_box_clearance_left_mm:  (w.axle_box_clearance_left_mm  as number | null) ?? null,
    axle_box_clearance_right_mm: (w.axle_box_clearance_right_mm as number | null) ?? null,
  }));

  const bogieMeasurements: BogieFrameMeasurement[] = bogies.map(b => ({
    bogie_id:                       b.bogie_id                       as string,
    wheelbase_mm:                   (b.wheelbase_mm                   as number | null) ?? null,
    air_spring_pressure_left_bar:   (b.air_spring_pressure_left_bar   as number | null) ?? null,
    air_spring_pressure_right_bar:  (b.air_spring_pressure_right_bar  as number | null) ?? null,
    air_spring_height_fl_mm:        (b.air_spring_height_fl_mm        as number | null) ?? null,
    air_spring_height_fr_mm:        (b.air_spring_height_fr_mm        as number | null) ?? null,
    air_spring_height_rl_mm:        (b.air_spring_height_rl_mm        as number | null) ?? null,
    air_spring_height_rr_mm:        (b.air_spring_height_rr_mm        as number | null) ?? null,
    primary_spring_height_fl_mm:    (b.primary_spring_height_fl_mm    as number | null) ?? null,
    primary_spring_height_fr_mm:    (b.primary_spring_height_fr_mm    as number | null) ?? null,
    damper_condition:               (b.damper_condition               as 'good' | 'leaking' | 'seized' | null) ?? null,
    cracks:                         (b.cracks                         as BogieFrameMeasurement['cracks']) ?? [],
  }));

  const discMeasurements: BrakeDiscMeasurement[] = discs.map(d => ({
    disc_id:             d.disc_id             as string,
    outer_diameter_mm:   (d.outer_diameter_mm   as number | null) ?? null,
    thickness_12pt_mm:   (d.thickness_12pt_mm   as (number | null)[]) ?? [],
    thermal_crack_count: (d.thermal_crack_count as number | null) ?? null,
    max_crack_length_mm: (d.max_crack_length_mm as number | null) ?? null,
    pad_thickness_mm:    (d.pad_thickness_mm    as number | null) ?? null,
    thermal_discoloration: (d.thermal_discoloration as boolean | null) ?? null,
  }));

  return {
    id:                       meta.id,
    inspection_metadata:      meta,
    wheelset_measurements:    wheelsetMeasurements,
    bogie_measurements:       bogieMeasurements,
    brake_disc_measurements:  discMeasurements,
    aerodynamic_measurements: (blob?.aerodynamic_measurements  as AerodynamicMeasurements)  ?? emptyAero(),
    pantograph_measurements:  (blob?.pantograph_measurements   as PantographMeasurements)   ?? emptyPantograph(),
    traction_measurements:    (blob?.traction_measurements     as TractionMeasurements)     ?? emptyTraction(),
    coupler_height_above_rail_mm: (blob?.coupler_height_mm     as number | null) ?? null,
    track_gauge_actual_mm:        (blob?.track_gauge_actual_mm as number | null) ?? null,
  };
}

// Empty-safe defaults so callers always get a fully-shaped record.
function emptyAero(): AerodynamicMeasurements {
  return {
    nose_length_m: null, car_body_width_skirt_mm: null,
    car_body_width_window_mm: null, car_body_width_roof_mm: null,
    car_body_height_mm: null, inter_car_gap_mm: null,
    bogie_skirt_coverage_pct: null, roof_hvac_height_mm: null,
    roof_hvac_width_mm: null,
  };
}
function emptyPantograph(): PantographMeasurements {
  return { contact_strip_thickness_mm: [], static_contact_force_N: null, strip_condition: null };
}
function emptyTraction(): TractionMeasurements {
  return {
    motor_rated_power_kW: null, motor_rated_voltage_V: null,
    motor_rated_frequency_Hz: null, motor_rated_speed_rpm: null,
    motor_insulation_class: null, tcms_motor_temperature_C: [],
    tcms_inverter_temperature_C: [], tcms_dc_link_voltage_V: null,
    ambient_temperature_at_tcms_C: null, speed_at_tcms_reading_kmh: null,
    fault_log: [],
  };
}

// ---------------------------------------------------------------------------
// Load children for a list of inspection IDs (single parallel fetch set)
// ---------------------------------------------------------------------------
async function loadChildren(
  supabase: ReturnType<typeof createServerClient>,
  inspectionIds: string[]
) {
  const [wsResult, bgResult, discResult, blobResult] = await Promise.all([
    supabase
      .from('wheelset_measurements')
      .select('*')
      .in('inspection_id', inspectionIds),
    supabase
      .from('bogie_measurements')
      .select('*')
      .in('inspection_id', inspectionIds),
    supabase
      .from('brake_disc_measurements')
      .select('*')
      .in('inspection_id', inspectionIds),
    supabase
      .from('inspection_blobs')
      .select('*')
      .in('inspection_id', inspectionIds),
  ]);

  return {
    wheelsets: (wsResult.data   ?? []) as Record<string, unknown>[],
    bogies:    (bgResult.data   ?? []) as Record<string, unknown>[],
    discs:     (discResult.data ?? []) as Record<string, unknown>[],
    blobs:     (blobResult.data ?? []) as Record<string, unknown>[],
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id       = searchParams.get('id');
    const location = searchParams.get('location');
    const limitStr = searchParams.get('limit') ?? '10';

    const limit = Math.min(Math.max(1, parseInt(limitStr, 10) || 10), 100);

    if (!id && !location) {
      return NextResponse.json(
        { error: 'Provide either ?id=<uuid> or ?location=jheel|rncc[&limit=N]' },
        { status: 400 }
      );
    }

    if (location && location !== 'jheel' && location !== 'rncc') {
      return NextResponse.json(
        { error: 'location must be "jheel" or "rncc".' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // ── Fetch inspection row(s) ───────────────────────────────────────────────
    let inspections: Record<string, unknown>[] = [];

    if (id) {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: `Inspection ${id} not found.` },
          { status: 404 }
        );
      }
      inspections = [data as Record<string, unknown>];
    } else {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('location', location!)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return NextResponse.json(
          { error: `Query failed: ${error.message}` },
          { status: 500 }
        );
      }
      inspections = (data ?? []) as Record<string, unknown>[];
    }

    if (inspections.length === 0) {
      return NextResponse.json([], { status: 200 });
    }

    // ── Fetch all child records in parallel ───────────────────────────────────
    const inspectionIds = inspections.map(i => i.id as string);
    const { wheelsets, bogies, discs, blobs } = await loadChildren(supabase, inspectionIds);

    // ── Assemble FieldDataRecord for each inspection ──────────────────────────
    const records: FieldDataRecord[] = inspections.map(inspection => {
      const iid = inspection.id as string;
      return assembleRecord(
        inspection,
        wheelsets.filter(w => (w.inspection_id as string) === iid),
        bogies.filter(b    => (b.inspection_id as string) === iid),
        discs.filter(d     => (d.inspection_id as string) === iid),
        (blobs.find(bl     => (bl.inspection_id as string) === iid) ?? null) as Record<string, unknown> | null
      );
    });

    return NextResponse.json(records, { status: 200 });

  } catch (err) {
    console.error('[field-data/load] Unhandled error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
