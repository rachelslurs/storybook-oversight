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
    <div
      style={{
        padding: '10px 16px',
        background: '#fef9c3',
        borderLeft: '4px solid #ca8a04',
        borderRadius: 4,
      }}
    >
      {children}
    </div>
  );
}
