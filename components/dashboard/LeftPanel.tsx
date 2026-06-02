'use client';

/**
 * LeftPanel.tsx — 280px left sidebar for VBHSR-SIM.
 *
 * Mode A — Navigation: vertical tab list with status dots.
 * Mode B — Field Data: scrollable measurement entry forms.
 *
 * Status dots reflect physics result states (ok / warn / err / pending).
 * Field data forms update the Zustand store on each input blur.
 */

import React, { useState, useCallback } from 'react';
import {
  Wind, Activity, BrainCircuit, Zap, BarChart3,
  RadioTower, Wrench, FileBarChart, Globe,
  ChevronRight,
} from 'lucide-react';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import { useSimulationStore, type SimTab, type SimulationStore } from '@/store/simulation';
import type { FieldDataRecord } from '@/lib/types';

// ── Navigation tab definitions ─────────────────────────────────────────────────

interface NavEntry {
  id:       SimTab;
  label:    string;
  sublabel: string;
  icon:     React.ElementType;
  getStatus: (store: SimulationStore) => 'ok' | 'warn' | 'err' | 'pending' | 'idle';
}

const NAV_ENTRIES: NavEntry[] = [
  {
    id: 'overview', label: 'Overview', sublabel: 'System summary',
    icon: Globe,
    getStatus: ({ results }) => results ? 'ok' : 'idle',
  },
  {
    id: 'aerodynamics', label: 'Aerodynamics', sublabel: 'Davis · Drag · Tunnel',
    icon: Wind,
    getStatus: ({ results }) => {
      if (!results?.aero) return 'idle';
      return results.aero.Cd < 0.25 ? 'ok' : results.aero.Cd < 0.30 ? 'warn' : 'err';
    },
  },
  {
    id: 'dynamics', label: 'Dynamics', sublabel: 'Hunting · Nadal · Klingel',
    icon: Activity,
    getStatus: ({ results }) => {
      if (!results?.dynamics) return 'idle';
      const { nadal_exceeds, safety_margin_kmh } = results.dynamics;
      if (nadal_exceeds) return 'err';
      if (safety_margin_kmh < 20) return 'warn';
      return 'ok';
    },
  },
  {
    id: 'braking', label: 'Braking', sublabel: 'ODE · Disc temp · Paris',
    icon: BrainCircuit,
    getStatus: ({ results }) => {
      if (!results?.braking) return 'idle';
      const { peak_disc_temp_C, stopping_distance_m } = results.braking;
      if (peak_disc_temp_C > 600 || stopping_distance_m > 3500) return 'err';
      if (peak_disc_temp_C > 450 || stopping_distance_m > 2800) return 'warn';
      return 'ok';
    },
  },
  {
    id: 'structural', label: 'Structural', sublabel: 'FEA · S-N · Paris',
    icon: Wrench,
    getStatus: ({ results }) => results ? 'ok' : 'idle',
  },
  {
    id: 'traction', label: 'Traction', sublabel: 'TE-V · Power budget',
    icon: Zap,
    getStatus: ({ results }) => {
      if (!results?.traction) return 'idle';
      return results.traction.max_speed_kmh >= 250 ? 'ok' : 'warn';
    },
  },
  {
    id: 'tunnel', label: 'Tunnel Pressure', sublabel: 'EN 14067-5 · MOC',
    icon: BarChart3,
    getStatus: ({ results }) => {
      if (!results?.tunnel) return 'idle';
      return results.tunnel.en14067_compliant ? 'ok' : 'err';
    },
  },
  {
    id: 'mahsr', label: 'MAHSR Readiness', sublabel: 'Composite score',
    icon: RadioTower,
    getStatus: ({ mahsrScore }) => {
      if (!mahsrScore) return 'idle';
      if (mahsrScore.composite >= 70) return 'ok';
      if (mahsrScore.composite >= 45) return 'warn';
      return 'err';
    },
  },
  {
    id: 'report', label: 'Report', sublabel: 'PDF generation',
    icon: FileBarChart,
    getStatus: ({ results }) => results ? 'ok' : 'idle',
  },
];

// ── Status dot ─────────────────────────────────────────────────────────────────

