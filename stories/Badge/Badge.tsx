import type { ReactNode } from 'react';

export interface BadgeProps {
  /** Colour intent — 'neutral', 'success', or 'danger'. */
  tone?: 'neutral' | 'success' | 'danger';
  /** Short label rendered inside the badge. */
  children?: ReactNode;
}

// No component JSDoc on purpose → component-description-missing (warning).
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    danger: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
