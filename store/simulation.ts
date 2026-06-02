/**
 * store/simulation.ts — Zustand global state for the VBHSR-SIM dashboard.
 *
 * Holds simulation parameters, physics results, field data context,
 * and UI state. All physics output arrives here via the /api/physics/compute
 * route and is read by dashboard components.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  SimulationParams,
  PhysicsResults,
  FieldDataRecord,
  MAHSRScore,
  AIAnalysis,
  InspectionMetadata,
} from '@/lib/types';
import { TRAIN_CONFIGS } from '@/lib/config';

// ── Default simulation parameters ─────────────────────────────────────────────

export const DEFAULT_PARAMS: SimulationParams = {
  gauge_mm:       1676,
  nose_length_m:  3.5,
  speed_kmh:      160,
  motor_power_kw: 210,
  disc_type:      'grey_cast_iron',
  n_cars:         16,
  preset:         'vb_chair',
  mahsr_mode:     false,
};

// ── Computation status ─────────────────────────────────────────────────────────

export type ComputeStatus = 'idle' | 'computing' | 'done' | 'error';

// ── Left panel mode ────────────────────────────────────────────────────────────

export type LeftPanelMode = 'navigation' | 'field_data';

// ── Active simulation tab ──────────────────────────────────────────────────────

export type SimTab =
  | 'overview'
  | 'aerodynamics'
  | 'dynamics'
  | 'braking'
  | 'structural'
  | 'traction'
  | 'tunnel'
  | 'acoustics'
  | 'mahsr'
  | 'report';

// ── Store shape ────────────────────────────────────────────────────────────────

export interface SimulationStore {
  // Simulation configuration
  params: SimulationParams;
  setParams: (patch: Partial<SimulationParams>) => void;
  applyPreset: (presetKey: string) => void;

  // Physics results
  results: PhysicsResults | null;
  computeStatus: ComputeStatus;
  computeError: string | null;
  runCompute: () => Promise<void>;

  // MAHSR readiness scores (derived from results)
  mahsrScore: MAHSRScore | null;

  // Field data
  fieldData: FieldDataRecord | null;
  setFieldData: (data: FieldDataRecord) => void;
  clearFieldData: () => void;
  fieldDataCompleteness: number;   // 0–100 %

  // AI analysis
  aiAnalysis: AIAnalysis | null;
  aiLoading: boolean;
  runAIAnalysis: () => Promise<void>;

  // UI state
  activeTab: SimTab;
  setActiveTab: (tab: SimTab) => void;
  leftPanelMode: LeftPanelMode;
  setLeftPanelMode: (mode: LeftPanelMode) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

// ── MAHSR score computation (derived) ─────────────────────────────────────────

function deriveMahsrScore(results: PhysicsResults, params: SimulationParams): MAHSRScore {
  // Gauge: 0 if gauge_mm !== 1435, 100 if matches MAHSR standard gauge
  const gauge = params.gauge_mm === 1435 ? 100 : Math.max(0, 100 - Math.abs(params.gauge_mm - 1435) * 0.2);

  // Speed: score relative to 250 km/h Phase 1 requirement
  const speedTarget = 250;
  const speedMax    = results.traction?.max_speed_kmh ?? 0;
  const speed       = Math.min(100, (speedMax / speedTarget) * 100);

  // Aerodynamics: score from Cd vs MAHSR target (E5 class: Cd ≈ 0.14 at 250 km/h)
  const Cd          = results.aero?.Cd ?? 0.32;
  const aero        = Math.min(100, Math.max(0, (0.32 - Cd) / (0.32 - 0.14) * 100));

  // Braking: score from stopping distance vs 250 km/h MAHSR requirement (≤ 3500 m)
  const stopDist    = results.braking?.stopping_distance_m ?? 9999;
  const braking     = Math.min(100, Math.max(0, (3500 - (stopDist - 3500)) / 3500 * 100));

  // Structural: score from Nadal Y/Q margin (0.8 is limit; lower is better)
  const yq          = results.dynamics?.nadal_yq ?? 0.8;
  const structural  = yq >= 0.8 ? 0 : Math.min(100, (1 - yq / 0.8) * 100);

  // Signalling: placeholder — requires OCS/ATP fitment data
  const signalling  = params.mahsr_mode ? 75 : 0;

  const composite = (gauge * 0.25 + speed * 0.25 + aero * 0.20 + braking * 0.15 + structural * 0.10 + signalling * 0.05);

  return { gauge, speed, aerodynamics: aero, braking, structural, signalling, composite };
}

// ── Field data completeness computation ──────────────────────────────────────

function computeCompleteness(fd: FieldDataRecord | null): number {
  if (!fd) return 0;

  // Count non-null leaf values vs total expected leaf values
  // Simplified heuristic: check key measurement arrays for null density
  let filled = 0;
  let total  = 0;

  const check = (v: unknown) => {
    total++;
    if (v !== null && v !== undefined) filled++;
  };

  fd.wheelset_measurements.forEach(w => {
    [w.wheel_diameter_left_mm, w.wheel_diameter_right_mm, w.flange_height_left_mm,
     w.flange_height_right_mm, w.back_to_back_mm, w.tread_hollow_left_mm,
     w.tread_hollow_right_mm].forEach(check);
  });

  fd.bogie_measurements.forEach(b => {
    [b.air_spring_pressure_left_bar, b.air_spring_pressure_right_bar,
     b.air_spring_height_fl_mm, b.air_spring_height_fr_mm,
     b.primary_spring_height_fl_mm, b.primary_spring_height_fr_mm].forEach(check);
  });

  fd.brake_disc_measurements.forEach(d => {
    [d.outer_diameter_mm, d.pad_thickness_mm, d.thermal_crack_count].forEach(check);
    (d.thickness_12pt_mm ?? []).forEach(check);
  });

  const a = fd.aerodynamic_measurements;
  [a.nose_length_m, a.car_body_width_skirt_mm, a.car_body_height_mm,
   a.inter_car_gap_mm].forEach(check);

  const p = fd.pantograph_measurements;
  [p.static_contact_force_N, p.strip_condition].forEach(check);
  (p.contact_strip_thickness_mm ?? []).forEach(check);

  const t = fd.traction_measurements;
  [t.motor_rated_power_kW, t.motor_rated_frequency_Hz, t.tcms_dc_link_voltage_V].forEach(check);

  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

// ── Store implementation ───────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationStore>()(
  subscribeWithSelector((set, get) => ({
    // ── Parameters ──────────────────────────────────────────────────────────
    params: { ...DEFAULT_PARAMS },

    setParams: (patch) => {
      set(s => ({ params: { ...s.params, ...patch } }));
    },

    applyPreset: (presetKey) => {
      const cfg = TRAIN_CONFIGS[presetKey];
      if (!cfg) return;
      set(s => ({
        params: {
          ...s.params,
          gauge_mm:       cfg.gauge_mm,
          nose_length_m:  cfg.nose_length_m,
          motor_power_kw: cfg.motor_rated_power_kw,
          disc_type:      cfg.disc_type as SimulationParams['disc_type'],
          n_cars:         cfg.formation_cars,
          preset:         presetKey,
        },
      }));
    },

    // ── Results ──────────────────────────────────────────────────────────────
    results:       null,
    computeStatus: 'idle',
    computeError:  null,
    mahsrScore:    null,

    runCompute: async () => {
      const { params } = get();
      set({ computeStatus: 'computing', computeError: null });

      try {
        const res = await fetch('/api/physics/compute', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ params }),
        });

        if (!res.ok) {
          const err = await res.text();
          set({ computeStatus: 'error', computeError: err });
          return;
        }

        const data: PhysicsResults = await res.json();
        const mahsrScore = deriveMahsrScore(data, params);
        set({ results: data, computeStatus: 'done', mahsrScore });
      } catch (err) {
        set({
          computeStatus: 'error',
          computeError: err instanceof Error ? err.message : 'Unknown compute error',
        });
      }
    },

    // ── Field data ───────────────────────────────────────────────────────────
    fieldData:           null,
    fieldDataCompleteness: 0,

    setFieldData: (data) => {
      set({ fieldData: data, fieldDataCompleteness: computeCompleteness(data) });
    },

    clearFieldData: () => {
      set({ fieldData: null, fieldDataCompleteness: 0 });
    },

    // ── AI analysis ──────────────────────────────────────────────────────────
    aiAnalysis: null,
    aiLoading:  false,

    runAIAnalysis: async () => {
      const { results, fieldData, params } = get();
      if (!results) return;
      set({ aiLoading: true });

      try {
        const res = await fetch('/api/ai/analyse', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ results, fieldData, params }),
        });

        if (res.ok) {
          const analysis: AIAnalysis = await res.json();
          set({ aiAnalysis: analysis });
        }
      } finally {
        set({ aiLoading: false });
      }
    },

    // ── UI ───────────────────────────────────────────────────────────────────
    activeTab:     'overview',
    setActiveTab:  (tab) => set({ activeTab: tab }),

    leftPanelMode:    'navigation',
    setLeftPanelMode: (mode) => set({ leftPanelMode: mode }),

    settingsOpen:    false,
    setSettingsOpen: (open) => set({ settingsOpen: open }),
  }))
);

// ── Selector hooks — avoid re-renders on unrelated state changes ──────────────
// Usage: const params = useParams(); — subscribes only to the params slice.

/** Subscribe only to simulation params */
export const useParams = () => useSimulationStore((s) => s.params);

