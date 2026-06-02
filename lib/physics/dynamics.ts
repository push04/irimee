/**
 * physics/dynamics.ts — Klingel-Boedecker hunting stability, Nadal criterion.
 *
 * Sources:
 *   Wickens, A.H. (2003) Fundamentals of Rail Vehicle Dynamics, Swets & Zeitlinger
 *   UIC 518:2009 — Testing and approval of railway vehicles from the point of view of dynamic behaviour
 *   UIC 519:2004 — Method for determining equivalent conicity
 *   Nadal, M.J. (1908) Locomotives à vapeur, Techniques Ferroviaires
 */

import { C11_KALKER } from '../config';

/**
 * Klingel hunting wavelength.
 * λ = 2π × √(r₀ × a² / δ)
 *
 * Source: Klingel, W. (1883) Organ für die Fortschritte des Eisenbahnwesens 38:113–123
 *         Wickens (2003) p.78, Eq. (3.10)
 *
 * Valid for small lateral displacements |y| < 3mm.
 *
 * @param wheel_radius_m      Rolling radius r₀, m
 * @param half_backtoback_m   Half back-to-back distance a, m
 * @param conicity            Equivalent conicity δ (dimensionless, 0.05–0.30 typical)
 * @returns Hunting wavelength λ, m
 */
export function klingelWavelength(
  wheel_radius_m: number,
  half_backtoback_m: number,
  conicity: number
): number {
  if (conicity <= 0) throw new Error('Conicity must be positive');
  if (wheel_radius_m <= 0 || half_backtoback_m <= 0) throw new Error('Dimensions must be positive');
  return 2 * Math.PI * Math.sqrt(wheel_radius_m * half_backtoback_m * half_backtoback_m / conicity);
}

/**
 * Critical hunting speed — Boedecker approximation.
 *
 * V_crit = (a / C11) × √(k_y × k_ψ × (1 + Λ²))  — linearised eigenvalue formulation
 *
 * Where Λ = k_ψ / (k_y × L²), L = bogie_wheelbase/2
 *
 * Source: Boedecker (1887) as cited in Wickens (2003) p.120, Eq. (5.10)
 *         Iwnicki, S. (Ed.) (2006) Handbook of Railway Vehicle Dynamics, Taylor & Francis p.234
 *
 * @param wheel_radius_m     m
 * @param half_backtoback_m  m
 * @param conicity           dimensionless
 * @param k_y_N_per_m        Lateral suspension stiffness per wheelset, N/m
 * @param k_psi_Nm_per_rad   Yaw stiffness per wheelset, N·m/rad
 * @param bogie_wheelbase_m  Bogie wheelbase, m
 * @param C11                Kalker longitudinal creep coefficient, N (default 6×10⁶)
 * @returns Critical speed, m/s
 */
export function criticalHuntingSpeed(
  wheel_radius_m: number,
  half_backtoback_m: number,
  conicity: number,
  k_y_N_per_m: number,
  k_psi_Nm_per_rad: number,
  bogie_wheelbase_m: number,
  C11: number = C11_KALKER
): number {
  if (conicity <= 0 || wheel_radius_m <= 0) return 0;
  const a    = half_backtoback_m;
  const r0   = wheel_radius_m;
  const L    = bogie_wheelbase_m / 2;   // half-wheelbase
  const delta = conicity;

  // Creep stiffness: k_c = C11 × δ × a / r0  (linearised lateral creep force coefficient)
  const k_c = C11 * delta * a / r0;

  // Critical speed (Boedecker-Wickens linearised):
  // V_crit² = (a² / (C11 × δ)) × (k_y + k_psi / L²) × k_psi / (k_c × a)
  // Simplified form used in practice:
  const Lambda = k_psi_Nm_per_rad / (k_y_N_per_m * L * L);
  const V_crit_sq = (a * a / (k_c * delta)) * k_y_N_per_m * k_psi_Nm_per_rad * (1 + Lambda * Lambda);

  if (V_crit_sq <= 0) return 0;
  return Math.sqrt(V_crit_sq);
}

/**
 * Nadal derailment criterion: Y/Q ≤ (tan α - μ) / (1 + μ tan α)
 *
 * Source: Nadal (1908), UIC 518:2009 Annex B Eq. (B.1)
 *
 * @param lateral_force_N    Lateral wheel-rail force Y, N
 * @param vertical_force_N   Vertical wheel-rail force Q, N
 * @param contact_angle_deg  Flange contact angle α, degrees
 * @param friction_coeff     Wheel-rail friction μ (0.35–0.45 steel-steel)
 * @returns { yq_ratio, limit, exceeds }
 */
export function nadalCriterion(
  lateral_force_N: number,
  vertical_force_N: number,
  contact_angle_deg: number,
  friction_coeff: number
): { yq_ratio: number; limit: number; exceeds: boolean } {
  if (vertical_force_N <= 0) throw new Error('Vertical force must be positive');
  const tan_a = Math.tan(contact_angle_deg * Math.PI / 180);
  const limit  = (tan_a - friction_coeff) / (1 + friction_coeff * tan_a);
  const yq_ratio = lateral_force_N / vertical_force_N;
  return { yq_ratio, limit, exceeds: yq_ratio > limit };
}

/**
 * Critical hunting speed over a gauge sweep — for the V_crit vs gauge chart.
 */
export function huntingCurveVsGauge(
  wheel_radius_m: number = 0.476,
  conicity: number = 0.15,
  k_y: number = 12e6,
  k_psi: number = 45e3,
  bogie_wb: number = 2.5,
  gauge_range_mm: [number, number] = [1435, 1676],
  n_points: number = 80
): { gauge_mm: number; v_crit_kmh: number }[] {
  const result = [];
  const [g_lo, g_hi] = gauge_range_mm;
  for (let i = 0; i < n_points; i++) {
    const gauge_mm = g_lo + (g_hi - g_lo) * i / (n_points - 1);
    const btb_m     = (gauge_mm / 1000) - 0.076;  // nominal flange-to-gauge
    const half_btb  = btb_m / 2;
    const v_ms = criticalHuntingSpeed(wheel_radius_m, half_btb, conicity, k_y, k_psi, bogie_wb);
    result.push({ gauge_mm, v_crit_kmh: v_ms * 3.6 });
  }
  return result;
}

/**
 * Nadal limit curve vs contact angle — for the Y/Q chart.
 */
export function nadalLimitCurve(
  friction_values: number[] = [0.35, 0.45],
  angle_range_deg: [number, number] = [35, 75],
  n_points: number = 60
): { angle_deg: number; limit_mu035: number; limit_mu045: number }[] {
  const result = [];
  const [a_lo, a_hi] = angle_range_deg;
  for (let i = 0; i < n_points; i++) {
    const angle = a_lo + (a_hi - a_lo) * i / (n_points - 1);
    const tan_a = Math.tan(angle * Math.PI / 180);
    const limits = friction_values.map(mu => (tan_a - mu) / (1 + mu * tan_a));
    result.push({ angle_deg: angle, limit_mu035: limits[0], limit_mu045: limits[1] });
  }
  return result;
}
