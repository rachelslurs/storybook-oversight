import type { ReactNode } from 'react';

export interface BannerProps {
  /** Message shown in the banner. */
  children?: ReactNode;
}

/**
 * A full-width inline message.
 *
 * @deprecated Use Toast for transient messages, or Card for persistent ones.
 */
export function Banner({ children }: BannerProps) {
  return (
    <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {children}
    </div>
  );
}
