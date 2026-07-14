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
      className={`max-w-sm rounded-xl border border-slate-200 bg-white p-5 ${elevated ? 'shadow-lg' : 'shadow-sm'}`}
    >
      <h3 className="mb-2 text-base font-semibold text-slate-900">{title}</h3>
      <div className="text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}
