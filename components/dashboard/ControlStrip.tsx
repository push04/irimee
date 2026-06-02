'use client';

/**
 * ControlStrip.tsx — 48px horizontal control bar below the 3D viewport.
 *
 * Contains: GAUGE / NOSE / SPEED / MOTOR sliders, DISC radio, CARS radio,
 * PRESET dropdown, MAHSR toggle.
 *
 * All Radix UI primitives. Slider track fills IR Blue.
 * On any change: Zustand store is updated (does NOT auto-trigger compute —
 * the user presses "Run Simulation" explicitly to avoid thrashing).
 */

import React, { useCallback } from 'react';
import * as Slider from '@radix-ui/react-slider';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Check } from 'lucide-react';
import { useSimulationStore } from '@/store/simulation';
import type { SimulationParams } from '@/lib/types';

// ── Constants ──────────────────────────────────────────────────────────────────

const DISC_OPTIONS: { value: SimulationParams['disc_type']; label: string }[] = [
  { value: 'grey_cast_iron', label: 'Grey Iron' },
  { value: 'composite',      label: 'Composite' },
  { value: 'carbon_ceramic', label: 'C-C'       },
];

const PRESET_OPTIONS: { value: string; label: string }[] = [
  { value: 'vb_chair',     label: 'VB Chair Car'         },
  { value: 'vb_sleeper',   label: 'VB Sleeper'           },
  { value: 'b28_target',   label: 'B-28 HSR Target'      },
  { value: 'e5_shinkansen',label: 'E5 Shinkansen'        },
  { value: 'n700s',        label: 'N700S Shinkansen'     },
];

// ── Slider item ────────────────────────────────────────────────────────────────

interface SliderItemProps {
  label:   string;
  unit:    string;
  value:   number;
  min:     number;
  max:     number;
  step:    number;
  width:   number;   // px
  onChange: (v: number) => void;
  formatValue?: (v: number) => string;
}

function SliderItem({
  label, unit, value, min, max, step, width, onChange, formatValue,
}: SliderItemProps) {
  const display = formatValue ? formatValue(value) : String(value);

  return (
    <div className="flex flex-col justify-center gap-0.5 shrink-0" style={{ width }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] font-sans uppercase tracking-widest text-text-muted">
          {label}
        </span>
        <span className="font-mono text-[11px] font-medium text-ir-blue leading-none">
          {display}
          <span className="text-[9px] text-text-muted ml-0.5">{unit}</span>
        </span>
      </div>

      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-4"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      >
        <Slider.Track className="relative grow rounded-full h-1 bg-surface-border overflow-hidden">
          <Slider.Range className="absolute h-full rounded-full" style={{ background: '#003893' }} />
        </Slider.Track>
        <Slider.Thumb
          className="
            block w-3 h-3 rounded-full
            border-2 border-ir-blue bg-white
            shadow-card
            focus:outline-none focus-visible:ring-2 focus-visible:ring-ir-blue focus-visible:ring-offset-1
            transition-transform hover:scale-110
          "
        />
      </Slider.Root>
    </div>
  );
}

// ── Radio group ────────────────────────────────────────────────────────────────

interface RadioGroupProps<T extends string> {
  label:    string;
  options:  { value: T; label: string }[];
  value:    T;
  onChange: (v: T) => void;
}

