/**
 * physics/traction.ts — TE-V diagram, power budget, maximum speed.
 *
 * Sources:
 *   Iwnicki, S. (Ed.) (2006) Handbook of Railway Vehicle Dynamics, ch.4
 *   Medha Servo Drives traction system specification (VB Chair Car)
 *   Rochard, B.P. & Schmid, F. (2000) Proc. IMechE Part F 214:255–278
 */

import { GRAVITY_MS2 } from '../config';
import { davisResistance, maximumSpeed as aeroMaxSpeed } from './aerodynamics';

/**
 * Base speed (transition from constant-torque to constant-power region).
 * V_base = (2π × f_rated × r_wheel) / (n_pole_pairs × gear_ratio)
 *
 * Simplified using synchronous speed: n_sync = 60 × f / p_pairs (rpm)
 * V_base = (π × d_wheel × n_sync) / (60 × gear_ratio)
 *
 * Source: Medha traction system — rated frequency ~50Hz, 4-pole motor (2 pole pairs)
 *
 * @param motor_freq_Hz   Rated motor frequency, Hz
 * @param motor_rpm       Rated motor speed (≤ synchronous)
 * @param gear_ratio      Motor-to-axle gear ratio
 * @param wheel_dia_m     Wheel diameter, m
 * @returns Base speed, m/s
 */
export function baseSpeed(
  motor_freq_Hz: number,
  motor_rpm: number,
  gear_ratio: number,
  wheel_dia_m: number = 0.952
): number {
  const omega_motor = motor_rpm * 2 * Math.PI / 60;  // rad/s
  const omega_axle  = omega_motor / gear_ratio;
  return omega_axle * (wheel_dia_m / 2);
}

/**
 * Tractive effort at given speed — two-region TE-V diagram.
 *
 * Region 1 (v ≤ V_base): constant torque → F_T = P_rated × η / V_base
 * Region 2 (v > V_base): constant power → F_T = P_rated × η / v
 *
 * Source: Iwnicki (2006) ch.4 Eq. (4.7)
 *
 * @param speed_ms            Train speed, m/s
 * @param motor_rated_power_W Total installed power, W (per axle × n_axles)
 * @param drivetrain_eff      η (0–1)
 * @param base_speed_ms       V_base, m/s
 * @returns Tractive effort, N
 */
export function tractiveEffort(
  speed_ms: number,
  motor_rated_power_W: number,
  drivetrain_eff: number,
  base_speed_ms: number
): number {
  if (speed_ms <= 0) return motor_rated_power_W * drivetrain_eff / Math.max(base_speed_ms, 1);
  if (speed_ms <= base_speed_ms) {
    return motor_rated_power_W * drivetrain_eff / base_speed_ms;
  }
  return motor_rated_power_W * drivetrain_eff / speed_ms;
}

/**
 * Maximum equilibrium speed: TE(v_max) = R(v_max) + P_aux/v_max
 * Uses bisection — same as aerodynamics.maximumSpeed but takes motor params.
 *
 * @returns Max speed, km/h
 */
export function maximumSpeed(params: {
  motor_rated_power_kW: number;
  n_powered_axles: number;
  drivetrain_eff: number;
  base_speed_ms: number;
  A: number; B: number; C: number;
  aux_power_kW: number;
}): number {
  const { motor_rated_power_kW, n_powered_axles, drivetrain_eff, base_speed_ms, A, B, C, aux_power_kW } = params;
  const P_total_W = motor_rated_power_kW * n_powered_axles * 1000;
  const P_aux_W   = aux_power_kW * 1000;

  const residual = (v: number) => {
    const TE = tractiveEffort(v, P_total_W, drivetrain_eff, base_speed_ms);
    const R  = davisResistance(v * 3.6, A, B, C);
    return TE - R - P_aux_W / v;
  };

  // Check at 5 m/s (18 km/h) — avoids P_aux/v blowing up near zero
  if (residual(5) < 0) return 0;
  let lo = 5, hi = 200;
  if (residual(hi) > 0) return hi * 3.6;

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) lo = mid; else hi = mid;
    if (hi - lo < 0.02) break;
  }
  return ((lo + hi) / 2) * 3.6;  // return km/h
}

/**
 * Four-component power budget at a given operating point.
 *
 * P_total = P_traction + P_gradient + P_curve + P_aux
 *
 * Source: Rochard & Schmid (2000) Eq. (2)–(5)
 *         Röckl curve resistance: W_r = 650/r per thousand (Röckl, 1900)
 *
 * @param speed_ms        m/s
 * @param gradient_rad    Track gradient in radians (positive = uphill)
 * @param curve_radius_m  Curve radius (0 = straight)
 * @param train_mass_kg   Total train mass, kg
 * @returns Object with all power components in kW
 */
export function powerBudget(
  speed_ms: number,
  A: number, B: number, C: number,
  train_mass_kg: number,
  gradient_rad: number = 0,
  curve_radius_m: number = 0,
  aux_power_kW: number = 150
): { traction_kW: number; gradient_kW: number; curve_kW: number; aux_kW: number; total_kW: number } {
  const R_davis = davisResistance(speed_ms * 3.6, A, B, C);
  const P_traction = R_davis * speed_ms / 1000;

  // Gradient power: P = M × g × sin(θ) × v
  const P_gradient = train_mass_kg * GRAVITY_MS2 * Math.sin(gradient_rad) * speed_ms / 1000;

  // Curve resistance (Röckl): W_r [N/t] = 650/r for r > 300m
  const W_curve_N_per_t = curve_radius_m > 0 ? 650 / curve_radius_m : 0;
  const P_curve = (W_curve_N_per_t * train_mass_kg / 1000) * speed_ms / 1000;

  const total_kW = P_traction + P_gradient + P_curve + aux_power_kW;
  return { traction_kW: P_traction, gradient_kW: P_gradient, curve_kW: P_curve, aux_kW: aux_power_kW, total_kW };
}

/**
 * TE-V diagram arrays for chart rendering.
 */
export function tevDiagram(params: {
  motor_rated_power_kW: number;
  n_powered_axles: number;
  drivetrain_eff: number;
  base_speed_ms: number;
  A: number; B: number; C: number;
  max_speed_kmh?: number;
  n_points?: number;
}): { speed_kmh: number; te_kN: number; resistance_kN: number }[] {
  const { motor_rated_power_kW, n_powered_axles, drivetrain_eff, base_speed_ms, A, B, C, max_speed_kmh = 320, n_points = 200 } = params;
  const P_total = motor_rated_power_kW * n_powered_axles * 1000;
  const result = [];
  for (let i = 0; i < n_points; i++) {
    const v_kmh = (max_speed_kmh * (i + 1)) / n_points;
    const v_ms = v_kmh / 3.6;
    const te_kN = tractiveEffort(v_ms, P_total, drivetrain_eff, base_speed_ms) / 1000;
    const r_kN  = davisResistance(v_kmh, A, B, C) / 1000;
    result.push({ speed_kmh: v_kmh, te_kN, resistance_kN: r_kN });
  }
  return result;
}
