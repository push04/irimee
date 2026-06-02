'use client';

/**
 * components/forms/FieldDataForm.tsx
 *
 * Full-section field data entry form for VBHSR-SIM.
 *
 * Sections:
 *   A — Inspection metadata (coach, train type, location, date, ambient temp, inspector)
 *   B — Wheelset measurements (B1A1, B1A2, B2A1, B2A2)
 *   C — Bogie frame measurements (B1, B2)
 *   D — Brake disc measurements (8 discs: OB/IB per axle)
 *   E — Pantograph (10-point strip profile, static contact force, strip condition)
 *   F — Traction (motor nameplate, TCMS motor temps ×8, inverter temps ×4, DC link)
 *   G — Aerodynamic profile (nose length, car body dimensions, inter-car gap)
 *
 * Validation: each field turns green (in-spec) / amber (approaching limit) / red
 * (out of spec) based on VB_NOMINAL limits from @/lib/config.
 *
 * Save: POST /api/field-data/save
 * Load: GET  /api/field-data/load  (opens InspectionHistory picker)
 */

import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { Save, FolderOpen, Plus, Trash2, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { VB_NOMINAL } from '@/lib/config';
import type {
  FieldDataRecord,
  InspectionMetadata,
  WheelsetMeasurement,
  BogieFrameMeasurement,
  BrakeDiscMeasurement,
  AerodynamicMeasurements,
  PantographMeasurements,
  TractionMeasurements,
  CrackObservation,
  FaultEvent,
} from '@/lib/types';

// ── Spec limits for input status colouring ─────────────────────────────────────
// Source: RDSO Maintenance Manual Vande Bharat V2.0 (2023), Table 3-1

const SPEC = {
  wheel_diameter_min_mm:      870,   // condemn limit
  wheel_diameter_max_mm:      952,   // nominal new
  wheel_diameter_warn_mm:     905,   // approaching condemn
  flange_height_max_mm:       36,    // condemn limit (RDSO)
  flange_height_warn_mm:      34,
  flange_thickness_min_mm:    22,    // condemn limit
  flange_thickness_warn_mm:   25,
  tread_hollow_max_mm:         5,    // condemn limit
  tread_hollow_warn_mm:        3.5,
  back_to_back_min_mm:       1594,   // condemn limit (broad gauge 1676 mm gauge)
  back_to_back_max_mm:       1610,
  back_to_back_nom_mm:       1600,
  axle_box_clearance_max_mm:   3.5,
  axle_box_clearance_warn_mm:  2.5,
  wheelbase_nom_mm:           2500,
  air_spring_pressure_min_bar: 5.5,
  air_spring_pressure_max_bar: 8.0,
  air_spring_pressure_warn_lo: 6.0,
  air_spring_pressure_warn_hi: 7.5,
  air_spring_height_nom_mm:    280,
  air_spring_height_warn_mm:   260,
  air_spring_height_min_mm:    240,
  disc_outer_min_mm:           590,   // condemn if < 590
  disc_outer_warn_mm:          615,
  disc_outer_nom_mm:           640,
  disc_thickness_min_mm:       22,    // condemn (RDSO disc condemn limit)
  disc_thickness_warn_mm:      27,
  pad_thickness_min_mm:         8,
  pad_thickness_warn_mm:       12,
  strip_thickness_min_mm:       4,    // condemn limit (EN 50367)
  strip_thickness_warn_mm:      7,
  contact_force_min_N:         40,
  contact_force_max_N:        120,
  contact_force_warn_lo_N:     60,
  contact_force_warn_hi_N:    100,
  motor_temp_warn_C:           130,   // Class F insulation continuous rating
  motor_temp_max_C:            155,
  inverter_temp_warn_C:         80,
  inverter_temp_max_C:         100,
  dc_link_nom_V:              1500,
  dc_link_warn_V:              100,   // ± from nominal
} as const;

// ── Status computation ─────────────────────────────────────────────────────────

type FieldStatus = 'ok' | 'warn' | 'err' | 'empty';

function statusBorderClass(status: FieldStatus): string {
  switch (status) {
    case 'ok':    return 'border-[#1B7A45] bg-[#F0FAF4]';
    case 'warn':  return 'border-[#A05A00] bg-[#FFFBF0]';
    case 'err':   return 'border-[#CE1726] bg-[#FFF5F5]';
    default:      return 'border-[#D8DFEE]';
  }
}

function getWheelDiameterStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.wheel_diameter_min_mm) return 'err';
  if (v < SPEC.wheel_diameter_warn_mm) return 'warn';
  return 'ok';
}
function getFlangeHeightStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v > SPEC.flange_height_max_mm) return 'err';
  if (v > SPEC.flange_height_warn_mm) return 'warn';
  return 'ok';
}
function getFlangeThicknessStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.flange_thickness_min_mm) return 'err';
  if (v < SPEC.flange_thickness_warn_mm) return 'warn';
  return 'ok';
}
function getTreadHollowStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v > SPEC.tread_hollow_max_mm) return 'err';
  if (v > SPEC.tread_hollow_warn_mm) return 'warn';
  return 'ok';
}
function getBackToBackStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.back_to_back_min_mm || v > SPEC.back_to_back_max_mm) return 'err';
  if (Math.abs(v - SPEC.back_to_back_nom_mm) > 5) return 'warn';
  return 'ok';
}
function getAxleBoxStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v > SPEC.axle_box_clearance_max_mm) return 'err';
  if (v > SPEC.axle_box_clearance_warn_mm) return 'warn';
  return 'ok';
}
function getAirPressureStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.air_spring_pressure_min_bar || v > SPEC.air_spring_pressure_max_bar) return 'err';
  if (v < SPEC.air_spring_pressure_warn_lo || v > SPEC.air_spring_pressure_warn_hi) return 'warn';
  return 'ok';
}
function getAirHeightStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.air_spring_height_min_mm) return 'err';
  if (v < SPEC.air_spring_height_warn_mm) return 'warn';
  return 'ok';
}
function getDiscDiameterStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.disc_outer_min_mm) return 'err';
  if (v < SPEC.disc_outer_warn_mm) return 'warn';
  return 'ok';
}
function getDiscThicknessStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.disc_thickness_min_mm) return 'err';
  if (v < SPEC.disc_thickness_warn_mm) return 'warn';
  return 'ok';
}
function getPadThicknessStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.pad_thickness_min_mm) return 'err';
  if (v < SPEC.pad_thickness_warn_mm) return 'warn';
  return 'ok';
}
function getStripThicknessStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.strip_thickness_min_mm) return 'err';
  if (v < SPEC.strip_thickness_warn_mm) return 'warn';
  return 'ok';
}
function getContactForceStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v < SPEC.contact_force_min_N || v > SPEC.contact_force_max_N) return 'err';
  if (v < SPEC.contact_force_warn_lo_N || v > SPEC.contact_force_warn_hi_N) return 'warn';
  return 'ok';
}
function getMotorTempStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v > SPEC.motor_temp_max_C) return 'err';
  if (v > SPEC.motor_temp_warn_C) return 'warn';
  return 'ok';
}
function getInverterTempStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (v > SPEC.inverter_temp_max_C) return 'err';
  if (v > SPEC.inverter_temp_warn_C) return 'warn';
  return 'ok';
}
function getDCLinkStatus(v: number | null): FieldStatus {
  if (v === null) return 'empty';
  if (Math.abs(v - SPEC.dc_link_nom_V) > SPEC.dc_link_warn_V * 2) return 'err';
  if (Math.abs(v - SPEC.dc_link_nom_V) > SPEC.dc_link_warn_V) return 'warn';
  return 'ok';
}

