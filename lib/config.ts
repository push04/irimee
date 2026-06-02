// VBHSR-SIM global constants — all SI unless noted
// Source: ICF Chennai specs, RDSO Maintenance Manual VB V2.0 (2023), Wikipedia confirmed

import type { TrainConfig } from './types';

// Physical constants
export const GRAVITY_MS2     = 9.81;
export const RHO_AIR_STD     = 1.204;   // kg/m³ at 20°C, sea level
export const SPEED_OF_SOUND  = 343.2;   // m/s at 20°C
export const RHO_STEEL       = 7850;    // kg/m³
export const CP_GREY_CI      = 490;     // J/kg·K
export const CP_COMPOSITE    = 750;     // J/kg·K
export const CP_CARBON       = 850;     // J/kg·K
export const C_PARIS_STEEL   = 1.6e-11; // Paris' law C
export const M_PARIS_STEEL   = 3.0;     // Paris' law m
export const C11_KALKER      = 6.0e6;   // N — Kalker creep coeff

// Disc thermal limits (°C)
export const DISC_TEMP_LIMITS = {
  grey_cast_iron: 600,
  composite: 900,
  carbon_ceramic: 1400,
} as const;

// MAHSR specs
export const MAHSR = {
  gauge_mm:                  1435,
  operational_speed_ph1_kmh: 250,
  operational_speed_ph2_kmh: 320,
  tunnel_length_m:           21000,
  tunnel_area_m2:            66.5,
  platform_height_mm:        1250,
  en14067_dpdt_limit:        3000,   // Pa/s
  en14067_dp4s_limit:        6000,   // Pa in 4s
  tsi_noise_250_dba:         80,
  tsi_noise_300_dba:         87,
} as const;

// VB nominal (used when field data null)
export const VB_NOMINAL: Omit<TrainConfig,'name'> = {
  gauge_mm:                  1676,
  car_length_m:              24.0,
  car_width_m:               3.240,
  car_height_m:              4.140,
  nose_length_m:             3.5,
  formation_cars:            16,
  total_mass_t:              720,
  wheel_diameter_mm:         952,
  back_to_back_mm:           1600,
  bogie_wheelbase_m:         2.5,
  motor_rated_power_kw:      210,
  n_powered_axles:           32,
  total_installed_power_kw:  6720,
  max_design_speed_kmh:      180,
  davis_A:                   1900,
  davis_B:                   45,
  davis_C:                   0.80,
  disc_diameter_mm:          640,
  disc_type:                 'grey_cast_iron',
  cd_nominal:                0.30,
  frontal_area_m2:           11.6,
};

export const TRAIN_CONFIGS: Record<string, TrainConfig> = {
  vb_chair: {
    name: 'Vande Bharat — Chair Car',
    ...VB_NOMINAL,
    max_design_speed_kmh: 180,
  },
  vb_sleeper: {
    name: 'Vande Bharat — Sleeper',
    ...VB_NOMINAL,
    total_mass_t: 740,
    davis_A: 1950, davis_B: 47, davis_C: 0.82,
    max_design_speed_kmh: 160,
  },
  b28_target: {
    name: 'B-28 HSR Target (BEML-ICF-Medha)',
    gauge_mm: 1435, car_length_m: 25, car_width_m: 3.38, car_height_m: 4.05,
    nose_length_m: 10, formation_cars: 16, total_mass_t: 680,
    wheel_diameter_mm: 890, back_to_back_mm: 1360, bogie_wheelbase_m: 2.5,
    motor_rated_power_kw: 320, n_powered_axles: 32, total_installed_power_kw: 10240,
    max_design_speed_kmh: 280,
    davis_A: 1800, davis_B: 42, davis_C: 0.68,
    disc_diameter_mm: 660, disc_type: 'composite',
    cd_nominal: 0.21, frontal_area_m2: 11.3,
  },
  e5_shinkansen: {
    name: 'E5 Series Shinkansen (JR East)',
    gauge_mm: 1435, car_length_m: 25, car_width_m: 3.35, car_height_m: 4.5,
    nose_length_m: 15, formation_cars: 10, total_mass_t: 453,
    wheel_diameter_mm: 860, back_to_back_mm: 1353, bogie_wheelbase_m: 2.5,
    motor_rated_power_kw: 300, n_powered_axles: 28, total_installed_power_kw: 9600,
    max_design_speed_kmh: 320,
    davis_A: 1500, davis_B: 35, davis_C: 0.52,
    disc_diameter_mm: 780, disc_type: 'composite',
    cd_nominal: 0.14, frontal_area_m2: 11.0,
  },
  n700s: {
    name: 'N700S Shinkansen (JR Central)',
    gauge_mm: 1435, car_length_m: 27.05, car_width_m: 3.36, car_height_m: 4.5,
    nose_length_m: 10.7, formation_cars: 16, total_mass_t: 860,
    wheel_diameter_mm: 860, back_to_back_mm: 1353, bogie_wheelbase_m: 2.5,
    motor_rated_power_kw: 305, n_powered_axles: 64, total_installed_power_kw: 19520,
    max_design_speed_kmh: 285,
    davis_A: 1600, davis_B: 38, davis_C: 0.58,
    disc_diameter_mm: 780, disc_type: 'composite',
    cd_nominal: 0.20, frontal_area_m2: 11.1,
  },
};

// RTRI Cd vs nose length lookup table
// Source: RTRI Quarterly Vol.45 No.2 (2004), Nishimura et al.
export const RTRI_CD_TABLE: [number, number][] = [
  [3.0, 0.320], [3.5, 0.305], [4.0, 0.291], [4.5, 0.278],
  [5.0, 0.266], [5.5, 0.254], [6.0, 0.244], [6.5, 0.234],
  [7.0, 0.225], [7.5, 0.217], [8.0, 0.209], [8.5, 0.202],
  [9.0, 0.196], [9.5, 0.190], [10.0, 0.184], [10.5, 0.179],
  [11.0, 0.174], [11.5, 0.169], [12.0, 0.164], [12.5, 0.159],
  [13.0, 0.155], [13.5, 0.151], [14.0, 0.147], [14.5, 0.143],
  [15.0, 0.139],
];

// IIW FAT71 S-N curve
// Source: Hobbacher (2008) IIW Recommendations, Table 3.1
export const SN_FAT71 = {
  delta_sigma_at_2e6_MPa: 71,
  slope_m1: 3,
  slope_m2: 5,
  n_transition: 1e7,
  n_cutoff: 1e8,
};
