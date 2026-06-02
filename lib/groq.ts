import Groq from 'groq-sdk';
import type { PhysicsResults, FieldDataRecord, SimulationParams, AIAnalysis } from './types';
import { MAHSR } from './config';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a senior railway engineer at IRIMEE (Indian Railway Institute of Mechanical and Electrical Engineering), Jamalpur, with deep expertise in high-speed rail dynamics, structural fatigue, aerodynamics, and traction systems. You are analyzing Vande Bharat trainset field inspection data and multi-physics simulation results for the MAHSR (Mumbai-Ahmedabad High Speed Rail) feasibility study.

Your analysis must be:
- Technically precise with specific numerical values
- Referenced to published standards (EN 14067, UIC 518, RDSO specifications, ERRI B12)
- Actionable — every finding leads to a specific engineering recommendation
- Honest about limitations — flag assumptions and missing data clearly
- Grounded in Indian Railways context — compare against RDSO and MAHSR specifications

MAHSR Phase 1 specs: 1435mm SG, 250 km/h operational, 350 km/h design, 25kV 50Hz, DS-ATC.
Current Vande Bharat: 1676mm BG, 160 km/h operational, 6720 kW installed (32 × 210 kW).
B-28 programme target: 280 km/h design, 250 km/h operational, SG, first rollout Dec 2026.`;

export async function analyzeInspection(
  fieldData: FieldDataRecord,
  physics: PhysicsResults,
  params: SimulationParams
): Promise<AIAnalysis> {
  const prompt = buildAnalysisPrompt(fieldData, physics, params);

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: prompt },
    ],
    temperature: 0.3,
    max_tokens: 2048,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  return {
    summary:           parsed.summary           ?? 'Analysis unavailable',
    safety_assessment: parsed.safety_assessment ?? '',
    mahsr_feasibility: parsed.mahsr_feasibility ?? '',
    recommendations:   parsed.recommendations   ?? [],
    critical_findings: parsed.critical_findings ?? [],
    model: 'llama-3.3-70b-versatile',
    generated_at: new Date().toISOString(),
  };
}

function buildAnalysisPrompt(
  fd: FieldDataRecord,
  ph: PhysicsResults,
  params: SimulationParams
): string {
  const meta = fd.inspection_metadata;

  const wheelsetSummary = fd.wheelset_measurements.map(w =>
    `${w.wheelset_id}: Ø${w.wheel_diameter_left_mm ?? '?'}mm left / ${w.wheel_diameter_right_mm ?? '?'}mm right, B-T-B: ${w.back_to_back_mm ?? '?'}mm, flange H: ${w.flange_height_left_mm ?? '?'}/${w.flange_height_right_mm ?? '?'}mm`
  ).join('\n');

  const crackSummary = fd.bogie_measurements.flatMap(b =>
    b.cracks.map(c => `${b.bogie_id}: ${c.location_description} — length ${c.crack_length_mm ?? '?'}mm, depth ${c.crack_depth_mm ?? '?'}mm`)
  ).join('\n') || 'No cracks observed';

  const discSummary = fd.brake_disc_measurements.map(d =>
    `${d.disc_id}: Ø${d.outer_diameter_mm ?? '?'}mm, avg thickness ${d.thickness_12pt_mm?.filter(Boolean).reduce((a, b) => a! + b!, 0)! / d.thickness_12pt_mm?.filter(Boolean).length || '?'}mm, cracks: ${d.thermal_crack_count ?? 0}, max crack: ${d.max_crack_length_mm ?? 0}mm`
  ).join('\n');

  return `Analyze this Vande Bharat field inspection and simulation results. Return JSON with keys:
{
  "summary": "2-3 sentence executive summary",
  "safety_assessment": "detailed safety assessment with specific values and standards",
  "mahsr_feasibility": "MAHSR Phase 1 feasibility assessment with specific gaps",
  "recommendations": ["actionable recommendation 1", "..."],
  "critical_findings": ["critical issue 1 with specific value", "..."]
}

INSPECTION DETAILS:
- Coach: ${meta.coach_number} | Type: ${meta.train_type} | Location: ${meta.location.toUpperCase()}
- Date: ${meta.date} | Inspector: ${meta.inspector_name}
- Ambient: ${meta.ambient_temperature_C ?? '?'}°C

SIMULATION PARAMETERS:
- Speed: ${params.speed_kmh} km/h | Gauge: ${params.gauge_mm}mm | Nose: ${params.nose_length_m}m
- Motor power: ${params.motor_power_kw} kW × 32 axes | Disc: ${params.disc_type}

WHEEL/AXLE MEASUREMENTS:
${wheelsetSummary}

BOGIE CRACK OBSERVATIONS:
${crackSummary}

BRAKE DISC MEASUREMENTS:
${discSummary}

PHYSICS SIMULATION RESULTS:
- Aerodynamics: drag ${ph.aero?.drag_N ? (ph.aero.drag_N/1000).toFixed(1) : '?'} kN, Cd=${ph.aero?.Cd?.toFixed(3) ?? '?'}, max speed ${ph.aero?.max_speed_kmh?.toFixed(0) ?? '?'} km/h
- Dynamics: V_crit=${ph.dynamics?.critical_hunting_speed_kmh?.toFixed(0) ?? '?'} km/h (margin: ${ph.dynamics?.safety_margin_kmh?.toFixed(0) ?? '?'} km/h vs MAHSR 250)
- Braking: stop distance ${ph.braking?.stopping_distance_m?.toFixed(0) ?? '?'} m, peak disc ${ph.braking?.peak_disc_temp_C?.toFixed(0) ?? '?'}°C
- Traction: max speed ${ph.traction?.max_speed_kmh?.toFixed(0) ?? '?'} km/h, installed ${params.motor_power_kw * 32 / 1000} MW
- Tunnel: peak ΔP=${ph.tunnel?.peak_pressure_Pa?.toFixed(0) ?? '?'} Pa, dp/dt=${ph.tunnel?.max_dpdt_Pa_per_s?.toFixed(0) ?? '?'} Pa/s (EN14067 limit: ${MAHSR.en14067_dpdt_limit} Pa/s)

MAHSR REQUIREMENTS: 1435mm SG, 250 km/h, 350 km/h design, 25kV 50Hz, ≥10m nose for EN14067 compliance at 250 km/h.`;
}

export async function generateQuickInsight(question: string, context: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer in 2-3 sentences, technically precise.` },
    ],
    temperature: 0.2,
    max_tokens: 256,
  });
  return completion.choices[0]?.message?.content ?? '';
}
