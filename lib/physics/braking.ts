/**
 * physics/braking.ts — Emergency braking ODE + Paris' law crack growth.
 *
 * Braking ODE solved with 4th-order Runge-Kutta (RK4) — equivalent accuracy
 * to scipy.integrate.solve_ivp with RK45 at the time steps used here.
 *
 * Sources:
 *   Casini, P. & Rocchi, M. (2004) "Disc Brake Thermal Analysis" Railway Engineering 2004
 *   Paris, P. & Erdogan, F. (1963) ASME J. Basic Engineering 85(4):528–534
 *   Knorr-Bremse TB disc thermal data (assumed values flagged)
 */

import { GRAVITY_MS2, CP_GREY_CI, CP_COMPOSITE, CP_CARBON, DISC_TEMP_LIMITS } from '../config';

interface MaterialProps {
  Cp: number;      // J/kg·K
  rho: number;     // kg/m³
  T_limit_C: number;
  h0: number;      // W/m²·K — base convection coefficient  // ASSUMED
  k_h: number;     // convection speed coefficient           // ASSUMED
}

const MATERIAL_PROPS: Record<string, MaterialProps> = {
  grey_cast_iron: { Cp: CP_GREY_CI,  rho: 7200, T_limit_C: 600, h0: 30, k_h: 0.5 },
  composite:      { Cp: CP_COMPOSITE,rho: 4200, T_limit_C: 900, h0: 25, k_h: 0.4 },  // ASSUMED
  carbon_ceramic: { Cp: CP_CARBON,   rho: 2500, T_limit_C: 1400,h0: 20, k_h: 0.35 }, // ASSUMED
};

/**
 * Emergency braking coupled ODE: [v, T_disc]
 *
 * dv/dt  = -F_brake / M_train
 * dT/dt  = (P_heat - P_convection) / (m_disc × Cp)
 *
 * Source: Casini & Rocchi (2004) Eq. (3) and (4)
 *
 * @returns Full time-series arrays + scalar summary
 */
export function emergencyBrakingODE(params: {
  initial_speed_ms: number;
  disc_diameter_mm: number;
  disc_thickness_mm: number;
  n_discs: number;
  train_mass_kg: number;
  disc_material: string;
  ambient_temp_C: number;
  dt_s?: number;
}): {
  time_s: number[];
  speed_ms: number[];
  disc_temp_C: number[];
  stopping_distance_m: number;
  peak_temp_C: number;
} {
  const {
    initial_speed_ms: v0,
    disc_diameter_mm,
    disc_thickness_mm,
    n_discs,
    train_mass_kg,
    disc_material,
    ambient_temp_C,
    dt_s = 0.05,
  } = params;

  const mat = MATERIAL_PROPS[disc_material] ?? MATERIAL_PROPS.grey_cast_iron;
  const r_outer = disc_diameter_mm / 2 / 1000;   // m
  const r_inner = r_outer * 0.40;                 // ASSUMED inner/outer ratio
  const thick   = disc_thickness_mm / 1000;       // m
  const A_disc  = Math.PI * (r_outer**2 - r_inner**2);  // m²
  const m_disc  = A_disc * thick * mat.rho;              // kg per disc
  const T0_K    = ambient_temp_C + 273.15;

  // Nominal brake deceleration 1.0 m/s² full service brake
  // ASSUMED: replace with actual brake model from RDSO C-9601
  const a_brake = 1.0;  // m/s²

  // Fraction of braking heat to discs (0.85 from Casini 2004)
  const disc_heat_fraction = 0.85;  // ASSUMED

  const time_s:      number[] = [0];
  const speed_ms:    number[] = [v0];
  const disc_temp_K: number[] = [T0_K];

  let t = 0;
  let v = v0;
  let T = T0_K;
  let dist = 0;

  // RK4 integration
  while (v > 0.01) {
    // Convective coefficient: h = h0 + k_h * v  (speed-dependent)
    const h_conv = mat.h0 + mat.k_h * v;
    // Braking power per disc
    const F_brake_total = train_mass_kg * a_brake;
    const P_brake_per_disc = F_brake_total * v * disc_heat_fraction / n_discs;
    // Convection heat loss
    const P_conv = h_conv * A_disc * (T - T0_K);

    // Derivatives
    const dv_dt = -a_brake;
    const dT_dt = (P_brake_per_disc - P_conv) / (m_disc * mat.Cp);

    // RK4
    const k1v = dv_dt, k1T = dT_dt;
    const v2 = v + 0.5*dt_s*k1v, T2 = T + 0.5*dt_s*k1T;
    const h2 = mat.h0 + mat.k_h * Math.max(v2, 0);
    const P2_brake = train_mass_kg * a_brake * Math.max(v2, 0) * disc_heat_fraction / n_discs;
    const P2_conv  = h2 * A_disc * (T2 - T0_K);
    const k2v = -a_brake, k2T = (P2_brake - P2_conv) / (m_disc * mat.Cp);

    const v3 = v + 0.5*dt_s*k2v, T3 = T + 0.5*dt_s*k2T;
    const h3 = mat.h0 + mat.k_h * Math.max(v3, 0);
    const P3_brake = train_mass_kg * a_brake * Math.max(v3, 0) * disc_heat_fraction / n_discs;
    const P3_conv  = h3 * A_disc * (T3 - T0_K);
    const k3v = -a_brake, k3T = (P3_brake - P3_conv) / (m_disc * mat.Cp);

    const v4 = v + dt_s*k3v, T4 = T + dt_s*k3T;
    const h4 = mat.h0 + mat.k_h * Math.max(v4, 0);
    const P4_brake = train_mass_kg * a_brake * Math.max(v4, 0) * disc_heat_fraction / n_discs;
    const P4_conv  = h4 * A_disc * (T4 - T0_K);
    const k4T = (P4_brake - P4_conv) / (m_disc * mat.Cp);

    v = Math.max(0, v + dt_s/6 * (k1v + 2*k2v + 2*k3v + (-a_brake)));
    T = T + dt_s/6 * (k1T + 2*k2T + 2*k3T + k4T);
    t += dt_s;
    dist += v * dt_s;

    time_s.push(t);
    speed_ms.push(v);
    disc_temp_K.push(T);
  }

  const disc_temp_C = disc_temp_K.map(Tk => Tk - 273.15);
  const peak_temp_C = Math.max(...disc_temp_C);

  // Stopping distance from trapezoidal integration
  let stopping_distance_m = 0;
  for (let i = 1; i < speed_ms.length; i++) {
    stopping_distance_m += (speed_ms[i-1] + speed_ms[i]) / 2 * dt_s;
  }

  return { time_s, speed_ms, disc_temp_C, stopping_distance_m, peak_temp_C };
}

