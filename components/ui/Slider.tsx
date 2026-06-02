/**
 * components/ui/Slider.tsx
 *
 * Labelled range slider wrapping @radix-ui/react-slider.
 *
 * Features:
 *  - IR blue track fill behind handle (via CSS clip/gradient trick)
 *  - Current value displayed above the thumb handle (follows position)
 *  - Label on the left, current formatted value on the right
 *  - Min/max labels below the track
 *  - Unit string appended to value
 *  - Optional step and value formatter
 *  - Fully accessible — keyboard navigable, ARIA labels applied
 *
 * Usage:
 *  <Slider
 *    label="Train Speed"
 *    value={speed}
 *    onValueChange={(v) => setSpeed(v)}
 *    min={160} max={320} step={10}
 *    unit="km/h"
 *    formatValue={(v) => v.toFixed(0)}
 *  />
 */

'use client';

import * as React from 'react';
import * as RadixSlider from '@radix-ui/react-slider';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* ── Types ────────────────────────────────────────────────────────────────── */

export interface SliderProps {
  label: string;
  /** Current value (controlled) */
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Custom formatter for the displayed value string */
  formatValue?: (value: number) => string;
  /** Custom formatter for min/max tick labels */
  formatTick?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  /** aria-label for the slider thumb */
  ariaLabel?: string;
}

/* ── Default formatters ───────────────────────────────────────────────────── */

const defaultFormat = (v: number): string =>
  Number.isInteger(v) ? v.toString() : v.toFixed(1);

/* ── Component ────────────────────────────────────────────────────────────── */

export function Slider({
  label,
  value,
  onValueChange,
  min,
  max,
  step = 1,
  unit = '',
  formatValue = defaultFormat,
  formatTick = defaultFormat,
  disabled = false,
  className,
  ariaLabel,
}: SliderProps) {
  /* Compute fill percentage for the blue "active track" segment */
  const fillPct = ((value - min) / (max - min)) * 100;
  const displayValue = `${formatValue(value)}${unit ? ' ' + unit : ''}`;

  return (
    <div className={twMerge(clsx('flex flex-col gap-1', className))}>
      {/* ── Label row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <label
          className="text-xs font-medium text-text-secondary font-sans select-none"
          htmlFor={undefined} /* Radix handles id binding */
        >
          {label}
        </label>
        <span
          className="font-mono text-xs tabnum font-medium text-ir-blue"
          aria-live="polite"
          aria-atomic="true"
        >
          {displayValue}
        </span>
      </div>

      {/* ── Radix Slider ──────────────────────────────────────────────────── */}
      <div className="relative py-2.5">
        <RadixSlider.Root
          value={[value]}
          onValueChange={([v]) => onValueChange(v)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-label={ariaLabel ?? label}
          className={clsx(
            'relative flex items-center w-full h-5 select-none touch-none',
            disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
          )}
        >
          {/* Track */}
          <RadixSlider.Track className="relative flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
            {/* Active (filled) portion — IR blue */}
            <div
              className="absolute inset-y-0 left-0 bg-ir-blue rounded-full transition-none"
              style={{ width: `${fillPct}%` }}
              aria-hidden="true"
            />
            {/* Radix range (hidden — we draw our own fill above) */}
            <RadixSlider.Range className="absolute h-full opacity-0" />
          </RadixSlider.Track>

          {/* Thumb */}
          <RadixSlider.Thumb
            className={clsx(
              'group relative block w-4 h-4 rounded-full',
              'bg-white border-2 border-ir-blue shadow-card',
              'hover:border-ir-blue-light hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-2',
              'focus-visible:ring-ir-blue/50 focus-visible:ring-offset-1',
              'active:scale-105 transition-transform duration-100',
              'cursor-grab active:cursor-grabbing'
            )}
          >
            {/* Value tooltip above thumb — visible on hover/focus/active */}
            <span
              className={clsx(
                'absolute bottom-[calc(100%+5px)] left-1/2 -translate-x-1/2',
                'bg-ir-blue text-white text-[10px] font-mono tabnum',
                'px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none',
                'shadow-float opacity-0 scale-90 origin-bottom',
                'group-hover:opacity-100 group-hover:scale-100',
                'group-focus-visible:opacity-100 group-focus-visible:scale-100',
                'group-active:opacity-100 group-active:scale-100',
                'transition-all duration-150'
              )}
              aria-hidden="true"
            >
              {displayValue}
              {/* Arrow caret */}
              <span
                className="absolute top-full left-1/2 -translate-x-1/2 -mt-px"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderRight: '4px solid transparent',
                  borderTop: '4px solid #003893',
                }}
              />
            </span>
          </RadixSlider.Thumb>
        </RadixSlider.Root>
      </div>

      {/* ── Min / Max tick labels ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-text-muted tabnum">
          {formatTick(min)}{unit ? ' ' + unit : ''}
        </span>
        <span className="text-[10px] font-mono text-text-muted tabnum">
          {formatTick(max)}{unit ? ' ' + unit : ''}
        </span>
      </div>
    </div>
  );
}
