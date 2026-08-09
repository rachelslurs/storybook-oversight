import type { ReactNode } from 'react';

export interface PanelProps {
  /** Content rendered inside the panel. */
  children?: ReactNode;
  // Undocumented on purpose. It would normally trip prop-descriptions-missing,
  // but the @oversightIgnore below exempts that rule for this component.
  slot?: string;
}

/**
 * An internal scaffolding surface. Its `slot` prop is undocumented on purpose, so
 * an `@oversightIgnore` directive in this component's source exempts it from
 * `prop-descriptions-missing` rather than leaving the rule to report a gap that
 * is deliberate.
 *
 * @oversightIgnore prop-descriptions-missing
 */
export function Panel({ children }: PanelProps) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{children}</div>;
}
