/**
 * POST /api/report
 *
 * Assembles a complete structured report JSON suitable for PDF generation
 * (via jsPDF on the client side) from a stored inspection.
 *
 * Request body: { inspectionId: string }
 *
 * The route:
 *   1. Loads the FieldDataRecord from Supabase (re-uses the same assembly
 *      logic as the field-data/load route — kept in-module to avoid a
 *      server-side HTTP self-call and its latency overhead).
 *   2. Loads the most recent physics_results row for that inspection.
 *   3. Loads the most recent ai_analyses row for that inspection (if any).
 *   4. Compares key measurements against MAHSR specifications.
 *   5. Returns a ReportPayload JSON the client can render into PDF.
 *
 * Vercel timeout: 60 s (configured in vercel.json).
 * Runtime: nodejs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { MAHSR, VB_NOMINAL, DISC_TEMP_LIMITS } from '@/lib/config';
import type {
  FieldDataRecord,
  PhysicsResults,
  AIAnalysis,
  WheelsetMeasurement,
  BrakeDiscMeasurement,
  BogieFrameMeasurement,
  AerodynamicMeasurements,
  PantographMeasurements,
  TractionMeasurements,
  InspectionMetadata,
} from '@/lib/types';

export const maxDuration = 60;
export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Report shape returned to the client
// ---------------------------------------------------------------------------
export interface MAHSRComplianceItem {
  parameter:    string;
  measured:     string;
  required:     string;
  status:       'pass' | 'fail' | 'warning' | 'unknown';
  note:         string;
}

export interface ReportPayload {
  generated_at:     string;
  inspection:       FieldDataRecord;
  physics:          PhysicsResults | null;
  ai_analysis:      AIAnalysis     | null;
  mahsr_compliance: MAHSRComplianceItem[];
  recommendations:  string[];
  report_metadata: {
    inspection_id:  string;
    coach_number:   string;
    location:       string;
    train_type:     string;
    inspector_name: string;
    inspection_date: string;
    report_version: string;
  };
}

// ---------------------------------------------------------------------------
// MAHSR compliance checks
// ---------------------------------------------------------------------------
function buildComplianceTable(
  fieldData:  FieldDataRecord,
  physics:    PhysicsResults | null
): MAHSRComplianceItem[] {
  const items: MAHSRComplianceItem[] = [];

  // Gauge
  const gauge = fieldData.track_gauge_actual_mm;
  items.push({
    parameter: 'Track gauge',
    measured:  gauge != null ? `${gauge} mm` : 'Not measured',
    required:  `${MAHSR.gauge_mm} mm (Standard Gauge)`,
    status:
      gauge == null      ? 'unknown' :
      gauge === MAHSR.gauge_mm ? 'pass' :
      Math.abs(gauge - MAHSR.gauge_mm) <= 3 ? 'warning' : 'fail',
    note: 'MAHSR operates on 1435 mm Standard Gauge. Current VB is BG 1676 mm.',
  });

  // Nose length (EN 14067-4 tunnel pressure)
  const nose = fieldData.aerodynamic_measurements?.nose_length_m;
  items.push({
    parameter: 'Nose length (EN 14067-4)',
    measured:  nose != null ? `${nose.toFixed(2)} m` : 'Not measured',
    required:  '≥ 10 m for 250 km/h tunnel compliance',
    status:
      nose == null ? 'unknown' :
      nose >= 10   ? 'pass' :
      nose >= 7    ? 'warning' : 'fail',
    note: 'Source: RTRI Quarterly Vol.45 No.2 (2004). Short noses cause dp/dt > 3000 Pa/s in MAHSR tunnel.',
  });

  // EN 14067 tunnel compliance from physics
  if (physics?.tunnel) {
    items.push({
      parameter: 'Tunnel dp/dt (EN 14067-4)',
      measured:  `${physics.tunnel.max_dpdt_Pa_per_s.toFixed(0)} Pa/s`,
      required:  `≤ ${MAHSR.en14067_dpdt_limit} Pa/s`,
      status:    physics.tunnel.en14067_compliant ? 'pass' : 'fail',
      note:      `Peak ΔP: ${physics.tunnel.peak_pressure_Pa.toFixed(0)} Pa over 21 km MAHSR tunnel.`,
    });
  }

  // Critical hunting speed vs MAHSR operational speed
  if (physics?.dynamics) {
    const margin = physics.dynamics.safety_margin_kmh;
    items.push({
      parameter: 'Critical hunting speed margin',
      measured:  `V_crit = ${physics.dynamics.critical_hunting_speed_kmh.toFixed(0)} km/h`,
      required:  `> ${MAHSR.operational_speed_ph1_kmh} km/h + 20% safety margin`,
      status:
        margin > MAHSR.operational_speed_ph1_kmh * 0.2 ? 'pass' :
        margin > 0 ? 'warning' : 'fail',
      note:      `Safety margin: ${margin.toFixed(0)} km/h above MAHSR Phase 1 speed. UIC 518 requires V_crit ≥ 1.2 × V_max.`,
    });
  }

  // Wheel diameter (wear limit check — RDSO spec for VB)
  const wheelsets = fieldData.wheelset_measurements;
  if (wheelsets.length > 0) {
    const diameters = wheelsets.flatMap(w => [
      w.wheel_diameter_left_mm,
      w.wheel_diameter_right_mm,
    ]).filter((d): d is number => d != null);

    if (diameters.length > 0) {
      const minDia = Math.min(...diameters);
      // RDSO maintenance manual: condemn limit 838 mm for Vande Bharat BG
      const condemnLimit = 838;
      items.push({
        parameter: 'Minimum wheel diameter (RDSO)',
        measured:  `${minDia.toFixed(1)} mm (worst wheel)`,
        required:  `≥ ${condemnLimit} mm (RDSO condemn limit for VB)`,
        status:    minDia >= condemnLimit + 20 ? 'pass' :
                   minDia >= condemnLimit      ? 'warning' : 'fail',
        note:      `Nominal new: ${VB_NOMINAL.wheel_diameter_mm} mm. Condemn at ${condemnLimit} mm — RDSO Maintenance Manual VB V2.0 (2023).`,
      });
    }
  }

  // Disc thermal crack count
  const discs = fieldData.brake_disc_measurements;
  if (discs.length > 0) {
    const maxCracks = Math.max(...discs.map(d => d.thermal_crack_count ?? 0));
    // ERRI B12 / UIC 541-4: condemn if thermal crack count > 5 or crack length > 50 mm
    items.push({
      parameter: 'Brake disc thermal crack count (UIC 541-4)',
      measured:  `${maxCracks} cracks (worst disc)`,
      required:  '≤ 5 cracks per disc',
      status:    maxCracks === 0 ? 'pass' : maxCracks <= 5 ? 'warning' : 'fail',
      note:      'UIC 541-4 condemn criterion. Disc with > 5 cracks must be replaced before high-speed service.',
    });
  }

  // Pantograph contact strip wear
  const pan = fieldData.pantograph_measurements;
  if (pan?.contact_strip_thickness_mm?.length > 0) {
    const thicknesses = pan.contact_strip_thickness_mm.filter((t): t is number => t != null);
    if (thicknesses.length > 0) {
      const minThick = Math.min(...thicknesses);
      // EN 50367: contact strip condemn < 1.5 mm at any point
      items.push({
        parameter: 'Pantograph contact strip (EN 50367)',
        measured:  `${minThick.toFixed(1)} mm (thinnest point)`,
        required:  '≥ 1.5 mm at all measurement points',
        status:    minThick >= 3.0 ? 'pass' : minThick >= 1.5 ? 'warning' : 'fail',
        note:      'EN 50367 §5.2. Worn strip causes arc damage to 25 kV OHL at HS speeds.',
      });
    }
  }

  // Maximum traction speed vs MAHSR
  if (physics?.traction) {
    items.push({
      parameter: 'Maximum traction speed',
      measured:  `${physics.traction.max_speed_kmh.toFixed(0)} km/h`,
      required:  `≥ ${MAHSR.operational_speed_ph1_kmh} km/h`,
      status:
        physics.traction.max_speed_kmh >= MAHSR.operational_speed_ph1_kmh ? 'pass' :
        physics.traction.max_speed_kmh >= MAHSR.operational_speed_ph1_kmh * 0.9 ? 'warning' : 'fail',
      note:      'Based on installed traction power vs Davis running resistance. Does not account for gradient power.',
    });
  }

  // Peak disc temperature at operational speed
  if (physics?.braking) {
    const discType = 'grey_cast_iron'; // Would ideally come from params
    const tempLimit = DISC_TEMP_LIMITS[discType];
    items.push({
      parameter: `Brake disc peak temperature (${discType.replace(/_/g, ' ')})`,
      measured:  `${physics.braking.peak_disc_temp_C.toFixed(0)} °C`,
      required:  `< ${tempLimit} °C (material limit)`,
      status:
        physics.braking.peak_disc_temp_C < tempLimit * 0.8 ? 'pass' :
        physics.braking.peak_disc_temp_C < tempLimit       ? 'warning' : 'fail',
      note:      'From coupled ODE braking simulation. Exceeding material limit causes disc warping and reduced braking force.',
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Derive top-level recommendations from compliance table + AI analysis
// ---------------------------------------------------------------------------
function deriveRecommendations(
  compliance: MAHSRComplianceItem[],
  aiAnalysis: AIAnalysis | null
): string[] {
  const recs: string[] = [];

  // Physics / measurement based
  const failures = compliance.filter(c => c.status === 'fail');
  const warnings = compliance.filter(c => c.status === 'warning');

  for (const f of failures) {
    recs.push(`CRITICAL — ${f.parameter}: ${f.note}`);
  }
  for (const w of warnings) {
    recs.push(`MONITOR — ${w.parameter}: ${w.note}`);
  }

  // Append AI-generated recommendations (de-duplicated by prefix)
  if (aiAnalysis?.recommendations) {
    for (const rec of aiAnalysis.recommendations) {
      if (!recs.some(r => r.toLowerCase().includes(rec.slice(0, 30).toLowerCase()))) {
        recs.push(rec);
      }
    }
  }

  return recs;
}

// ---------------------------------------------------------------------------
// DB helpers — inline assembly to avoid HTTP self-call latency
// ---------------------------------------------------------------------------
function assembleFieldDataRecord(
  inspection:  Record<string, unknown>,
  wheelsets:   Record<string, unknown>[],
  bogies:      Record<string, unknown>[],
  discs:       Record<string, unknown>[],
  blob:        Record<string, unknown> | null
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

  return {
    id: meta.id,
    inspection_metadata: meta,
    wheelset_measurements: wheelsets.map(w => ({
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
    } as WheelsetMeasurement)),
    bogie_measurements: bogies.map(b => ({
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
      damper_condition:               (b.damper_condition               as BogieFrameMeasurement['damper_condition']) ?? null,
      cracks:                         (b.cracks                         as BogieFrameMeasurement['cracks']) ?? [],
    } as BogieFrameMeasurement)),
    brake_disc_measurements: discs.map(d => ({
      disc_id:               d.disc_id               as string,
      outer_diameter_mm:     (d.outer_diameter_mm     as number | null) ?? null,
      thickness_12pt_mm:     (d.thickness_12pt_mm     as (number | null)[]) ?? [],
      thermal_crack_count:   (d.thermal_crack_count   as number | null) ?? null,
      max_crack_length_mm:   (d.max_crack_length_mm   as number | null) ?? null,
      pad_thickness_mm:      (d.pad_thickness_mm      as number | null) ?? null,
      thermal_discoloration: (d.thermal_discoloration as boolean | null) ?? null,
    } as BrakeDiscMeasurement)),
    aerodynamic_measurements: (blob?.aerodynamic_measurements as AerodynamicMeasurements) ?? {
      nose_length_m: null, car_body_width_skirt_mm: null,
      car_body_width_window_mm: null, car_body_width_roof_mm: null,
      car_body_height_mm: null, inter_car_gap_mm: null,
      bogie_skirt_coverage_pct: null, roof_hvac_height_mm: null,
      roof_hvac_width_mm: null,
    },
    pantograph_measurements: (blob?.pantograph_measurements as PantographMeasurements) ?? {
      contact_strip_thickness_mm: [], static_contact_force_N: null, strip_condition: null,
    },
    traction_measurements: (blob?.traction_measurements as TractionMeasurements) ?? {
      motor_rated_power_kW: null, motor_rated_voltage_V: null,
      motor_rated_frequency_Hz: null, motor_rated_speed_rpm: null,
      motor_insulation_class: null, tcms_motor_temperature_C: [],
      tcms_inverter_temperature_C: [], tcms_dc_link_voltage_V: null,
      ambient_temperature_at_tcms_C: null, speed_at_tcms_reading_kmh: null,
      fault_log: [],
    },
    coupler_height_above_rail_mm: (blob?.coupler_height_mm     as number | null) ?? null,
    track_gauge_actual_mm:        (blob?.track_gauge_actual_mm as number | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
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

    if (
      typeof body !== 'object' || body === null ||
      typeof (body as Record<string, unknown>).inspectionId !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Request must have shape { inspectionId: string }.' },
        { status: 400 }
      );
    }

    const { inspectionId } = body as { inspectionId: string };
    const supabase = createServerClient();

    // ── 2. Load inspection row ────────────────────────────────────────────────
    const { data: inspectionRow, error: inspErr } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();

    if (inspErr || !inspectionRow) {
      return NextResponse.json(
        { error: `Inspection ${inspectionId} not found.` },
        { status: 404 }
      );
    }

    // ── 3. Load all child records in parallel ─────────────────────────────────
    const [wsResult, bgResult, discResult, blobResult, physResult, aiResult] =
      await Promise.all([
        supabase
          .from('wheelset_measurements')
          .select('*')
          .eq('inspection_id', inspectionId),
        supabase
          .from('bogie_measurements')
          .select('*')
          .eq('inspection_id', inspectionId),
        supabase
          .from('brake_disc_measurements')
          .select('*')
          .eq('inspection_id', inspectionId),
        supabase
          .from('inspection_blobs')
          .select('*')
          .eq('inspection_id', inspectionId)
          .single(),
        supabase
          .from('physics_results')
          .select('results, computed_at')
          .eq('inspection_id', inspectionId)
          .order('computed_at', { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from('ai_analyses')
          .select('analysis, model, created_at')
          .eq('inspection_id', inspectionId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ]);

    // ── 4. Assemble FieldDataRecord ────────────────────────────────────────────
    const fieldData = assembleFieldDataRecord(
      inspectionRow as Record<string, unknown>,
      (wsResult.data   ?? []) as Record<string, unknown>[],
      (bgResult.data   ?? []) as Record<string, unknown>[],
      (discResult.data ?? []) as Record<string, unknown>[],
      (blobResult.data ?? null) as Record<string, unknown> | null
    );

    const physics: PhysicsResults | null =
      physResult.data?.results as PhysicsResults | null ?? null;

    const aiAnalysis: AIAnalysis | null =
      aiResult.data?.analysis as AIAnalysis | null ?? null;

    // ── 5. Build compliance table and recommendations ─────────────────────────
    const compliance    = buildComplianceTable(fieldData, physics);
    const recommendations = deriveRecommendations(compliance, aiAnalysis);

    // ── 6. Assemble and return report payload ─────────────────────────────────
    const payload: ReportPayload = {
      generated_at:  new Date().toISOString(),
      inspection:    fieldData,
      physics,
      ai_analysis:   aiAnalysis,
      mahsr_compliance: compliance,
      recommendations,
      report_metadata: {
        inspection_id:   inspectionId,
        coach_number:    fieldData.inspection_metadata.coach_number,
        location:        fieldData.inspection_metadata.location,
        train_type:      fieldData.inspection_metadata.train_type,
        inspector_name:  fieldData.inspection_metadata.inspector_name,
        inspection_date: fieldData.inspection_metadata.date,
        report_version:  '1.0',
      },
    };

    return NextResponse.json(payload, { status: 200 });

  } catch (err) {
    console.error('[report] Unhandled error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}