const STATUS_COLOUR: Record<string, string> = {
  ok:      'bg-status-ok',
  warn:    'bg-status-warn',
  err:     'bg-status-err',
  pending: 'bg-ir-orange animate-pulse-dot',
  idle:    'bg-surface-border',
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${STATUS_COLOUR[status] ?? STATUS_COLOUR.idle}`}
    />
  );
}

// ── Inspection context card ────────────────────────────────────────────────────

function InspectionCard() {
  const { fieldData, fieldDataCompleteness } = useSimulationStore();
  const meta = fieldData?.inspection_metadata;

  const completenessColour =
    fieldDataCompleteness >= 70 ? 'bg-emerald-500' :
    fieldDataCompleteness >= 40 ? 'bg-amber-500'   :
    fieldDataCompleteness  > 0  ? 'bg-rose-500'    :
                                  'bg-surface-border';

  return (
    <div className="mx-3 mt-3 mb-2 rounded-card bg-surface p-3 border border-surface-border shadow-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-sans uppercase tracking-widest text-text-muted">
          Inspection Context
        </span>
        <span className="font-mono text-[10px] text-text-muted">
          {fieldDataCompleteness}% complete
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        {[
          { k: 'Location', v: meta?.location === 'jheel' ? 'Jheel Siding' : meta?.location === 'rncc' ? 'RNCC Patna' : '—' },
          { k: 'Coach',    v: meta?.coach_number ?? '—' },
          { k: 'Type',     v: meta?.train_type === 'vb_sleeper' ? 'VB Sleeper' : meta?.train_type === 'vb_chair' ? 'VB Chair' : '—' },
          { k: 'Date',     v: meta?.date ?? '—' },
        ].map(({ k, v }) => (
          <div key={k} className="flex flex-col leading-none">
            <span className="text-[9px] font-sans text-text-muted uppercase tracking-wider">{k}</span>
            <span className="font-mono text-[11px] text-text-primary mt-0.5">{v}</span>
          </div>
        ))}
      </div>

      {/* Completeness bar */}
      <div className="w-full h-1 rounded-pill bg-surface-border overflow-hidden">
        <div
          className={`h-full rounded-pill transition-all duration-500 ${completenessColour}`}
          style={{ width: `${fieldDataCompleteness}%` }}
        />
      </div>
    </div>
  );
}

// ── Navigation list ────────────────────────────────────────────────────────────

function NavigationList() {
  const store     = useSimulationStore();
  const activeTab = store.activeTab;
  const setTab    = store.setActiveTab;

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {NAV_ENTRIES.map(entry => {
        const isActive = activeTab === entry.id;
        const status   = entry.getStatus(store);
        const Icon     = entry.icon;

        return (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`
              flex items-center gap-2.5 px-3 py-2.5 rounded text-left
              transition-all duration-150
              ${isActive
                ? 'bg-ir-50 border border-ir-200'
                : 'hover:bg-surface border border-transparent'
              }
            `}
          >
            {/* Icon */}
            <Icon
              className={`w-4 h-4 shrink-0 ${isActive ? 'text-ir-blue' : 'text-text-muted'}`}
            />

            {/* Labels */}
            <div className="flex flex-col leading-none min-w-0 flex-1">
              <span
                className={`text-[12px] font-sans font-medium truncate ${
                  isActive ? 'text-ir-blue' : 'text-text-primary'
                }`}
              >
                {entry.label}
              </span>
              <span className="text-[10px] font-sans text-text-muted truncate mt-0.5">
                {entry.sublabel}
              </span>
            </div>

            {/* Status dot */}
            <StatusDot status={status} />

            {/* Active chevron */}
            {isActive && (
              <ChevronRight className="w-3 h-3 text-ir-blue shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Field data forms ───────────────────────────────────────────────────────────
// Provides editable inputs for the most critical measurements.
// Less common measurements are left for JSON file upload.

type FieldKey = string;

interface MeasurementRowProps {
  label:       string;
  unit:        string;
  value:       number | string | null;
  fieldKey:    FieldKey;
  onCommit:    (key: FieldKey, value: number | null) => void;
  placeholder?: string;
}

function MeasurementRow({ label, unit, value, fieldKey, onCommit, placeholder }: MeasurementRowProps) {
  const [local, setLocal] = useState<string>(value !== null && value !== undefined ? String(value) : '');

  const handleBlur = () => {
    const parsed = local.trim() === '' ? null : parseFloat(local);
    if (parsed !== null && isNaN(parsed)) return;  // ignore non-numeric input
    onCommit(fieldKey, parsed);
  };

  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] font-sans text-text-secondary truncate">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={handleBlur}
          placeholder={placeholder ?? '—'}
          className="
            w-20 px-2 py-0.5 rounded text-right
            font-mono text-[11px] text-text-primary
            border border-surface-border bg-surface
            focus:outline-none focus:ring-1 focus:ring-ir-blue focus:border-ir-blue
            transition-colors
          "
        />
        <span className="text-[9px] font-mono text-text-muted w-8 text-right">{unit}</span>
      </div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1">
      <span className="text-[9px] font-sans uppercase tracking-widest text-text-muted">{children}</span>
      <div className="flex-1 h-px bg-surface-border" />
    </div>
  );
}

function FieldDataForms() {
  const { fieldData, setFieldData } = useSimulationStore();

  // Build a mutable working copy; updates are applied immutably
  const commit = useCallback(
    (path: string[], value: number | null) => {
      if (!fieldData) return;

      // Deep-set utility for nested paths like ['aerodynamic_measurements', 'nose_length_m']
      const deepSet = (obj: Record<string, unknown>, keys: string[], val: unknown): Record<string, unknown> => {
        const [head, ...tail] = keys;
        if (tail.length === 0) return { ...obj, [head]: val };
        return { ...obj, [head]: deepSet((obj[head] as Record<string, unknown>) ?? {}, tail, val) };
      };

      const updated = deepSet(fieldData as unknown as Record<string, unknown>, path, value);
      setFieldData(updated as unknown as FieldDataRecord);
    },
    [fieldData, setFieldData]
  );

  if (!fieldData) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 px-4 text-center">
        <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center border border-surface-border">
          <Wrench className="w-5 h-5 text-text-muted" />
        </div>
        <p className="text-[12px] font-sans text-text-secondary leading-snug">
          No field data loaded.<br />
          Use <span className="font-mono text-ir-blue">Load Field Data</span> in the top bar<br />
          to import a JSON inspection record.
        </p>
      </div>
    );
  }

  const aero  = fieldData.aerodynamic_measurements;
  const panto = fieldData.pantograph_measurements;
  const ws0   = fieldData.wheelset_measurements[0];
  const b0    = fieldData.bogie_measurements[0];

  return (
    <div className="px-3 pb-4">
      {/* Aerodynamic */}
      <SectionHeading>Aerodynamic</SectionHeading>
      <MeasurementRow
        label="Nose length"   unit="m"   fieldKey="nose_length_m"
        value={aero.nose_length_m}
        onCommit={(_, v) => commit(['aerodynamic_measurements', 'nose_length_m'], v)}
      />
      <MeasurementRow
        label="Car width (skirt)" unit="mm" fieldKey="car_body_width_skirt_mm"
        value={aero.car_body_width_skirt_mm}
        onCommit={(_, v) => commit(['aerodynamic_measurements', 'car_body_width_skirt_mm'], v)}
      />
      <MeasurementRow
        label="Car height"     unit="mm" fieldKey="car_body_height_mm"
        value={aero.car_body_height_mm}
        onCommit={(_, v) => commit(['aerodynamic_measurements', 'car_body_height_mm'], v)}
      />
      <MeasurementRow
        label="Inter-car gap"  unit="mm" fieldKey="inter_car_gap_mm"
        value={aero.inter_car_gap_mm}
        onCommit={(_, v) => commit(['aerodynamic_measurements', 'inter_car_gap_mm'], v)}
      />
      <MeasurementRow
        label="Bogie skirt"    unit="%"  fieldKey="bogie_skirt_coverage_pct"
        value={aero.bogie_skirt_coverage_pct}
        onCommit={(_, v) => commit(['aerodynamic_measurements', 'bogie_skirt_coverage_pct'], v)}
      />

      {/* Wheelset B1A1 */}
      {ws0 && (
        <>
          <SectionHeading>Wheelset {ws0.wheelset_id}</SectionHeading>
          <MeasurementRow
            label="Wheel dia. L"  unit="mm" fieldKey="wheel_diameter_left_mm"
            value={ws0.wheel_diameter_left_mm}
            onCommit={(_, v) => {
              const updated = { ...ws0, wheel_diameter_left_mm: v };
              const wsets = [...fieldData.wheelset_measurements];
              wsets[0] = updated;
              setFieldData({ ...fieldData, wheelset_measurements: wsets });
            }}
          />
          <MeasurementRow
            label="Back-to-back"  unit="mm" fieldKey="back_to_back_mm"
            value={ws0.back_to_back_mm}
            onCommit={(_, v) => {
              const updated = { ...ws0, back_to_back_mm: v };
              const wsets = [...fieldData.wheelset_measurements];
              wsets[0] = updated;
              setFieldData({ ...fieldData, wheelset_measurements: wsets });
            }}
          />
          <MeasurementRow
            label="Flange ht. L"  unit="mm" fieldKey="flange_height_left_mm"
            value={ws0.flange_height_left_mm}
            onCommit={(_, v) => {
              const updated = { ...ws0, flange_height_left_mm: v };
              const wsets = [...fieldData.wheelset_measurements];
              wsets[0] = updated;
              setFieldData({ ...fieldData, wheelset_measurements: wsets });
            }}
          />
          <MeasurementRow
            label="Tread hollow L" unit="mm" fieldKey="tread_hollow_left_mm"
            value={ws0.tread_hollow_left_mm}
            onCommit={(_, v) => {
              const updated = { ...ws0, tread_hollow_left_mm: v };
              const wsets = [...fieldData.wheelset_measurements];
              wsets[0] = updated;
              setFieldData({ ...fieldData, wheelset_measurements: wsets });
            }}
          />
        </>
      )}

      {/* Bogie B1 */}
      {b0 && (
        <>
          <SectionHeading>Bogie {b0.bogie_id}</SectionHeading>
          <MeasurementRow
            label="Air spring L"  unit="bar" fieldKey="air_spring_pressure_left_bar"
            value={b0.air_spring_pressure_left_bar}
            onCommit={(_, v) => {
              const updated = { ...b0, air_spring_pressure_left_bar: v };
              const bogs = [...fieldData.bogie_measurements];
              bogs[0] = updated;
              setFieldData({ ...fieldData, bogie_measurements: bogs });
            }}
          />
          <MeasurementRow
            label="Air spring R"  unit="bar" fieldKey="air_spring_pressure_right_bar"
            value={b0.air_spring_pressure_right_bar}
            onCommit={(_, v) => {
              const updated = { ...b0, air_spring_pressure_right_bar: v };
              const bogs = [...fieldData.bogie_measurements];
              bogs[0] = updated;
              setFieldData({ ...fieldData, bogie_measurements: bogs });
            }}
          />
          <MeasurementRow
            label="Air spr. ht. FL" unit="mm" fieldKey="air_spring_height_fl_mm"
            value={b0.air_spring_height_fl_mm}
            onCommit={(_, v) => {
              const updated = { ...b0, air_spring_height_fl_mm: v };
              const bogs = [...fieldData.bogie_measurements];
              bogs[0] = updated;
              setFieldData({ ...fieldData, bogie_measurements: bogs });
            }}
          />
        </>
      )}

      {/* Pantograph */}
      <SectionHeading>Pantograph</SectionHeading>
      <MeasurementRow
        label="Contact force"  unit="N"  fieldKey="static_contact_force_N"
        value={panto.static_contact_force_N}
        onCommit={(_, v) => commit(['pantograph_measurements', 'static_contact_force_N'], v)}
      />
    </div>
  );
}

// ── LeftPanel ──────────────────────────────────────────────────────────────────

export function LeftPanel() {
  const { leftPanelMode, setLeftPanelMode } = useSimulationStore();

  return (
    <aside
      className="flex flex-col bg-white border-r border-surface-border shrink-0"
      style={{ width: 280 }}
    >
      {/* Inspection context card — always visible */}
      <InspectionCard />

      {/* Mode toggle */}
      <div className="flex mx-3 mb-2 rounded overflow-hidden border border-surface-border shrink-0">
        {(['navigation', 'field_data'] as const).map(mode => {
          const active = leftPanelMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setLeftPanelMode(mode)}
              className={`
                flex-1 py-1.5 text-[11px] font-sans font-medium transition-colors
                ${active ? 'bg-ir-blue text-white' : 'bg-white text-text-secondary hover:bg-surface'}
              `}
            >
              {mode === 'navigation' ? 'Navigation' : 'Field Data'}
            </button>
          );
        })}
      </div>

      {/* Scrollable content area */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="w-full h-full">
          {leftPanelMode === 'navigation' ? <NavigationList /> : <FieldDataForms />}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          orientation="vertical"
          className="flex w-1.5 p-0.5 touch-none select-none transition-colors"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-surface-border" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
