/**
 * components/ui/MetricDisplay.tsx
 *
 * Large monospace physics metric display — used in the right panel cards.
 *
 * Anatomy:
 *  [Label]
 *  [Large number]  [unit]
 *  [Optional change indicator: ▲/▼ +Δvalue]  [Optional sub-label]
 *
 * Design notes:
 *  - Number uses DM Mono, tabular figures, at 1.75rem
 *  - Unit uses DM Mono at 0.8rem, muted colour
 *  - Change indicator: green arrow for improvement, red for degradation
 *  - "Improvement" direction is configurable — for disc temperature, lower is better
 *  - All outputs are strings to accommodate formatted values ("1 247" vs raw 1247)
 *
 * Props:
 *  label        — section label (DM Sans uppercase tracking, muted)
 *  value        — primary number as string, e.g. "247.3"
 *  unit         — unit string, e.g. "km/h" or "N"
 *  change       — optional ± change value as string, e.g. "+12.4"
 *  changeLabel  — optional descriptor, e.g. "vs nominal"
 *  higherIsBetter — controls arrow colour; default true (higher = green)
 *  size         — 'sm' | 'md' | 'lg' — controls font sizes
 *  loading      — show skeleton shimmer instead of value
 */

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type MetricSize = 'sm' | 'md' | 'lg';

export interface MetricDisplayProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit: string;
  change?: string | number;
  changeLabel?: string;
  higherIsBetter?: boolean;
  size?: MetricSize;
  loading?: boolean;
  /** If provided, shown below unit label as contextual note */
  note?: string;
}

/* ── Size maps ────────────────────────────────────────────────────────────── */

const valueSizes: Record<MetricSize, string> = {
  sm: 'text-xl',
  md: 'text-2xl',
  lg: 'text-3xl',
};

const unitSizes: Record<MetricSize, string> = {
  sm: 'text-[0.7rem]',
  md: 'text-[0.8125rem]',
  lg: 'text-[0.9375rem]',
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function parseChangeDirection(change: string | number): 'up' | 'down' | 'neutral' {
  const n = typeof change === 'string' ? parseFloat(change) : change;
  if (isNaN(n) || n === 0) return 'neutral';
  return n > 0 ? 'up' : 'down';
}

/* ── Component ────────────────────────────────────────────────────────────── */

export const MetricDisplay = React.forwardRef<HTMLDivElement, MetricDisplayProps>(
  (
    {
      label,
      value,
      unit,
      change,
      changeLabel,
      higherIsBetter = true,
      size = 'md',
      loading = false,
      note,
      className,
      ...props
    },
    ref
  ) => {
    const direction = change !== undefined ? parseChangeDirection(change) : null;

    /* Determine whether this direction is "good" or "bad" */
    const isPositive =
      direction === 'neutral'
        ? null
        : direction === 'up'
        ? higherIsBetter
        : !higherIsBetter;

    /* Arrow icon */
    const ArrowIcon =
      direction === 'up'
        ? TrendingUp
        : direction === 'down'
        ? TrendingDown
        : Minus;

    const arrowColour =
      direction === 'neutral' || isPositive === null
        ? 'text-text-muted'
        : isPositive
        ? 'text-status-ok'
        : 'text-status-err';

    const changeTextColour =
      direction === 'neutral' || isPositive === null
        ? 'text-text-muted'
        : isPositive
        ? 'text-status-ok'
        : 'text-status-err';

    return (
      <div
        ref={ref}
        className={twMerge(clsx('flex flex-col gap-0.5', className))}
        {...props}
      >
        {/* Label */}
        <span className="section-label text-[10px]">{label}</span>

        {/* Value row */}
        {loading ? (
          <div className="flex items-end gap-1.5 mt-0.5">
            <div
              className="skeleton rounded"
              style={{ height: size === 'sm' ? 24 : size === 'lg' ? 36 : 28, width: 80 }}
            />
            <div className="skeleton rounded h-3.5 w-10 mb-1" />
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className={clsx(
                'font-mono tabnum font-medium text-text-primary leading-none',
                valueSizes[size]
              )}
            >
              {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
            </span>
            <span
              className={clsx(
                'font-mono text-text-muted leading-none self-end pb-0.5',
                unitSizes[size]
              )}
            >
              {unit}
            </span>
          </div>
        )}

        {/* Change indicator row */}
        {!loading && change !== undefined && (
          <div className="flex items-center gap-1 mt-0.5">
            <ArrowIcon
              size={11}
              className={clsx('shrink-0', arrowColour)}
              aria-hidden="true"
            />
            <span
              className={clsx(
                'font-mono text-[0.6875rem] tabnum font-medium',
                changeTextColour
              )}
            >
              {typeof change === 'number'
                ? `${change > 0 ? '+' : ''}${change.toLocaleString('en-IN')}`
                : change}
            </span>
            {changeLabel && (
              <span className="text-[0.6875rem] text-text-muted font-sans">
                {changeLabel}
              </span>
            )}
          </div>
        )}

        {/* Contextual note */}
        {note && (
          <span className="text-[10px] text-text-muted font-sans leading-tight mt-0.5">
            {note}
          </span>
        )}
      </div>
    );
  }
);

MetricDisplay.displayName = 'MetricDisplay';
