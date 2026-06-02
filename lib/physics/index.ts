/**
 * physics/index.ts — Unified physics computation entry point.
 * Bundles all domain modules into a single call for API routes.
 */

export { davisResistance, aerodynamicDrag, cdFromNoseLength, powerRequired, maximumSpeed as aeroMaxSpeed, tunnelPressureWave, resistanceCurve } from './aerodynamics';
export * from './dynamics';
export * from './braking';
export { baseSpeed, tractiveEffort, maximumSpeed as tractionMaxSpeed, powerBudget, tevDiagram } from './traction';

import type { SimulationParams, PhysicsResults, TrainConfig } from '../types';
import { VB_NOMINAL, MAHSR } from '../config';
import { davisResistance, aerodynamicDrag, cdFromNoseLength, powerRequired, maximumSpeed as aeroMaxSpeed, tunnelPressureWave } from './aerodynamics';
import { criticalHuntingSpeed, nadalCriterion, klingelWavelength } from './dynamics';
import { emergencyBrakingODE } from './braking';
import { baseSpeed, tractiveEffort, maximumSpeed as tractionMaxSpeed, powerBudget } from './traction';
import { RHO_AIR_STD, C11_KALKER } from '../config';

/**
 * Run all physics domains for given simulation parameters.
 * Called from API routes (/api/physics/compute).
 */
export async function computeAllPhysics(
  params: SimulationParams,
  config: Partial<typeof VB_NOMINAL> = {}
): Promise<PhysicsResults> {
  const cfg = { ...VB_NOMINAL, ...config };
  const v_ms     = params.speed_kmh / 3.6;
  const gauge_m  = params.gauge_mm / 1000;
  const half_btb = (gauge_m - 0.076) / 2;  // nominal flange-to-gauge margin
  const r0       = cfg.wheel_diameter_mm / 2 / 1000;

  // ── Aerodynamics ─────────────────────────────────────────────────────────
  const Cd    = cdFromNoseLength(params.nose_length_m);
  const A_ref = cfg.car_width_m * cfg.car_height_m;
  const drag_N = aerodynamicDrag(v_ms, RHO_AIR_STD, Cd, A_ref);
  const pwr_W  = powerRequired(params.speed_kmh, cfg.davis_A, cfg.davis_B, cfg.davis_C);
  const vmax_ms = aeroMaxSpeed(
    cfg.davis_A, cfg.davis_B, cfg.davis_C,
    params.motor_power_kw * cfg.n_powered_axles * 1000,
    0.89, 150_000
  );

  // ── Dynamics ──────────────────────────────────────────────────────────────
  const conicity = 0.15;   // nominal; replace with field data when available
  const k_y   = 12e6;     // N/m   — ASSUMED VB primary lateral stiffness
  const k_psi = 45e3;     // N·m/rad — ASSUMED
  const lambda_K = klingelWavelength(r0, half_btb, conicity);
  const v_crit_ms = criticalHuntingSpeed(r0, half_btb, conicity, k_y, k_psi, cfg.bogie_wheelbase_m, C11_KALKER);
  const { yq_ratio, limit, exceeds } = nadalCriterion(
    drag_N * 0.1,   // approximate lateral force (10% of drag) — ASSUMED
    cfg.total_mass_t * 1000 * 9.81 / (cfg.formation_cars * 4),  // per wheel
    68,  // typical flange contact angle, degrees — ASSUMED
    0.35
  );

  // ── Traction ──────────────────────────────────────────────────────────────
  const v_base_ms = baseSpeed(50, 1500, 4.316, r0 * 2);  // Medha VB nominal
  const vmax_kmh  = tractionMaxSpeed({
    motor_rated_power_kW: params.motor_power_kw,
    n_powered_axles:      cfg.n_powered_axles,
    drivetrain_eff:       0.89,
    base_speed_ms:        v_base_ms,
    A: cfg.davis_A, B: cfg.davis_B, C: cfg.davis_C,
    aux_power_kW:         150,
  });
  const budget = powerBudget(v_ms, cfg.davis_A, cfg.davis_B, cfg.davis_C, cfg.total_mass_t * 1000);

  // ── Braking ───────────────────────────────────────────────────────────────
  const braking = emergencyBrakingODE({
    initial_speed_ms:  v_ms,
    disc_diameter_mm:  cfg.disc_diameter_mm,
    disc_thickness_mm: 45,   // nominal new
    n_discs:           cfg.formation_cars * 4 * 2,
    train_mass_kg:     cfg.total_mass_t * 1000,
    disc_material:     params.disc_type,
    ambient_temp_C:    30,
  });

  // ── Tunnel ────────────────────────────────────────────────────────────────
  const tunnel = tunnelPressureWave(
    MAHSR.tunnel_length_m,
    MAHSR.tunnel_area_m2,
    A_ref,
    v_ms,
    params.nose_length_m,
    400
  );

  return {
    aero: {
      drag_N, power_required_W: pwr_W, Cd,
      max_speed_kmh: vmax_ms * 3.6,
      davis_A: cfg.davis_A, davis_B: cfg.davis_B, davis_C: cfg.davis_C,
    },
    dynamics: {
      klingel_wavelength_m: lambda_K,
      critical_hunting_speed_kmh: v_crit_ms * 3.6,
      safety_margin_kmh: v_crit_ms * 3.6 - MAHSR.operational_speed_ph1_kmh,
      nadal_yq: yq_ratio,
      nadal_exceeds: exceeds,
    },
    braking: {
      stopping_distance_m: braking.stopping_distance_m,
      peak_disc_temp_C:    braking.peak_temp_C,
      time_array_s:        braking.time_s,
      speed_array_ms:      braking.speed_ms,
      temp_array_C:        braking.disc_temp_C,
      cycles_remaining_160kmh: 0,  // requires Paris' law with field crack data
      cycles_remaining_250kmh: 0,
    },
    traction: {
      base_speed_kmh:  v_base_ms * 3.6,
      max_speed_kmh:   vmax_kmh,
      te_at_speed_kN:  tractiveEffort(v_ms, params.motor_power_kw * cfg.n_powered_axles * 1000, 0.89, v_base_ms) / 1000,
      power_budget:    budget,
    },
    tunnel: {
      peak_pressure_Pa:    tunnel.peak_pressure_Pa,
      max_dpdt_Pa_per_s:   tunnel.max_dpdt,
      en14067_compliant:   tunnel.en14067_compliant,
      time_array_s:        tunnel.time_s,
      pressure_array_Pa:   tunnel.pressure_Pa,
    },
    computed_at: new Date().toISOString(),
  };
}
