/**
 * components/ui/Card.tsx
 *
 * White card component with optional status-coloured left border.
 *
 * Sub-components:
 *  <Card>         — outer container (white, rounded-card, shadow-card)
 *  <CardHeader>   — top section with flex-row layout for title + actions
 *  <CardTitle>    — heading text (DM Sans medium)
 *  <CardContent>  — inner content area with standard padding
 *
 * Status border colours (left-side stripe, 3px):
 *  ok   → status-ok  (#1B7A45)
 *  warn → status-warn (#A05A00)
 *  err  → status-err  (#CE1726)
 */

import * as React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/* ── Types ────────────────────────────────────────────────────────────────── */

export type CardStatus = 'ok' | 'warn' | 'err' | undefined;

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Optional status stripe on left edge */
  status?: CardStatus;
  /** Remove default padding from card (useful when card contains a table/chart) */
  noPadding?: boolean;
}

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}
export interface CardTitleProps  extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: 'h2' | 'h3' | 'h4' | 'h5';
}
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

/* ── Status stripe map ────────────────────────────────────────────────────── */

const statusBorderClass: Record<NonNullable<CardStatus>, string> = {
  ok:   'border-l-[3px] border-l-status-ok',
  warn: 'border-l-[3px] border-l-status-warn',
  err:  'border-l-[3px] border-l-status-err',
};

/* ── Card ─────────────────────────────────────────────────────────────────── */

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ status, noPadding = false, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge(
        clsx(
          'bg-surface-card rounded-card shadow-card border border-surface-border',
          !noPadding && 'p-4',
          status && statusBorderClass[status],
          className
        )
      )}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

/* ── CardHeader ───────────────────────────────────────────────────────────── */

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge(
        clsx('flex items-center justify-between gap-2 mb-3', className)
      )}
      {...props}
    >
      {children}
    </div>
  )
);
CardHeader.displayName = 'CardHeader';

/* ── CardTitle ────────────────────────────────────────────────────────────── */

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Tag = 'h3', className, children, ...props }, ref) => (
    <Tag
      ref={ref}
      className={twMerge(
        clsx(
          'font-sans text-sm font-semibold text-text-primary leading-tight',
          className
        )
      )}
      {...props}
    >
      {children}
    </Tag>
  )
);
CardTitle.displayName = 'CardTitle';

/* ── CardContent ──────────────────────────────────────────────────────────── */

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge(clsx('text-text-secondary text-sm', className))}
      {...props}
    >
      {children}
    </div>
  )
);
CardContent.displayName = 'CardContent';
