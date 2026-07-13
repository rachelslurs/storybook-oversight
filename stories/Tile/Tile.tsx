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
    <div
      style={{
        width: 140,
        height: 100,
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        padding: 12,
      }}
    >
      <strong>{label}</strong>
      <div>{children}</div>
    </div>
  );
}
