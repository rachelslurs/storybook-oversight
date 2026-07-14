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
  const sizes = {
    sm: 'px-2.5 py-1 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };
  const variants = {
    primary: 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'border-indigo-200 bg-white text-indigo-600 hover:bg-indigo-50',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center justify-center rounded-md border font-medium shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${sizes[size]} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}
