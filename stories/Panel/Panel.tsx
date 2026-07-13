import type { ReactNode } from 'react';

export interface PanelProps {
  /** Content rendered inside the panel. */
  children?: ReactNode;
  // Undocumented on purpose. It would normally trip prop-descriptions-missing,
  // but the @oversightIgnore below exempts that rule for this component.
  slot?: string;
}

/**
 * An internal scaffolding surface. Its prop coverage is intentionally exempted,
 * and the exemption list also names a rule that doesn't exist — which Oversight
 * flags (unknown-ignore-rule) rather than silently ignoring.
 *
 * @oversightIgnore prop-descriptions-missing frobnicate
 */
export function Panel({ children }: PanelProps) {
  return <div style={{ padding: 16, background: '#f9fafb', borderRadius: 6 }}>{children}</div>;
}
