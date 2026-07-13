import type { ReactNode } from 'react';

export interface CardProps {
  // Intentionally undocumented + required → required-prop-undocumented (error).
  title: string;
  // Intentionally undocumented → prop-descriptions-missing (warning).
  elevated?: boolean;
  /** Content rendered inside the card body. */
  children?: ReactNode;
}

/**
 * A surface that groups related content and actions on a single subject, with
 * optional elevation to lift it above the page.
 */
export function Card({ title, elevated, children }: CardProps) {
  return (
    <section
      style={{
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        boxShadow: elevated ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
        padding: 16,
        maxWidth: 320,
      }}
    >
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      {children}
    </section>
  );
}