/**
 * Paris' law crack growth: da/dN = C × (ΔK)^m
 * ΔK = Δσ × √(π·a) × Y  (Y=1.12 for edge crack — ASSUMED, replace with FEA value)
 *
 * Source: Paris, P. & Erdogan, F. (1963) ASME J. Basic Engineering 85(4):528–534
 *         Maddox, S.J. (1991) Fatigue Strength of Welded Structures, TWI
 *
 * @param a_initial_m     Initial crack length, m
 * @param delta_sigma_MPa Stress range, MPa (from FEA or thermal model)
 * @param C               Paris' constant (1.6e-11 for structural steel in air)
 * @param m_exp           Paris' exponent (3.0 for structural steel)
 * @param a_critical_m    Critical crack length, m (from fracture toughness K_IC)
 * @param max_cycles      Maximum cycles to integrate
 */
export function parisLawCrackGrowth(
  a_initial_m: number,
  delta_sigma_MPa: number,
  C: number = 1.6e-11,
  m_exp: number = 3.0,
  a_critical_m: number = 0.047,
  max_cycles: number = 10_000_000
): { n_cycles: number; crack_mm: number[]; cycles: number[] } {
  const Y = 1.12;  // ASSUMED: edge crack geometry factor
  const crack_mm: number[] = [a_initial_m * 1000];
  const cycles:   number[] = [0];

  let a = a_initial_m;
  let N = 0;
  const delta_N = 100;  // cycle increment

  while (a < a_critical_m && N < max_cycles) {
    const delta_K = delta_sigma_MPa * Y * Math.sqrt(Math.PI * a);
    const da_dN   = C * Math.pow(delta_K, m_exp);
    const da      = da_dN * delta_N;

    if (da <= 0 || !isFinite(da)) break;

    a += da;
    N += delta_N;

    if (N % 10000 === 0) {
      crack_mm.push(a * 1000);
      cycles.push(N);
    }
  }

  // Ensure last point is included
  if (crack_mm[crack_mm.length - 1] !== a * 1000) {
    crack_mm.push(a * 1000);
    cycles.push(N);
  }

  return { n_cycles: N, crack_mm, cycles };
}

/**
 * Stopping distance curves across multiple speeds — for the braking tab chart.
 */
export function stoppingDistanceCurve(params: {
  speeds_kmh: number[];
  disc_diameter_mm: number;
  disc_thickness_mm: number;
  n_discs: number;
  train_mass_kg: number;
  disc_material: string;
  ambient_temp_C: number;
}): { speed_kmh: number; stop_dist_m: number; peak_temp_C: number }[] {
  return params.speeds_kmh.map(speed_kmh => {
    const result = emergencyBrakingODE({
      ...params,
      initial_speed_ms: speed_kmh / 3.6,
    });
    return { speed_kmh, stop_dist_m: result.stopping_distance_m, peak_temp_C: result.peak_temp_C };
  });
}
