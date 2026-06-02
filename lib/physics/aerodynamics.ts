/**
 * physics/aerodynamics.ts — Davis resistance, aerodynamic drag, tunnel pressure wave.
 *
 * All SI internally. km/h inputs converted to m/s on first line.
 * Sources cited in each function docstring.
 */

import { RHO_AIR_STD, SPEED_OF_SOUND, GRAVITY_MS2, MAHSR, RTRI_CD_TABLE } from '../config';

// ── Linear interpolation utility ──────────────────────────────────────────────
function lerp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x >= x0 && x <= x1) {
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

/**
 * Davis running resistance: R = A + B·v + C·v²
 *
 * Source: Davis, W.J. (1926) General Electric Review 29:685–708
 *         RDSO MP-0.2401 (2018) — Vande Bharat coefficients
 * Valid: 0–300 km/h for VB coefficients
 *
 * @param speed_kmh  Train speed, km/h
 * @param A          Constant resistance, N
 * @param B          Speed-dependent mechanical, N·s/m
 * @param C          Aerodynamic quadratic, N·s²/m²
 * @returns Resistance in N
 */
export function davisResistance(speed_kmh: number, A: number, B: number, C: number): number {
  if (speed_kmh < 0) throw new Error('speed_kmh must be non-negative');
  const v = speed_kmh / 3.6;   // km/h → m/s
  return A + B * v + C * v * v;
}

/**
 * Aerodynamic drag force: F = ½ρCdA_ref·v²
 *
 * Source: Schlichting, H. & Gersten, K. (2017) Boundary Layer Theory, 9th Ed.
 *         Baker, C.J. (2010) J. Wind Eng. Ind. Aerodyn. 98:277–298
 *
 * @param speed_ms  Train speed, m/s
 * @param rho       Air density, kg/m³
 * @param Cd        Drag coefficient (dimensionless)
 * @param A_ref     Frontal reference area, m²
 * @returns Drag force in N
 */
export function aerodynamicDrag(speed_ms: number, rho: number, Cd: number, A_ref: number): number {
  return 0.5 * rho * Cd * A_ref * speed_ms * speed_ms;
}

/**
 * Cd from nose length — RTRI published table interpolation.
 *
 * Source: RTRI Quarterly Report Vol.45 No.2 (2004) — Nishimura, Fujii, Maeda
 *         Wind tunnel data for Shinkansen 0-series through E5-series.
 *
 * @param nose_length_m  Nose length, m (3–15)
 * @returns Cd (dimensionless)
 */
export function cdFromNoseLength(nose_length_m: number): number {
  return lerp(RTRI_CD_TABLE, nose_length_m);
}

/**
 * Power required to overcome running resistance at given speed.
 * P = R(v) × v
 *
 * Source: Rochard, B.P. & Schmid, F. (2000) Proc. IMechE Part F 214:255–278
 *
 * @returns Power in Watts
 */
export function powerRequired(speed_kmh: number, A: number, B: number, C: number): number {
  const v = speed_kmh / 3.6;
  return davisResistance(speed_kmh, A, B, C) * v;
}

/**
 * Maximum equilibrium speed — solve TE(v_max) = R(v_max) + P_aux/v_max
 * Uses bisection on the residual function.
 *
 * Source: Rochard & Schmid (2000), Brent, R.P. (1973) Algorithms for Minimization Without Derivatives
 *
 * @param installed_power_W  Total installed traction power, W
 * @param drivetrain_eff     Drivetrain efficiency (0–1)
 * @param aux_power_W        Auxiliary power, W (default 150 kW for 16-car VB)
 * @returns Max speed in m/s
 */
export function maximumSpeed(
  A: number, B: number, C: number,
  installed_power_W: number,
  drivetrain_eff: number,
  aux_power_W: number = 150_000
): number {
  const residual = (v: number) => drivetrain_eff * installed_power_W - aux_power_W - (A + B*v + C*v*v) * v;

  // Check if any equilibrium exists
  if (residual(0.1) < 0) return 0;

  // Bisection in [1, 200] m/s (3.6–720 km/h)
  let lo = 1, hi = 200;
  if (residual(hi) > 0) return hi;  // very powerful train

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (residual(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < 0.01) break;
  }
  return (lo + hi) / 2;
}

/**
 * Tunnel entry pressure wave — 1D method of characteristics.
 *
 * Source: EN 14067-5:2020 Section 5.3 — analytical pressure model
 *         Ogawa, T. & Fujii, K. (1997) Computers & Fluids 26(2):135–152
 *         Howe, M.S. et al. (2006) J. Fluid Mech. 538:231–255
 *
 * Returns arrays for plotting. Validity: blockage ratio σ < 0.20.
 *
 * @param tunnel_length_m   Tunnel length, m
 * @param tunnel_area_m2    Tunnel cross-section, m²
 * @param train_area_m2     Train frontal area, m²
 * @param train_speed_ms    Train entry speed, m/s
 * @param nose_length_m     Nose length, m (controls pressure gradient)
 * @param n_points          Number of time steps (default 500)
 */
export function tunnelPressureWave(
  tunnel_length_m: number,
  tunnel_area_m2: number,
  train_area_m2: number,
  train_speed_ms: number,
  nose_length_m: number,
  n_points: number = 500
): { time_s: number[]; pressure_Pa: number[]; dpdt_Pa_s: number[]; max_dpdt: number; peak_pressure_Pa: number; en14067_compliant: boolean } {
  const sigma = train_area_m2 / tunnel_area_m2;  // blockage ratio
  const a = SPEED_OF_SOUND;
  const M = train_speed_ms / a;

  // Initial pressure coefficient at entry (EN 14067-5 Eq. 5.1)
  const Cp = (2 * sigma / Math.pow(1 - sigma, 2)) * M * M;
  const dP_initial = 0.5 * RHO_AIR_STD * a * a * Cp;

  // Nose entry time (finite gradient due to nose length)
  const t_rise = nose_length_m / train_speed_ms;

  // Travel time for wave to reach tunnel exit
  const t_one_way = tunnel_length_m / a;

  // Build time array
  const t_end = t_one_way * 4;  // 4 reflections
  const dt = t_end / n_points;
  const time_s: number[] = Array.from({ length: n_points }, (_, i) => i * dt);

  // Pressure array — superposition of compression/rarefaction waves
  // Compression wave at entry: arrives at t_one_way, reflects as rarefaction
  const pressure_Pa: number[] = new Array(n_points).fill(0);

  const waves = [
    { t_arrive: 0,           sign:  1, desc: 'entry compression' },
    { t_arrive: t_one_way,   sign: -1, desc: 'exit reflection' },
    { t_arrive: 2*t_one_way, sign:  1, desc: 'entry re-reflection' },
    { t_arrive: 3*t_one_way, sign: -1, desc: 'exit re-reflection' },
  ];

  // Friction attenuation: exp(-lambda * x / D_h)
  const D_h = 2 * Math.sqrt(tunnel_area_m2 / Math.PI);
  const lambda_f = 0.02;  // ASSUMED: Darcy-Weisbach friction factor

  for (let i = 0; i < n_points; i++) {
    const t = time_s[i];
    let p = 0;
    for (const w of waves) {
      if (t >= w.t_arrive) {
        const travel = (t - w.t_arrive) * a;
        const attenuation = Math.exp(-lambda_f * travel / D_h);
        // Pressure ramp over nose entry time
        const elapsed = t - w.t_arrive;
        const rise_factor = Math.min(1, elapsed / Math.max(t_rise, 1e-6));
        p += w.sign * dP_initial * rise_factor * attenuation;
      }
    }
    pressure_Pa[i] = p;
  }

  // Compute dp/dt
  const dpdt_Pa_s: number[] = new Array(n_points).fill(0);
  for (let i = 1; i < n_points - 1; i++) {
    dpdt_Pa_s[i] = (pressure_Pa[i+1] - pressure_Pa[i-1]) / (2 * dt);
  }
  dpdt_Pa_s[0] = (pressure_Pa[1] - pressure_Pa[0]) / dt;
  dpdt_Pa_s[n_points - 1] = (pressure_Pa[n_points-1] - pressure_Pa[n_points-2]) / dt;

  const max_dpdt = Math.max(...dpdt_Pa_s.map(Math.abs));
  const peak_pressure_Pa = Math.max(...pressure_Pa.map(Math.abs));
  const en14067_compliant = max_dpdt <= MAHSR.en14067_dpdt_limit;

  return { time_s, pressure_Pa, dpdt_Pa_s, max_dpdt, peak_pressure_Pa, en14067_compliant };
}

/**
 * Drag + resistance curve over speed range — used for tab charts.
 */
export function resistanceCurve(
  A: number, B: number, C: number,
  speeds_kmh: number[],
  rho: number = RHO_AIR_STD,
  Cd: number = 0.30,
  A_ref: number = 11.6,
): { speed_kmh: number; resistance_N: number; aero_N: number; mechanical_N: number }[] {
  return speeds_kmh.map(v => {
    const v_ms = v / 3.6;
    const resistance_N = davisResistance(v, A, B, C);
    const aero_N       = aerodynamicDrag(v_ms, rho, Cd, A_ref);
    const mechanical_N = resistance_N - aero_N;
    return { speed_kmh: v, resistance_N, aero_N, mechanical_N: Math.max(0, mechanical_N) };
  });
}
