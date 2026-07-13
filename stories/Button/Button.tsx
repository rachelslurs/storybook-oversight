import type { ReactNode } from 'react';

export interface ButtonProps {
  /** Visual style — 'primary' for the main action, 'secondary' for supporting ones. */
  variant: 'primary' | 'secondary';
  /** Control height and padding. Defaults to 'md'. */
  size?: 'sm' | 'md' | 'lg';
  /** Content rendered inside the button. */
  children?: ReactNode;
  /** Fires when the button is activated by click, tap, or keyboard. */
  onClick?: () => void;
}

/**
 * Triggers an action when pressed — submitting a form, opening a dialog, or
 * running a command. For grouping related content in a container, see
 * [Card](?path=/docs/data-display-card--docs).
 */
export function Button({ variant, size = 'md', children, onClick }: ButtonProps) {
  const pad = size === 'sm' ? '4px 10px' : size === 'lg' ? '12px 22px' : '8px 16px';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: pad,
        borderRadius: 6,
        border: '1px solid #4f46e5',
        background: variant === 'primary' ? '#4f46e5' : 'transparent',
        color: variant === 'primary' ? '#fff' : '#4f46e5',
        cursor: 'pointer',
        font: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