// ── Shared input classes ────────────────────────────────────────────────────────

const BASE_INPUT =
  'w-full border rounded-lg px-3 py-2 text-[13px] font-mono text-[#1A1D2E] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#003893] focus:border-transparent ' +
  'transition-colors duration-150 placeholder:text-[#8A91A8]';

const LABEL_CLASS  = 'block text-[11px] text-[#4A5068] mb-1 font-sans';
const HINT_CLASS   = 'text-[9px] text-[#8A91A8] font-mono mt-0.5';
const SECTION_HDR  = 'text-[9px] font-bold uppercase tracking-[0.14em] text-[#003893] border-b-2 border-[#F26522] pb-1.5 mb-3';

// ── Reusable numeric input with spec-aware border ──────────────────────────────

interface NumInputProps {
  label: string;
  hint?: string;
  value: number | null;
  status?: FieldStatus;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (v: number | null) => void;
}

function NumInput({
  label, hint, value, status = 'empty', placeholder = '—',
  step = 0.1, min, max, onChange,
}: NumInputProps) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        placeholder={placeholder}
        value={value === null ? '' : value}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw === '' ? null : parseFloat(raw));
        }}
        className={clsx(BASE_INPUT, statusBorderClass(status))}
      />
      {hint && <p className={HINT_CLASS}>{hint}</p>}
    </div>
  );
}

// ── Section collapse wrapper ───────────────────────────────────────────────────

interface SectionProps {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ id, title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#D8DFEE] rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F7F9FD] hover:bg-[#EEF2F9] transition-colors"
      >
        <span className={SECTION_HDR + ' mb-0 pb-0 border-0'}>{id} — {title}</span>
        {open
          ? <ChevronDown size={14} className="text-[#003893] shrink-0" />
          : <ChevronRight size={14} className="text-[#003893] shrink-0" />
        }
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

// ── Default empty shapes ────────────────────────────────────────────────────────

function emptyWheelset(id: string): WheelsetMeasurement {
  return {
    wheelset_id: id,
    wheel_diameter_left_mm: null, wheel_diameter_right_mm: null,
    flange_height_left_mm: null,  flange_height_right_mm: null,
    flange_thickness_left_mm: null, flange_thickness_right_mm: null,
    tread_hollow_left_mm: null,   tread_hollow_right_mm: null,
    back_to_back_mm: null,
    axle_box_clearance_left_mm: null, axle_box_clearance_right_mm: null,
  };
}

function emptyBogie(id: string): BogieFrameMeasurement {
  return {
    bogie_id: id,
    wheelbase_mm: null,
    air_spring_pressure_left_bar: null, air_spring_pressure_right_bar: null,
    air_spring_height_fl_mm: null, air_spring_height_fr_mm: null,
    air_spring_height_rl_mm: null, air_spring_height_rr_mm: null,
    primary_spring_height_fl_mm: null, primary_spring_height_fr_mm: null,
    damper_condition: null,
    cracks: [],
  };
}

function emptyDisc(id: string): BrakeDiscMeasurement {
  return {
    disc_id: id,
    outer_diameter_mm: null,
    thickness_12pt_mm: Array(12).fill(null),
    thermal_crack_count: null,
    max_crack_length_mm: null,
    pad_thickness_mm: null,
    thermal_discoloration: null,
  };
}

function emptyRecord(): FieldDataRecord {
  const today = new Date().toISOString().slice(0, 10);
  return {
    inspection_metadata: {
      date: today,
      location: 'jheel',
      train_type: 'vb_chair',
      coach_number: '',
      ambient_temperature_C: null,
      weather: '',
      inspector_name: '',
    },
    wheelset_measurements: [
      emptyWheelset('B1A1'), emptyWheelset('B1A2'),
      emptyWheelset('B2A1'), emptyWheelset('B2A2'),
    ],
    bogie_measurements: [emptyBogie('B1'), emptyBogie('B2')],
    brake_disc_measurements: [
      emptyDisc('B1A1OB'), emptyDisc('B1A1IB'),
      emptyDisc('B1A2OB'), emptyDisc('B1A2IB'),
      emptyDisc('B2A1OB'), emptyDisc('B2A1IB'),
      emptyDisc('B2A2OB'), emptyDisc('B2A2IB'),
    ],
    aerodynamic_measurements: {
      nose_length_m: null, car_body_width_skirt_mm: null,
      car_body_width_window_mm: null, car_body_width_roof_mm: null,
      car_body_height_mm: null, inter_car_gap_mm: null,
      bogie_skirt_coverage_pct: null, roof_hvac_height_mm: null,
      roof_hvac_width_mm: null,
    },
    pantograph_measurements: {
      contact_strip_thickness_mm: Array(10).fill(null),
      static_contact_force_N: null,
      strip_condition: null,
    },
    traction_measurements: {
      motor_rated_power_kW: null, motor_rated_voltage_V: null,
      motor_rated_frequency_Hz: null, motor_rated_speed_rpm: null,
      motor_insulation_class: null,
      tcms_motor_temperature_C: Array(8).fill(null),
      tcms_inverter_temperature_C: Array(4).fill(null),
      tcms_dc_link_voltage_V: null,
      ambient_temperature_at_tcms_C: null,
      speed_at_tcms_reading_kmh: null,
      fault_log: [],
    },
    coupler_height_above_rail_mm: null,
    track_gauge_actual_mm: null,
  };
}

// ── Sub-section: one wheelset row ──────────────────────────────────────────────

interface WheelsetRowProps {
  ws: WheelsetMeasurement;
  onChange: (patch: Partial<WheelsetMeasurement>) => void;
}

function WheelsetRow({ ws, onChange }: WheelsetRowProps) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="text-[10px] font-bold text-[#003893] uppercase tracking-[0.12em] mb-2">
        Wheelset {ws.wheelset_id}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumInput
          label="Wheel Ø Left (mm)"
          hint={`Nom ${VB_NOMINAL.wheel_diameter_mm} mm | Min 870 mm`}
          value={ws.wheel_diameter_left_mm}
          status={getWheelDiameterStatus(ws.wheel_diameter_left_mm)}
          step={0.5} min={800} max={980}
          onChange={v => onChange({ wheel_diameter_left_mm: v })}
        />
        <NumInput
          label="Wheel Ø Right (mm)"
          hint={`Nom ${VB_NOMINAL.wheel_diameter_mm} mm | Min 870 mm`}
          value={ws.wheel_diameter_right_mm}
          status={getWheelDiameterStatus(ws.wheel_diameter_right_mm)}
          step={0.5} min={800} max={980}
          onChange={v => onChange({ wheel_diameter_right_mm: v })}
        />
        <NumInput
          label="Flange Height L (mm)"
          hint="Max 36 mm (RDSO condemn)"
          value={ws.flange_height_left_mm}
          status={getFlangeHeightStatus(ws.flange_height_left_mm)}
          step={0.1} min={0} max={50}
          onChange={v => onChange({ flange_height_left_mm: v })}
        />
        <NumInput
          label="Flange Height R (mm)"
          hint="Max 36 mm (RDSO condemn)"
          value={ws.flange_height_right_mm}
          status={getFlangeHeightStatus(ws.flange_height_right_mm)}
          step={0.1} min={0} max={50}
          onChange={v => onChange({ flange_height_right_mm: v })}
        />
        <NumInput
          label="Flange Thickness L (mm)"
          hint="Min 22 mm (RDSO condemn)"
          value={ws.flange_thickness_left_mm}
          status={getFlangeThicknessStatus(ws.flange_thickness_left_mm)}
          step={0.1} min={0} max={40}
          onChange={v => onChange({ flange_thickness_left_mm: v })}
        />
        <NumInput
          label="Flange Thickness R (mm)"
          hint="Min 22 mm (RDSO condemn)"
          value={ws.flange_thickness_right_mm}
          status={getFlangeThicknessStatus(ws.flange_thickness_right_mm)}
          step={0.1} min={0} max={40}
          onChange={v => onChange({ flange_thickness_right_mm: v })}
        />
        <NumInput
          label="Tread Hollow L (mm)"
          hint="Max 5 mm (RDSO condemn)"
          value={ws.tread_hollow_left_mm}
          status={getTreadHollowStatus(ws.tread_hollow_left_mm)}
          step={0.1} min={0} max={10}
          onChange={v => onChange({ tread_hollow_left_mm: v })}
        />
        <NumInput
          label="Tread Hollow R (mm)"
          hint="Max 5 mm (RDSO condemn)"
          value={ws.tread_hollow_right_mm}
          status={getTreadHollowStatus(ws.tread_hollow_right_mm)}
          step={0.1} min={0} max={10}
          onChange={v => onChange({ tread_hollow_right_mm: v })}
        />
        <NumInput
          label="Back-to-Back (mm)"
          hint="1594–1610 mm | Nom 1600 mm"
          value={ws.back_to_back_mm}
          status={getBackToBackStatus(ws.back_to_back_mm)}
          step={0.5} min={1550} max={1650}
          onChange={v => onChange({ back_to_back_mm: v })}
        />
        <NumInput
          label="Axle Box Clearance L (mm)"
          hint="Max 3.5 mm (warn > 2.5)"
          value={ws.axle_box_clearance_left_mm}
          status={getAxleBoxStatus(ws.axle_box_clearance_left_mm)}
          step={0.1} min={0} max={10}
          onChange={v => onChange({ axle_box_clearance_left_mm: v })}
        />
        <NumInput
          label="Axle Box Clearance R (mm)"
          hint="Max 3.5 mm (warn > 2.5)"
          value={ws.axle_box_clearance_right_mm}
          status={getAxleBoxStatus(ws.axle_box_clearance_right_mm)}
          step={0.1} min={0} max={10}
          onChange={v => onChange({ axle_box_clearance_right_mm: v })}
        />
      </div>
    </div>
  );
}

