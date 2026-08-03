import type { SVGProps } from 'react';

/**
 * The report's glyphs: the tick and cross the props table marks each row with,
 * and the chat bubble that reveals a finding's hint.
 *
 * Drawn here rather than pulled from an icon package: the manager is given one
 * as a global and the preview bundle is not, so sharing a package between the
 * two surfaces means shipping it as a runtime dependency into every consumer's
 * tree for a few glyphs. Stroked rather than filled so weight follows the size.
 *
 * `currentColor` is what lets the callers set the color through the theme.
 */
const base = {
  width: 14,
  height: 14,
  viewBox: '0 0 14 14',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2.25 7.5 5.5 10.75 11.75 3.5" />
    </svg>
  );
}

export function CrossIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M3.25 3.25 10.75 10.75M10.75 3.25 3.25 10.75" />
    </svg>
  );
}

export function ChatBubbleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 7a5 5 0 0 1-7.3 4.44L2 12l.56-2.7A5 5 0 1 1 12 7Z" />
    </svg>
  );
}
