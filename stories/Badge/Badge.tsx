import type { ReactNode } from 'react';

export interface BadgeProps {
  /** Colour intent — 'neutral', 'success', or 'danger'. */
  tone?: 'neutral' | 'success' | 'danger';
  /** Short label rendered inside the badge. */
  children?: ReactNode;
}

// No component JSDoc on purpose → component-description-missing (warning).
export function Badge({ tone = 'neutral', children }: BadgeProps) {
  const bg = tone === 'success' ? '#dcfce7' : tone === 'danger' ? '#fee2e2' : '#e5e7eb';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        background: bg,
        fontSize: 12,
      }}
    >
      {children}
    </span>
  );
}