function RadioGroup<T extends string>({ label, options, value, onChange }: RadioGroupProps<T>) {
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-[9px] font-sans uppercase tracking-widest text-text-muted">{label}</span>
      <div className="flex items-center gap-1">
        {options.map(opt => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`
                px-2 py-0.5 rounded text-[10px] font-mono font-medium
                border transition-all duration-100
                ${active
                  ? 'bg-ir-blue text-white border-ir-blue'
                  : 'bg-white text-text-secondary border-surface-border hover:border-ir-blue hover:text-ir-blue'
                }
              `}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Preset select ──────────────────────────────────────────────────────────────

interface PresetSelectProps {
  value:    string;
  onChange: (v: string) => void;
}

function PresetSelect({ value, onChange }: PresetSelectProps) {
  const current = PRESET_OPTIONS.find(o => o.value === value);

  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-[9px] font-sans uppercase tracking-widest text-text-muted">Preset</span>

      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger
          className="
            flex items-center justify-between gap-1
            px-2 py-0.5 rounded
            border border-surface-border bg-white
            text-[10px] font-mono font-medium text-text-primary
            hover:border-ir-blue transition-colors
            focus:outline-none focus:ring-1 focus:ring-ir-blue
            w-36
          "
          aria-label="Train preset"
        >
          <Select.Value>{current?.label ?? 'Select…'}</Select.Value>
          <Select.Icon>
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </Select.Icon>
        </Select.Trigger>

        <Select.Portal>
          <Select.Content
            className="
              z-50 min-w-[160px] bg-white rounded border border-surface-border
              shadow-panel overflow-hidden
              data-[side=bottom]:animate-slide-up
            "
            position="popper"
            sideOffset={4}
          >
            <Select.Viewport>
              {PRESET_OPTIONS.map(opt => (
                <Select.Item
                  key={opt.value}
                  value={opt.value}
                  className="
                    flex items-center gap-2 px-3 py-1.5
                    text-[11px] font-mono text-text-primary
                    cursor-pointer select-none
                    hover:bg-ir-50 focus:bg-ir-50
                    data-[highlighted]:bg-ir-50
                    outline-none
                  "
                >
                  <Select.ItemIndicator>
                    <Check className="w-3 h-3 text-ir-blue" />
                  </Select.ItemIndicator>
                  <Select.ItemText>{opt.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

// ── MAHSR toggle ───────────────────────────────────────────────────────────────

interface MAHSRToggleProps {
  value:    boolean;
  onChange: (v: boolean) => void;
}

function MAHSRToggle({ value, onChange }: MAHSRToggleProps) {
  return (
    <div className="flex flex-col gap-0.5 items-center shrink-0">
      <span className="text-[9px] font-sans uppercase tracking-widest text-text-muted">MAHSR</span>
      <div className="flex items-center gap-1.5">
        <Switch.Root
          checked={value}
          onCheckedChange={onChange}
          className="
            relative inline-flex h-4 w-7 shrink-0 cursor-pointer
            rounded-pill border border-surface-border
            bg-surface-muted
            transition-colors duration-200
            data-[state=checked]:bg-ir-blue data-[state=checked]:border-ir-blue
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ir-blue
          "
          aria-label="Toggle MAHSR mode"
        >
          <Switch.Thumb
            className="
              pointer-events-none block h-3 w-3 rounded-full bg-white
              shadow-sm transition-transform duration-200
              translate-x-0.5
              data-[state=checked]:translate-x-3
            "
          />
        </Switch.Root>
        <span className={`text-[10px] font-mono ${value ? 'text-ir-blue font-semibold' : 'text-text-muted'}`}>
          {value ? 'ON' : 'OFF'}
        </span>
      </div>
    </div>
  );
}

// ── ControlStrip ───────────────────────────────────────────────────────────────

export function ControlStrip() {
  const { params, setParams, applyPreset } = useSimulationStore();

  const set = useCallback(
    (patch: Partial<SimulationParams>) => setParams(patch),
    [setParams]
  );

  return (
    <div
      className="
        flex items-center gap-5 px-5
        bg-white border-t border-surface-border
        shrink-0 overflow-x-auto
      "
      style={{ height: 48 }}
    >
      {/* GAUGE */}
      <SliderItem
        label="Gauge"
        unit="mm"
        value={params.gauge_mm}
        min={1435}
        max={1676}
        step={1}
        width={120}
        onChange={v => set({ gauge_mm: v })}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* NOSE LENGTH */}
      <SliderItem
        label="Nose"
        unit="m"
        value={params.nose_length_m}
        min={3}
        max={15}
        step={0.5}
        width={110}
        onChange={v => set({ nose_length_m: v })}
        formatValue={v => v.toFixed(1)}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* SPEED */}
      <SliderItem
        label="Speed"
        unit="km/h"
        value={params.speed_kmh}
        min={0}
        max={320}
        step={5}
        width={120}
        onChange={v => set({ speed_kmh: v })}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* MOTOR POWER */}
      <SliderItem
        label="Motor"
        unit="kW"
        value={params.motor_power_kw}
        min={100}
        max={400}
        step={10}
        width={110}
        onChange={v => set({ motor_power_kw: v })}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* DISC TYPE */}
      <RadioGroup<SimulationParams['disc_type']>
        label="Disc"
        options={DISC_OPTIONS}
        value={params.disc_type}
        onChange={v => set({ disc_type: v })}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* CARS */}
      <RadioGroup<'8' | '16'>
        label="Cars"
        options={[
          { value: '8',  label: '8'  },
          { value: '16', label: '16' },
        ]}
        value={String(params.n_cars) as '8' | '16'}
        onChange={v => set({ n_cars: Number(v) as 8 | 16 })}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* PRESET */}
      <PresetSelect
        value={params.preset}
        onChange={key => applyPreset(key)}
      />

      <div className="h-7 w-px bg-surface-border shrink-0" />

      {/* MAHSR TOGGLE */}
      <MAHSRToggle
        value={params.mahsr_mode}
        onChange={v => set({ mahsr_mode: v })}
      />
    </div>
  );
}
