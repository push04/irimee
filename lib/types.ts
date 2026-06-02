// VBHSR-SIM — Core TypeScript types
// All measurements in SI unless field explicitly notes mm/bar/kW

export interface InspectionMetadata {
  id?: string;
  date: string;               // YYYY-MM-DD
  location: 'jheel' | 'rncc';
  train_type: 'vb_sleeper' | 'vb_chair';
  coach_number: string;
  ambient_temperature_C: number | null;
  weather: string;
  inspector_name: string;
  created_at?: string;
}

export interface WheelsetMeasurement {
  wheelset_id: string;         // B1A1, B1A2, B2A1, B2A2 …
  wheel_diameter_left_mm: number | null;
  wheel_diameter_right_mm: number | null;
  flange_height_left_mm: number | null;
  flange_height_right_mm: number | null;
  flange_thickness_left_mm: number | null;
  flange_thickness_right_mm: number | null;
  tread_hollow_left_mm: number | null;
  tread_hollow_right_mm: number | null;
  back_to_back_mm: number | null;
  axle_box_clearance_left_mm: number | null;
  axle_box_clearance_right_mm: number | null;
}

export interface CrackObservation {
  location_description: string;
  distance_from_reference_mm: number | null;
  crack_length_mm: number | null;
  crack_depth_mm: number | null;
  photo_url: string | null;
}

export interface BogieFrameMeasurement {
  bogie_id: string;            // B1, B2
  wheelbase_mm: number | null;
  air_spring_pressure_left_bar: number | null;
  air_spring_pressure_right_bar: number | null;
  air_spring_height_fl_mm: number | null;
  air_spring_height_fr_mm: number | null;
  air_spring_height_rl_mm: number | null;
  air_spring_height_rr_mm: number | null;
  primary_spring_height_fl_mm: number | null;
  primary_spring_height_fr_mm: number | null;
  damper_condition: 'good' | 'leaking' | 'seized' | null;
  cracks: CrackObservation[];
}

export interface BrakeDiscMeasurement {
  disc_id: string;             // B1A1OB, B1A1IB …
  outer_diameter_mm: number | null;
  thickness_12pt_mm: (number | null)[];   // 12 values at 30° intervals
  thermal_crack_count: number | null;
  max_crack_length_mm: number | null;
  pad_thickness_mm: number | null;
  thermal_discoloration: boolean | null;
}

export interface AerodynamicMeasurements {
  nose_length_m: number | null;
  car_body_width_skirt_mm: number | null;
  car_body_width_window_mm: number | null;
  car_body_width_roof_mm: number | null;
  car_body_height_mm: number | null;
  inter_car_gap_mm: number | null;
  bogie_skirt_coverage_pct: number | null;
  roof_hvac_height_mm: number | null;
  roof_hvac_width_mm: number | null;
}

export interface PantographMeasurements {
  contact_strip_thickness_mm: (number | null)[];  // 10 values
  static_contact_force_N: number | null;
  strip_condition: 'good' | 'grooved' | 'worn_edge' | null;
}

export interface FaultEvent {
  timestamp: string;
  fault_code: string;
  description: string;
}

export interface TractionMeasurements {
  motor_rated_power_kW: number | null;
  motor_rated_voltage_V: number | null;
  motor_rated_frequency_Hz: number | null;
  motor_rated_speed_rpm: number | null;
  motor_insulation_class: 'B' | 'F' | 'H' | null;
  tcms_motor_temperature_C: (number | null)[];    // 8 values
  tcms_inverter_temperature_C: (number | null)[]; // 4 values
  tcms_dc_link_voltage_V: number | null;
  ambient_temperature_at_tcms_C: number | null;
  speed_at_tcms_reading_kmh: number | null;
  fault_log: FaultEvent[];
}

export interface FieldDataRecord {
  id?: string;
  inspection_metadata: InspectionMetadata;
  wheelset_measurements: WheelsetMeasurement[];
  bogie_measurements: BogieFrameMeasurement[];
  brake_disc_measurements: BrakeDiscMeasurement[];
  aerodynamic_measurements: AerodynamicMeasurements;
  pantograph_measurements: PantographMeasurements;
  traction_measurements: TractionMeasurements;
  coupler_height_above_rail_mm: number | null;
  track_gauge_actual_mm: number | null;
}

// ── Physics outputs ───────────────────────────────────────────────────────────

export interface AeroResult {
  drag_N: number;
  power_required_W: number;
  Cd: number;
  max_speed_kmh: number;
  davis_A: number;
  davis_B: number;
  davis_C: number;
}

export interface DynamicsResult {
  klingel_wavelength_m: number;
  critical_hunting_speed_kmh: number;
  safety_margin_kmh: number;
  nadal_yq: number;
  nadal_exceeds: boolean;
}

export interface BrakingResult {
  stopping_distance_m: number;
  peak_disc_temp_C: number;
  time_array_s: number[];
  speed_array_ms: number[];
  temp_array_C: number[];
  cycles_remaining_160kmh: number;
  cycles_remaining_250kmh: number;
}

export interface TractionResult {
  base_speed_kmh: number;
  max_speed_kmh: number;
  te_at_speed_kN: number;
  power_budget: {
    traction_kW: number;
    gradient_kW: number;
    curve_kW: number;
    aux_kW: number;
    total_kW: number;
  };
}

export interface TunnelResult {
  peak_pressure_Pa: number;
  max_dpdt_Pa_per_s: number;
  en14067_compliant: boolean;
  time_array_s: number[];
  pressure_array_Pa: number[];
}

export interface PhysicsResults {
  aero?: AeroResult;
  dynamics?: DynamicsResult;
  braking?: BrakingResult;
  traction?: TractionResult;
  tunnel?: TunnelResult;
  computed_at: string;
}

// ── Dashboard state ───────────────────────────────────────────────────────────

export interface SimulationParams {
  gauge_mm: number;
  nose_length_m: number;
  speed_kmh: number;
  motor_power_kw: number;
  disc_type: 'grey_cast_iron' | 'composite' | 'carbon_ceramic';
  n_cars: number;
  preset: string;
  mahsr_mode: boolean;
}

export interface MAHSRScore {
  gauge: number;
  speed: number;
  aerodynamics: number;
  braking: number;
  structural: number;
  signalling: number;
  composite: number;
}

export interface AIAnalysis {
  summary: string;
  safety_assessment: string;
  mahsr_feasibility: string;
  recommendations: string[];
  critical_findings: string[];
  model: string;
  generated_at: string;
}

// ── VB Nominal constants ──────────────────────────────────────────────────────

export interface TrainConfig {
  name: string;
  gauge_mm: number;
  car_length_m: number;
  car_width_m: number;
  car_height_m: number;
  nose_length_m: number;
  formation_cars: number;
  total_mass_t: number;
  wheel_diameter_mm: number;
  back_to_back_mm: number;
  bogie_wheelbase_m: number;
  motor_rated_power_kw: number;
  n_powered_axles: number;
  total_installed_power_kw: number;
  max_design_speed_kmh: number;
  davis_A: number;
  davis_B: number;
  davis_C: number;
  disc_diameter_mm: number;
  disc_type: string;
  cd_nominal: number;
  frontal_area_m2: number;
}
