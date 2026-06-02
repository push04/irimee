/**
 * components/ui/Badge.tsx
 *
 * Status badge pill component.
 *
 * Variants:
 *  ok    — green  (#1B7A45 on #E6F5ED)
 *  warn  — amber  (#A05A00 on #FFF7E6)
 *  err   — red    (#CE1726 on #FDEBEE)
 *  info  — IR blue (#003893 on #E8F0FB)
 *  gold  — saffron (#D44F0C on #FFF3E8)  — used for MAHSR target labels
 *
 * Each variant shows a coloured dot icon by default.
 * Pass icon prop to override (e.g. <CheckCircle2 size={11} />).
 */

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Star,
} from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type BadgeVariant = 'ok' | 'warn' | 'err' | 'info' | 'gold';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant: BadgeVariant;
  /** Override default icon (pass null to suppress icon entirely) */
  icon?: React.ReactNode | null;
  /** Badge label text */
  label?: string;
  children?: React.ReactNode;
}

/* ── Variant styles ───────────────────────────────────────────────────────── */

const variantStyles: Record<BadgeVariant, { pill: string; iconColor: string }> = {
  ok: {
    pill:      'bg-[#E6F5ED] text-[#1B7A45] border border-[#A7D7BA]',
    iconColor: 'text-[#1B7A45]',
  },
  warn: {
    pill:      'bg-[#FFF7E6] text-[#A05A00] border border-[#FFD28F]',
    iconColor: 'text-[#A05A00]',
  },
  err: {
    pill:      'bg-[#FDEBEE] text-[#CE1726] border border-[#F4A1AA]',
    iconColor: 'text-[#CE1726]',
  },
  info: {
    pill:      'bg-[#E8F0FB] text-[#003893] border border-[#9FBCEF]',
    iconColor: 'text-[#003893]',
  },
  gold: {
    pill:      'bg-[#FFF3E8] text-[#D44F0C] border border-[#FFD28F]',
    iconColor: 'text-[#D44F0C]',
  },
};

const defaultIcons: Record<BadgeVariant, React.ComponentType<{ size?: number; className?: string }>> = {
  ok:   CheckCircle2,
  warn: AlertTriangle,
  err:  XCircle,
  info: Info,
  gold: Star,
};

/* ── Component ────────────────────────────────────────────────────────────── */

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant, icon, label, children, className, ...props }, ref) => {
    const styles = variantStyles[variant];
    const DefaultIcon = defaultIcons[variant];

    /* Resolve icon: explicit override → default → null */
    const resolvedIcon =
      icon === null
        ? null
        : icon !== undefined
        ? icon
        : (
          <DefaultIcon
            size={10}
            className={clsx('shrink-0', styles.iconColor)}
            aria-hidden="true"
          />
        );

    return (
      <span
        ref={ref}
        className={twMerge(
          clsx(
            'inline-flex items-center gap-1 px-2 py-0.5',
            'rounded-pill text-xs font-medium font-sans leading-none',
            'select-none whitespace-nowrap',
            styles.pill,
            className
          )
        )}
        {...props}
      >
        {resolvedIcon}
        {label ?? children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';
