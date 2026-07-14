import type { ReactNode } from 'react';

export interface TileProps {
  /** Heading shown at the top of the tile. */
  label: string;
  /** Content rendered below the heading. */
  children?: ReactNode;
}

/**
 * A compact fixed-size surface for a single stat or shortcut. For a flexible
 * container that grows with its content, use
 * [Ghost](?path=/docs/data-display-ghost--docs) instead.
 *
 * (That link is intentionally broken — there is no `data-display-ghost`
 * component — so Oversight flags it as docs-link-dangling.)
 */
export function Tile({ label, children }: TileProps) {
  return (
    <div className="flex h-28 w-40 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-1 text-2xl font-semibold text-slate-900">{children}</span>
    </div>
  );
}