/** Subscribe only to physics results */
export const usePhysicsResults = () => useSimulationStore((s) => s.results);

/** Subscribe only to field data */
export const useFieldData = () => useSimulationStore((s) => s.fieldData);

/** Subscribe only to AI analysis output */
export const useAIAnalysis = () => useSimulationStore((s) => s.aiAnalysis);

/** Subscribe only to loading/compute state flags */
export const useLoadingState = () =>
  useSimulationStore((s) => ({
    isComputingPhysics: s.computeStatus === 'computing',
    isAnalyzing:        s.aiLoading,
    computeStatus:      s.computeStatus,
    computeError:       s.computeError,
  }));

/** Subscribe only to the active tab */
export const useSelectedTab = () => useSimulationStore((s) => s.activeTab);

/** Subscribe only to the MAHSR readiness score */
export const useMahsrScore = () => useSimulationStore((s) => s.mahsrScore);

/** Subscribe only to field data completeness percentage */
export const useFieldDataCompleteness = () =>
  useSimulationStore((s) => s.fieldDataCompleteness);

// ── Preset configurations ─────────────────────────────────────────────────────
// Full SimulationParams for each named train preset.
// Used by <PresetSelect> in ControlStrip and by the applyPreset action.

export const PRESETS: Record<string, SimulationParams & { label: string }> = {
  vb_chair: {
    label:          'Vande Bharat — Chair Car',
    gauge_mm:       1676,
    nose_length_m:  3.5,
    speed_kmh:      160,
    motor_power_kw: 210,
    disc_type:      'grey_cast_iron',
    n_cars:         16,
    preset:         'vb_chair',
    mahsr_mode:     false,
  },
  vb_sleeper: {
    label:          'Vande Bharat — Sleeper',
    gauge_mm:       1676,
    nose_length_m:  3.5,
    speed_kmh:      160,
    motor_power_kw: 210,
    disc_type:      'grey_cast_iron',
    n_cars:         16,
    preset:         'vb_sleeper',
    mahsr_mode:     false,
  },
  b28_target: {
    label:          'B-28 HSR Target (BEML-ICF-Medha)',
    gauge_mm:       1435,
    nose_length_m:  10,
    speed_kmh:      280,
    motor_power_kw: 320,
    disc_type:      'composite',
    n_cars:         16,
    preset:         'b28_target',
    mahsr_mode:     true,
  },
  e5_shinkansen: {
    label:          'E5 Shinkansen (JR East)',
    gauge_mm:       1435,
    nose_length_m:  15,
    speed_kmh:      320,
    motor_power_kw: 300,
    disc_type:      'composite',
    n_cars:         10,
    preset:         'e5_shinkansen',
    mahsr_mode:     true,
  },
  n700s: {
    label:          'N700S Shinkansen (JR Central)',
    gauge_mm:       1435,
    nose_length_m:  10.7,
    speed_kmh:      285,
    motor_power_kw: 305,
    disc_type:      'composite',
    n_cars:         16,
    preset:         'n700s',
    mahsr_mode:     true,
  },
  mahsr_250: {
    label:          'MAHSR Phase 1 Target — 250 km/h',
    gauge_mm:       1435,
    nose_length_m:  7,
    speed_kmh:      250,
    motor_power_kw: 280,
    disc_type:      'composite',
    n_cars:         16,
    preset:         'mahsr_250',
    mahsr_mode:     true,
  },
};
