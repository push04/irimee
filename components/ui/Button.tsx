/**
 * components/ui/Button.tsx
 *
 * Polymorphic button component for VBHSR-SIM.
 *
 * Variants:
 *  primary  — IR blue fill (#003893), white text
 *  secondary — white background, IR blue border + text
 *  danger   — IR red fill (#CE1726), white text
 *  ghost    — no background/border, IR blue text on hover
 *
 * Sizes: sm (32px) | md (36px, default) | lg (44px)
 *
 * Features:
 *  - Loading spinner (disables interaction, keeps width stable)
 *  - Full TypeScript props including HTML button passthrough
 *  - clsx + tailwind-merge for safe class composition
 */

'use client';

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize    = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  /** Left-side icon (passed as JSX, e.g. <ArrowRight size={16} />) */
  icon?:     React.ReactNode;
  /** Right-side icon */
  iconRight?: React.ReactNode;
  children?: React.ReactNode;
}

/* ── Class maps ───────────────────────────────────────────────────────────── */

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-ir-blue text-white border border-ir-blue',
    'hover:bg-ir-700 hover:border-ir-700',
    'active:bg-ir-800 active:border-ir-800',
    'focus-visible:ring-2 focus-visible:ring-ir-blue/50 focus-visible:ring-offset-1',
    'disabled:bg-ir-200 disabled:border-ir-200 disabled:text-white/70 disabled:cursor-not-allowed',
  ].join(' '),

  secondary: [
    'bg-white text-ir-blue border border-surface-border',
    'hover:border-ir-blue hover:bg-ir-50',
    'active:bg-ir-100',
    'focus-visible:ring-2 focus-visible:ring-ir-blue/50 focus-visible:ring-offset-1',
    'disabled:text-text-muted disabled:border-surface-border disabled:cursor-not-allowed disabled:bg-surface-muted',
  ].join(' '),

  danger: [
    'bg-ir-red text-white border border-ir-red',
    'hover:bg-[#B01220] hover:border-[#B01220]',
    'active:bg-[#960F1A]',
    'focus-visible:ring-2 focus-visible:ring-ir-red/50 focus-visible:ring-offset-1',
    'disabled:bg-red-200 disabled:border-red-200 disabled:text-white/70 disabled:cursor-not-allowed',
  ].join(' '),

  ghost: [
    'bg-transparent text-text-secondary border border-transparent',
    'hover:bg-surface-muted hover:text-ir-blue',
    'active:bg-ir-50',
    'focus-visible:ring-2 focus-visible:ring-ir-blue/50 focus-visible:ring-offset-1',
    'disabled:text-text-muted disabled:cursor-not-allowed',
  ].join(' '),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8  px-3   text-xs  gap-1.5 rounded',
  md: 'h-9  px-4   text-sm  gap-2   rounded',
  lg: 'h-11 px-5   text-sm  gap-2.5 rounded-lg',
};

/* ── Component ────────────────────────────────────────────────────────────── */

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant  = 'primary',
      size     = 'md',
      loading  = false,
      icon,
      iconRight,
      children,
      className,
      disabled,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading}
        className={twMerge(
          clsx(
            /* Base */
            'inline-flex items-center justify-center font-sans font-medium',
            'select-none whitespace-nowrap transition-colors duration-150',
            'focus:outline-none',
            /* Variant + size */
            variantClasses[variant],
            sizeClasses[size],
            /* Loading — cursor override */
            loading && 'cursor-wait',
            /* External overrides */
            className
          )
        )}
        {...props}
      >
        {/* Left icon / spinner */}
        {loading ? (
          <Loader2
            className="animate-spin shrink-0"
            size={size === 'sm' ? 13 : size === 'lg' ? 17 : 15}
            aria-hidden="true"
          />
        ) : (
          icon && (
            <span className="shrink-0 flex items-center" aria-hidden="true">
              {icon}
            </span>
          )
        )}

        {/* Label */}
        {children && <span>{children}</span>}

        {/* Right icon (hidden during loading) */}
        {!loading && iconRight && (
          <span className="shrink-0 flex items-center" aria-hidden="true">
            {iconRight}
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