// ── Sub-section: crack observation row ────────────────────────────────────────

interface CrackRowProps {
  crack: CrackObservation;
  index: number;
  onUpdate: (patch: Partial<CrackObservation>) => void;
  onRemove: () => void;
}

function CrackRow({ crack, index, onUpdate, onRemove }: CrackRowProps) {
  const hasCrack = crack.crack_length_mm !== null && crack.crack_length_mm > 0;
  const criticalCrack = hasCrack && (crack.crack_length_mm ?? 0) > 20;

  return (
    <div className={clsx(
      'border rounded-lg p-3 mb-2',
      criticalCrack ? 'border-[#CE1726] bg-[#FFF5F5]' : 'border-[#D8DFEE] bg-[#F7F9FD]'
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-[#003893]">Crack #{index + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-[#CE1726] hover:opacity-70 transition-opacity"
          title="Remove crack observation"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {criticalCrack && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1 bg-[#CE1726]/10 rounded text-[#CE1726] text-[9px] font-sans">
          <AlertTriangle size={10} />
          <span>Crack ≥ 20 mm — Paris' law fatigue analysis triggered in simulation</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={LABEL_CLASS}>Crack Length (mm)</label>
          <input
            type="number"
            step={0.5}
            min={0}
            placeholder="—"
            value={crack.crack_length_mm === null ? '' : crack.crack_length_mm}
            onChange={e => onUpdate({ crack_length_mm: e.target.value === '' ? null : parseFloat(e.target.value) })}
            className={clsx(BASE_INPUT, criticalCrack ? 'border-[#CE1726] bg-[#FFF5F5]' : 'border-[#D8DFEE]')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Crack Depth (mm)</label>
          <input
            type="number"
            step={0.1}
            min={0}
            placeholder="—"
            value={crack.crack_depth_mm === null ? '' : crack.crack_depth_mm}
            onChange={e => onUpdate({ crack_depth_mm: e.target.value === '' ? null : parseFloat(e.target.value) })}
            className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL_CLASS}>Location description</label>
          <input
            type="text"
            placeholder="e.g. cross-member weld toe, outboard side"
            value={crack.location_description}
            onChange={e => onUpdate({ location_description: e.target.value })}
            className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
          />
        </div>
        <div>
          <label className={LABEL_CLASS}>Distance from reference (mm)</label>
          <input
            type="number"
            step={1}
            min={0}
            placeholder="—"
            value={crack.distance_from_reference_mm === null ? '' : crack.distance_from_reference_mm}
            onChange={e => onUpdate({ distance_from_reference_mm: e.target.value === '' ? null : parseFloat(e.target.value) })}
            className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sub-section: one bogie row ────────────────────────────────────────────────

interface BogieRowProps {
  bg: BogieFrameMeasurement;
  onChange: (patch: Partial<BogieFrameMeasurement>) => void;
}

function BogieRow({ bg, onChange }: BogieRowProps) {
  const addCrack = () => {
    onChange({
      cracks: [
        ...bg.cracks,
        { location_description: '', distance_from_reference_mm: null, crack_length_mm: null, crack_depth_mm: null, photo_url: null },
      ],
    });
  };

  const updateCrack = (idx: number, patch: Partial<CrackObservation>) => {
    const updated = bg.cracks.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onChange({ cracks: updated });
  };

  const removeCrack = (idx: number) => {
    onChange({ cracks: bg.cracks.filter((_, i) => i !== idx) });
  };

  return (
    <div className="mb-6 last:mb-0">
      <p className="text-[10px] font-bold text-[#003893] uppercase tracking-[0.12em] mb-2">
        Bogie {bg.bogie_id}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <NumInput
          label="Wheelbase (mm)"
          hint={`Nom ${VB_NOMINAL.bogie_wheelbase_m * 1000} mm`}
          value={bg.wheelbase_mm}
          status={bg.wheelbase_mm === null ? 'empty' : Math.abs(bg.wheelbase_mm - 2500) < 5 ? 'ok' : 'warn'}
          step={1} min={2400} max={2600}
          onChange={v => onChange({ wheelbase_mm: v })}
        />
        <NumInput
          label="Air Spring Pressure L (bar)"
          hint="5.5–8.0 bar | Nom ~6.5"
          value={bg.air_spring_pressure_left_bar}
          status={getAirPressureStatus(bg.air_spring_pressure_left_bar)}
          step={0.1} min={0} max={12}
          onChange={v => onChange({ air_spring_pressure_left_bar: v })}
        />
        <NumInput
          label="Air Spring Pressure R (bar)"
          hint="5.5–8.0 bar | Nom ~6.5"
          value={bg.air_spring_pressure_right_bar}
          status={getAirPressureStatus(bg.air_spring_pressure_right_bar)}
          step={0.1} min={0} max={12}
          onChange={v => onChange({ air_spring_pressure_right_bar: v })}
        />
        <NumInput
          label="Air Spring Height FL (mm)"
          hint="Nom 280 mm | Min 240 mm"
          value={bg.air_spring_height_fl_mm}
          status={getAirHeightStatus(bg.air_spring_height_fl_mm)}
          step={1} min={150} max={350}
          onChange={v => onChange({ air_spring_height_fl_mm: v })}
        />
        <NumInput
          label="Air Spring Height FR (mm)"
          hint="Nom 280 mm | Min 240 mm"
          value={bg.air_spring_height_fr_mm}
          status={getAirHeightStatus(bg.air_spring_height_fr_mm)}
          step={1} min={150} max={350}
          onChange={v => onChange({ air_spring_height_fr_mm: v })}
        />
        <NumInput
          label="Air Spring Height RL (mm)"
          hint="Nom 280 mm | Min 240 mm"
          value={bg.air_spring_height_rl_mm}
          status={getAirHeightStatus(bg.air_spring_height_rl_mm)}
          step={1} min={150} max={350}
          onChange={v => onChange({ air_spring_height_rl_mm: v })}
        />
        <NumInput
          label="Air Spring Height RR (mm)"
          hint="Nom 280 mm | Min 240 mm"
          value={bg.air_spring_height_rr_mm}
          status={getAirHeightStatus(bg.air_spring_height_rr_mm)}
          step={1} min={150} max={350}
          onChange={v => onChange({ air_spring_height_rr_mm: v })}
        />
        <NumInput
          label="Primary Spring Height FL (mm)"
          hint="Nominal — record as-found"
          value={bg.primary_spring_height_fl_mm}
          step={1} min={0} max={400}
          onChange={v => onChange({ primary_spring_height_fl_mm: v })}
        />
        <NumInput
          label="Primary Spring Height FR (mm)"
          hint="Nominal — record as-found"
          value={bg.primary_spring_height_fr_mm}
          step={1} min={0} max={400}
          onChange={v => onChange({ primary_spring_height_fr_mm: v })}
        />
      </div>

      {/* Damper condition */}
      <div className="mb-3">
        <label className={LABEL_CLASS}>Damper Condition</label>
        <div className="flex gap-3">
          {(['good', 'leaking', 'seized'] as const).map(opt => (
            <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`damper-${bg.bogie_id}`}
                value={opt}
                checked={bg.damper_condition === opt}
                onChange={() => onChange({ damper_condition: opt })}
                className="accent-[#003893]"
              />
              <span className={clsx(
                'text-[12px] font-sans capitalize',
                opt === 'good'    ? 'text-[#1B7A45]' :
                opt === 'leaking' ? 'text-[#A05A00]' : 'text-[#CE1726]'
              )}>
                {opt}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Crack observations */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-sans text-[#4A5068] uppercase tracking-wide">
            Frame crack observations ({bg.cracks.length})
          </span>
          <button
            type="button"
            onClick={addCrack}
            className="flex items-center gap-1 text-[11px] text-[#003893] hover:opacity-70 transition-opacity"
          >
            <Plus size={11} /> Add crack
          </button>
        </div>
        {bg.cracks.map((crack, idx) => (
          <CrackRow
            key={idx}
            crack={crack}
            index={idx}
            onUpdate={patch => updateCrack(idx, patch)}
            onRemove={() => removeCrack(idx)}
          />
        ))}
        {bg.cracks.length === 0 && (
          <p className="text-[11px] text-[#8A91A8] italic py-1">No crack observations recorded.</p>
        )}
      </div>
    </div>
  );
}

// ── Sub-section: one brake disc row ───────────────────────────────────────────

interface DiscRowProps {
  disc: BrakeDiscMeasurement;
  onChange: (patch: Partial<BrakeDiscMeasurement>) => void;
}

function DiscRow({ disc, onChange }: DiscRowProps) {
  const avgThickness = disc.thickness_12pt_mm.filter(v => v !== null).length > 0
    ? disc.thickness_12pt_mm.filter(v => v !== null).reduce((a, b) => (a ?? 0) + (b ?? 0), 0)! /
      disc.thickness_12pt_mm.filter(v => v !== null).length
    : null;

  const updateThickness = (i: number, v: number | null) => {
    const arr = [...disc.thickness_12pt_mm];
    arr[i] = v;
    onChange({ thickness_12pt_mm: arr });
  };

  return (
    <div className="mb-5 last:mb-0 border border-[#D8DFEE] rounded-lg p-3">
      <p className="text-[10px] font-bold text-[#003893] uppercase tracking-[0.12em] mb-2">
        Disc {disc.disc_id}
        {avgThickness !== null && (
          <span className={clsx(
            'ml-2 text-[9px] font-mono',
            getDiscThicknessStatus(avgThickness) === 'ok'   ? 'text-[#1B7A45]' :
            getDiscThicknessStatus(avgThickness) === 'warn' ? 'text-[#A05A00]' : 'text-[#CE1726]'
          )}>
            avg {avgThickness.toFixed(1)} mm
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <NumInput
          label="Outer Diameter (mm)"
          hint="Nom 640 mm | Min 590 mm"
          value={disc.outer_diameter_mm}
          status={getDiscDiameterStatus(disc.outer_diameter_mm)}
          step={0.5} min={500} max={700}
          onChange={v => onChange({ outer_diameter_mm: v })}
        />
        <NumInput
          label="Thermal Crack Count"
          hint="Record visible radial cracks"
          value={disc.thermal_crack_count}
          status={disc.thermal_crack_count === null ? 'empty' : disc.thermal_crack_count === 0 ? 'ok' : disc.thermal_crack_count < 3 ? 'warn' : 'err'}
          step={1} min={0}
          onChange={v => onChange({ thermal_crack_count: v === null ? null : Math.round(v) })}
        />
        <NumInput
          label="Max Crack Length (mm)"
          hint="Flag if > 20 mm → Paris' law"
          value={disc.max_crack_length_mm}
          status={disc.max_crack_length_mm === null ? 'empty' : disc.max_crack_length_mm > 20 ? 'err' : disc.max_crack_length_mm > 10 ? 'warn' : 'ok'}
          step={0.5} min={0}
          onChange={v => onChange({ max_crack_length_mm: v })}
        />
        <NumInput
          label="Pad Thickness (mm)"
          hint="Min 8 mm | Warn < 12 mm"
          value={disc.pad_thickness_mm}
          status={getPadThicknessStatus(disc.pad_thickness_mm)}
          step={0.5} min={0} max={30}
          onChange={v => onChange({ pad_thickness_mm: v })}
        />
      </div>

      {/* Thermal discoloration */}
      <div className="flex items-center gap-3 mb-3">
        <label className={LABEL_CLASS + ' mb-0'}>Thermal discoloration:</label>
        {([true, false] as const).map(v => (
          <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name={`discolor-${disc.disc_id}`}
              checked={disc.thermal_discoloration === v}
              onChange={() => onChange({ thermal_discoloration: v })}
              className="accent-[#003893]"
            />
            <span className={clsx('text-[12px] font-sans', v ? 'text-[#A05A00]' : 'text-[#1B7A45]')}>
              {v ? 'Yes' : 'No'}
            </span>
          </label>
        ))}
      </div>

      {/* 12-point thickness profile (at 30° intervals) */}
      <div>
        <p className={LABEL_CLASS}>12-point thickness profile at 30° intervals (mm)</p>
        <div className="grid grid-cols-6 gap-2">
          {disc.thickness_12pt_mm.map((val, i) => (
            <div key={i}>
              <label className="text-[9px] text-[#8A91A8] font-mono">{i * 30}°</label>
              <input
                type="number"
                step={0.5}
                min={0}
                max={60}
                placeholder="—"
                value={val === null ? '' : val}
                onChange={e => updateThickness(i, e.target.value === '' ? null : parseFloat(e.target.value))}
                className={clsx(BASE_INPUT, 'px-2 py-1 text-[12px]', statusBorderClass(getDiscThicknessStatus(val)))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Fault log sub-section ──────────────────────────────────────────────────────

interface FaultLogProps {
  faults: FaultEvent[];
  onChange: (faults: FaultEvent[]) => void;
}

function FaultLogSection({ faults, onChange }: FaultLogProps) {
  const addFault = () => {
    onChange([
      ...faults,
      { timestamp: new Date().toISOString(), fault_code: '', description: '' },
    ]);
  };
  const updateFault = (idx: number, patch: Partial<FaultEvent>) => {
    onChange(faults.map((f, i) => i === idx ? { ...f, ...patch } : f));
  };
  const removeFault = (idx: number) => {
    onChange(faults.filter((_, i) => i !== idx));
  };

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-sans text-[#4A5068] uppercase tracking-wide">
          TCMS fault log ({faults.length})
        </span>
        <button
          type="button"
          onClick={addFault}
          className="flex items-center gap-1 text-[11px] text-[#003893] hover:opacity-70 transition-opacity"
        >
          <Plus size={11} /> Add fault
        </button>
      </div>
      {faults.map((f, idx) => (
        <div key={idx} className="grid grid-cols-3 gap-2 mb-2 border border-[#D8DFEE] rounded-lg p-2">
          <div>
            <label className={LABEL_CLASS}>Timestamp (ISO 8601)</label>
            <input
              type="text"
              placeholder="2025-06-01T14:32:00Z"
              value={f.timestamp}
              onChange={e => updateFault(idx, { timestamp: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>
          <div>
            <label className={LABEL_CLASS}>Fault code</label>
            <input
              type="text"
              placeholder="e.g. TCMS-M01-OT"
              value={f.fault_code}
              onChange={e => updateFault(idx, { fault_code: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>
          <div className="relative">
            <label className={LABEL_CLASS}>Description</label>
            <input
              type="text"
              placeholder="Motor 1 over-temperature"
              value={f.description}
              onChange={e => updateFault(idx, { description: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE] pr-8')}
            />
            <button
              type="button"
              onClick={() => removeFault(idx)}
              className="absolute right-2 top-7 text-[#CE1726] hover:opacity-70"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main FieldDataForm component ───────────────────────────────────────────────

export interface FieldDataFormProps {
  /** Pre-populate form with an existing record (e.g. loaded from Supabase) */
  initialData?: FieldDataRecord;
  /** Called after successful save — receives the new inspection UUID */
  onSaved?: (id: string) => void;
  /** Called when user clicks Load Previous — parent should show InspectionHistory */
  onLoadPrevious?: () => void;
}

export function FieldDataForm({
  initialData,
  onSaved,
  onLoadPrevious,
}: FieldDataFormProps) {
  const [record, setRecord] = useState<FieldDataRecord>(
    initialData ?? emptyRecord()
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Patch helpers ────────────────────────────────────────────────────────────

  const patchMeta = useCallback((patch: Partial<InspectionMetadata>) => {
    setRecord(r => ({ ...r, inspection_metadata: { ...r.inspection_metadata, ...patch } }));
  }, []);

  const patchWheelset = useCallback((idx: number, patch: Partial<WheelsetMeasurement>) => {
    setRecord(r => {
      const arr = [...r.wheelset_measurements];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...r, wheelset_measurements: arr };
    });
  }, []);

  const patchBogie = useCallback((idx: number, patch: Partial<BogieFrameMeasurement>) => {
    setRecord(r => {
      const arr = [...r.bogie_measurements];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...r, bogie_measurements: arr };
    });
  }, []);

  const patchDisc = useCallback((idx: number, patch: Partial<BrakeDiscMeasurement>) => {
    setRecord(r => {
      const arr = [...r.brake_disc_measurements];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...r, brake_disc_measurements: arr };
    });
  }, []);

  const patchAero = useCallback((patch: Partial<AerodynamicMeasurements>) => {
    setRecord(r => ({ ...r, aerodynamic_measurements: { ...r.aerodynamic_measurements, ...patch } }));
  }, []);

  const patchPanto = useCallback((patch: Partial<PantographMeasurements>) => {
    setRecord(r => ({ ...r, pantograph_measurements: { ...r.pantograph_measurements, ...patch } }));
  }, []);

  const patchTraction = useCallback((patch: Partial<TractionMeasurements>) => {
    setRecord(r => ({ ...r, traction_measurements: { ...r.traction_measurements, ...patch } }));
  }, []);

  // ── Save handler ─────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/field-data/save', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(record),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setSaveError((err as { error: string }).error ?? `HTTP ${res.status}`);
        return;
      }

      const { id } = await res.json() as { id: string };
      setSaveSuccess(true);
      onSaved?.(id);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // ── Pantograph thickness updater ─────────────────────────────────────────────

  const updateStripThickness = (idx: number, v: number | null) => {
    const arr = [...record.pantograph_measurements.contact_strip_thickness_mm];
    arr[idx] = v;
    patchPanto({ contact_strip_thickness_mm: arr });
  };

  const updateMotorTemp = (idx: number, v: number | null) => {
    const arr = [...record.traction_measurements.tcms_motor_temperature_C];
    arr[idx] = v;
    patchTraction({ tcms_motor_temperature_C: arr });
  };

  const updateInverterTemp = (idx: number, v: number | null) => {
    const arr = [...record.traction_measurements.tcms_inverter_temperature_C];
    arr[idx] = v;
    patchTraction({ tcms_inverter_temperature_C: arr });
  };

  const meta    = record.inspection_metadata;
  const panto   = record.pantograph_measurements;
  const traction = record.traction_measurements;
  const aero    = record.aerodynamic_measurements;

  return (
    <div className="h-full overflow-y-auto bg-[#F7F9FD] px-4 py-4 font-sans">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-serif text-[15px] font-bold text-[#1A1D2E]">Field Inspection Form</h2>
          <p className="text-[11px] text-[#8A91A8] mt-0.5">
            VBHSR-SIM · Vande Bharat rolling stock measurement record
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoadPrevious}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              border border-[#D8DFEE] bg-white text-[#003893]
              text-[12px] font-sans hover:border-[#003893] hover:bg-[#E8F0FB]
              transition-colors duration-150
            "
          >
            <FolderOpen size={13} />
            Load Previous
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded-lg
              bg-[#003893] text-white text-[12px] font-sans font-medium
              hover:bg-[#002B74] active:bg-[#001E55]
              disabled:opacity-60 disabled:cursor-not-allowed
              transition-colors duration-150
            "
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save to Supabase'}
          </button>
        </div>
      </div>

      {/* Save feedback */}
      {saveError && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-[#CE1726] bg-[#FFF5F5] text-[12px] text-[#CE1726] font-sans flex items-center gap-2">
          <AlertTriangle size={13} />
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-[#1B7A45] bg-[#F0FAF4] text-[12px] text-[#1B7A45] font-sans">
          Saved successfully to Supabase.
        </div>
      )}

      {/* ── Section A: Inspection Metadata ──────────────────────────────────── */}
      <Section id="A" title="Inspection Context">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Coach number */}
          <div>
            <label className={LABEL_CLASS}>Coach Number</label>
            <input
              type="text"
              placeholder="e.g. WLRRM 04527"
              value={meta.coach_number}
              onChange={e => patchMeta({ coach_number: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>

          {/* Train type */}
          <div>
            <label className={LABEL_CLASS}>Train Type</label>
            <select
              value={meta.train_type}
              onChange={e => patchMeta({ train_type: e.target.value as 'vb_sleeper' | 'vb_chair' })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE] cursor-pointer')}
            >
              <option value="vb_chair">Vande Bharat — Chair Car</option>
              <option value="vb_sleeper">Vande Bharat — Sleeper</option>
            </select>
          </div>

          {/* Location */}
          <div>
            <label className={LABEL_CLASS}>Inspection Location</label>
            <select
              value={meta.location}
              onChange={e => patchMeta({ location: e.target.value as 'jheel' | 'rncc' })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE] cursor-pointer')}
            >
              <option value="jheel">Jheel Siding, Jamalpur</option>
              <option value="rncc">RNCC Patna</option>
            </select>
          </div>

          {/* Date */}
          <div>
            <label className={LABEL_CLASS}>Inspection Date</label>
            <input
              type="date"
              value={meta.date}
              onChange={e => patchMeta({ date: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>

          {/* Ambient temperature */}
          <NumInput
            label="Ambient Temperature (°C)"
            hint="Record at time of inspection"
            value={meta.ambient_temperature_C}
            step={0.5} min={-10} max={55}
            onChange={v => patchMeta({ ambient_temperature_C: v })}
          />

          {/* Inspector */}
          <div>
            <label className={LABEL_CLASS}>Inspector Name</label>
            <input
              type="text"
              placeholder="Full name"
              value={meta.inspector_name}
              onChange={e => patchMeta({ inspector_name: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>

          {/* Weather */}
          <div className="md:col-span-3">
            <label className={LABEL_CLASS}>Weather / Conditions</label>
            <input
              type="text"
              placeholder="e.g. Clear, 34°C, dry track"
              value={meta.weather}
              onChange={e => patchMeta({ weather: e.target.value })}
              className={clsx(BASE_INPUT, 'border-[#D8DFEE]')}
            />
          </div>
        </div>
      </Section>

      {/* ── Section B: Wheelset Measurements ────────────────────────────────── */}
      <Section id="B" title="Wheelset Measurements">
        <p className={HINT_CLASS + ' mb-3'}>
          Source: RDSO Maintenance Manual Vande Bharat V2.0 (2023), Table 3-1 condemn limits.
          Green = in spec · Amber = approaching limit · Red = condemn.
        </p>
        {record.wheelset_measurements.map((ws, i) => (
          <WheelsetRow
            key={ws.wheelset_id}
            ws={ws}
            onChange={patch => patchWheelset(i, patch)}
          />
        ))}
      </Section>

      {/* ── Section C: Bogie Frame Measurements ─────────────────────────────── */}
      <Section id="C" title="Bogie Frame Measurements">
        <p className={HINT_CLASS + ' mb-3'}>
          Air spring heights and pressures from RDSO SB-015 specification.
          Crack observations ≥ 20 mm length trigger Paris&#39; law fatigue analysis in the simulation pipeline.
        </p>
        {record.bogie_measurements.map((bg, i) => (
          <BogieRow
            key={bg.bogie_id}
            bg={bg}
            onChange={patch => patchBogie(i, patch)}
          />
        ))}
      </Section>

      {/* ── Section D: Brake Disc Measurements ──────────────────────────────── */}
      <Section id="D" title="Brake Disc Measurements">
        <p className={HINT_CLASS + ' mb-3'}>
          12-point thickness at 30° intervals per disc (OB = outboard, IB = inboard).
          Condemn limits per RDSO/2021/CG-02. Disc pad condemn &lt; 8 mm.
        </p>
        {record.brake_disc_measurements.map((d, i) => (
          <DiscRow
            key={d.disc_id}
            disc={d}
            onChange={patch => patchDisc(i, patch)}
          />
        ))}
      </Section>

      {/* ── Section E: Pantograph ───────────────────────────────────────────── */}
      <Section id="E" title="Pantograph">
        <p className={HINT_CLASS + ' mb-3'}>
          10-point strip profile at 175 mm intervals. Condemn &lt; 4 mm (EN 50367).
          Static contact force nominal range 40–120 N (TSI ENE 2014/38/EU).
        </p>

        <div className="mb-4">
          <p className={LABEL_CLASS}>Contact strip thickness profile — 10 points at 175 mm intervals (mm)</p>
          <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
            {panto.contact_strip_thickness_mm.map((val, i) => (
              <div key={i}>
                <label className="text-[9px] text-[#8A91A8] font-mono">{i * 175} mm</label>
                <input
                  type="number"
                  step={0.5}
                  min={0}
                  max={30}
                  placeholder="—"
                  value={val === null ? '' : val}
                  onChange={e => updateStripThickness(i, e.target.value === '' ? null : parseFloat(e.target.value))}
                  className={clsx(BASE_INPUT, 'px-2 py-1.5 text-[12px]', statusBorderClass(getStripThicknessStatus(val)))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumInput
            label="Static Contact Force (N)"
            hint="Nominal 40–120 N | TSI ENE 2014/38/EU"
            value={panto.static_contact_force_N}
            status={getContactForceStatus(panto.static_contact_force_N)}
            step={1} min={0} max={300}
            onChange={v => patchPanto({ static_contact_force_N: v })}
          />

          <div>
            <label className={LABEL_CLASS}>Strip Condition</label>
            <select
              value={panto.strip_condition ?? ''}
              onChange={e => patchPanto({ strip_condition: e.target.value === '' ? null : e.target.value as 'good' | 'grooved' | 'worn_edge' })}
              className={clsx(
                BASE_INPUT, 'cursor-pointer',
                panto.strip_condition === 'good'      ? 'border-[#1B7A45] bg-[#F0FAF4]' :
                panto.strip_condition === 'grooved'   ? 'border-[#A05A00] bg-[#FFFBF0]' :
                panto.strip_condition === 'worn_edge' ? 'border-[#CE1726] bg-[#FFF5F5]' :
                'border-[#D8DFEE]'
              )}
            >
              <option value="">— Select —</option>
              <option value="good">Good</option>
              <option value="grooved">Grooved</option>
              <option value="worn_edge">Worn edge</option>
            </select>
          </div>
        </div>
      </Section>

      {/* ── Section F: Traction ─────────────────────────────────────────────── */}
      <Section id="F" title="Traction">
        <p className={HINT_CLASS + ' mb-3'}>
          Motor nameplate data from ICF drawing. TCMS readings from cab display or download.
          Motor temp limits: Class F = 130°C continuous, 155°C peak.
        </p>

        <p className={SECTION_HDR}>Motor nameplate data</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <NumInput
            label="Rated Power (kW)"
            hint={`Nom ${VB_NOMINAL.motor_rated_power_kw} kW`}
            value={traction.motor_rated_power_kW}
            step={1} min={0} max={1000}
            onChange={v => patchTraction({ motor_rated_power_kW: v })}
          />
          <NumInput
            label="Rated Voltage (V)"
            hint="Typically 3-phase from inverter"
            value={traction.motor_rated_voltage_V}
            step={1} min={0} max={3000}
            onChange={v => patchTraction({ motor_rated_voltage_V: v })}
          />
          <NumInput
            label="Rated Frequency (Hz)"
            hint="Used to compute base speed"
            value={traction.motor_rated_frequency_Hz}
            step={0.5} min={0} max={400}
            onChange={v => patchTraction({ motor_rated_frequency_Hz: v })}
          />
          <NumInput
            label="Rated Speed (rpm)"
            hint="Synchronous speed from nameplate"
            value={traction.motor_rated_speed_rpm}
            step={10} min={0} max={10000}
            onChange={v => patchTraction({ motor_rated_speed_rpm: v })}
          />

          <div>
            <label className={LABEL_CLASS}>Insulation Class</label>
            <select
              value={traction.motor_insulation_class ?? ''}
              onChange={e => patchTraction({ motor_insulation_class: e.target.value === '' ? null : e.target.value as 'B' | 'F' | 'H' })}
              className={clsx(BASE_INPUT, 'cursor-pointer border-[#D8DFEE]')}
            >
              <option value="">— Select —</option>
              <option value="B">Class B (130°C)</option>
              <option value="F">Class F (155°C)</option>
              <option value="H">Class H (180°C)</option>
            </select>
          </div>
        </div>

        <p className={SECTION_HDR}>TCMS readings</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <NumInput
            label="DC Link Voltage (V)"
            hint="Nom 1500 V ±10%"
            value={traction.tcms_dc_link_voltage_V}
            status={getDCLinkStatus(traction.tcms_dc_link_voltage_V)}
            step={5} min={0} max={2000}
            onChange={v => patchTraction({ tcms_dc_link_voltage_V: v })}
          />
          <NumInput
            label="Ambient Temp at TCMS reading (°C)"
            hint="For derating correction"
            value={traction.ambient_temperature_at_tcms_C}
            step={0.5} min={-10} max={60}
            onChange={v => patchTraction({ ambient_temperature_at_tcms_C: v })}
          />
          <NumInput
            label="Speed at TCMS reading (km/h)"
            hint="For traction point context"
            value={traction.speed_at_tcms_reading_kmh}
            step={1} min={0} max={200}
            onChange={v => patchTraction({ speed_at_tcms_reading_kmh: v })}
          />
        </div>

        <p className={LABEL_CLASS}>Motor temperatures — 8 values (one per powered axle per 4-car unit) (°C)</p>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-4">
          {traction.tcms_motor_temperature_C.map((val, i) => (
            <div key={i}>
              <label className="text-[9px] text-[#8A91A8] font-mono">M{i + 1}</label>
              <input
                type="number"
                step={1}
                min={0}
                max={200}
                placeholder="—"
                value={val === null ? '' : val}
                onChange={e => updateMotorTemp(i, e.target.value === '' ? null : parseFloat(e.target.value))}
                className={clsx(BASE_INPUT, 'px-2 py-1.5 text-[12px]', statusBorderClass(getMotorTempStatus(val)))}
              />
            </div>
          ))}
        </div>

        <p className={LABEL_CLASS}>Inverter temperatures — 4 values (one per inverter) (°C)</p>
        <div className="grid grid-cols-4 gap-2 mb-4">
          {traction.tcms_inverter_temperature_C.map((val, i) => (
            <div key={i}>
              <label className="text-[9px] text-[#8A91A8] font-mono">INV{i + 1}</label>
              <input
                type="number"
                step={1}
                min={0}
                max={150}
                placeholder="—"
                value={val === null ? '' : val}
                onChange={e => updateInverterTemp(i, e.target.value === '' ? null : parseFloat(e.target.value))}
                className={clsx(BASE_INPUT, 'px-2 py-1.5 text-[12px]', statusBorderClass(getInverterTempStatus(val)))}
              />
            </div>
          ))}
        </div>

        <FaultLogSection
          faults={traction.fault_log}
          onChange={faults => patchTraction({ fault_log: faults })}
        />
      </Section>

      {/* ── Section G: Aerodynamic Profile ──────────────────────────────────── */}
      <Section id="G" title="Aerodynamic Profile">
        <p className={HINT_CLASS + ' mb-3'}>
          Measurements from tape measure / vernier. Nose length feeds Cd interpolation via
          RTRI nose-Cd correlation (RTRI Quarterly Vol.45 No.2, 2004).
          Frontal area computed from car width × height.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumInput
            label="Nose Length (m)"
            hint={`Nom ${VB_NOMINAL.nose_length_m} m | RTRI Cd correlation: 3–15 m`}
            value={aero.nose_length_m}
            status={
              aero.nose_length_m === null ? 'empty' :
              aero.nose_length_m < 3 || aero.nose_length_m > 15 ? 'warn' : 'ok'
            }
            step={0.05} min={1} max={20}
            onChange={v => patchAero({ nose_length_m: v })}
          />
          <NumInput
            label="Car Body Width — Skirt level (mm)"
            hint={`Nom ${Math.round(VB_NOMINAL.car_width_m * 1000)} mm`}
            value={aero.car_body_width_skirt_mm}
            step={1} min={2000} max={4000}
            onChange={v => patchAero({ car_body_width_skirt_mm: v })}
          />
          <NumInput
            label="Car Body Width — Window level (mm)"
            hint="Widest point of car body"
            value={aero.car_body_width_window_mm}
            step={1} min={2000} max={4000}
            onChange={v => patchAero({ car_body_width_window_mm: v })}
          />
          <NumInput
            label="Car Body Width — Roof level (mm)"
            hint="At roof/gutter level"
            value={aero.car_body_width_roof_mm}
            step={1} min={2000} max={4000}
            onChange={v => patchAero({ car_body_width_roof_mm: v })}
          />
          <NumInput
            label="Car Body Height (mm)"
            hint={`Nom ${Math.round(VB_NOMINAL.car_height_m * 1000)} mm (rail to roof)`}
            value={aero.car_body_height_mm}
            step={1} min={3000} max={5500}
            onChange={v => patchAero({ car_body_height_mm: v })}
          />
          <NumInput
            label="Inter-car Gap (mm)"
            hint="Gap between adjacent car end-walls"
            value={aero.inter_car_gap_mm}
            step={1} min={0} max={500}
            onChange={v => patchAero({ inter_car_gap_mm: v })}
          />
          <NumInput
            label="Bogie Skirt Coverage (%)"
            hint="Visual estimate of skirt coverage over bogie"
            value={aero.bogie_skirt_coverage_pct}
            step={1} min={0} max={100}
            onChange={v => patchAero({ bogie_skirt_coverage_pct: v })}
          />
          <NumInput
            label="Roof HVAC Height (mm)"
            hint="Height of HVAC unit above roof"
            value={aero.roof_hvac_height_mm}
            step={1} min={0} max={600}
            onChange={v => patchAero({ roof_hvac_height_mm: v })}
          />
          <NumInput
            label="Roof HVAC Width (mm)"
            hint="Width of HVAC unit at roofline"
            value={aero.roof_hvac_width_mm}
            step={1} min={0} max={1500}
            onChange={v => patchAero({ roof_hvac_width_mm: v })}
          />
        </div>

        {/* Coupler + gauge — convenience placement at end of last section */}
        <div className="mt-4 pt-4 border-t border-[#D8DFEE]">
          <p className={SECTION_HDR}>Additional track/coupler measurements</p>
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label="Coupler Height Above Rail (mm)"
              hint="Nominal 1105 mm (broad gauge std)"
              value={record.coupler_height_above_rail_mm}
              step={1} min={900} max={1300}
              onChange={v => setRecord(r => ({ ...r, coupler_height_above_rail_mm: v }))}
            />
            <NumInput
              label="Actual Track Gauge (mm)"
              hint={`BG standard 1676 mm | Tolerance ±6 mm`}
              value={record.track_gauge_actual_mm}
              status={
                record.track_gauge_actual_mm === null ? 'empty' :
                Math.abs(record.track_gauge_actual_mm - 1676) > 10 ? 'err' :
                Math.abs(record.track_gauge_actual_mm - 1676) > 6  ? 'warn' : 'ok'
              }
              step={0.5} min={1640} max={1720}
              onChange={v => setRecord(r => ({ ...r, track_gauge_actual_mm: v }))}
            />
          </div>
        </div>
      </Section>

      {/* ── Sticky bottom bar ────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-[#D8DFEE] px-4 py-3 flex items-center justify-between mt-2">
        <p className="text-[11px] text-[#8A91A8] font-sans">
          All values stored as-measured. Null fields use VB nominal in simulation.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLoadPrevious}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              border border-[#D8DFEE] bg-white text-[#003893]
              text-[12px] font-sans hover:border-[#003893] hover:bg-[#E8F0FB]
              transition-colors
            "
          >
            <FolderOpen size={13} /> Load Previous
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="
              flex items-center gap-1.5 px-4 py-1.5 rounded-lg
              bg-[#003893] text-white text-[12px] font-sans font-medium
              hover:bg-[#002B74] active:bg-[#001E55]
              disabled:opacity-60 disabled:cursor-not-allowed
              transition-colors
            "
          >
            <Save size={13} /> {saving ? 'Saving…' : 'Save to Supabase'}
          </button>
        </div>
      </div>
    </div>
  );
}
