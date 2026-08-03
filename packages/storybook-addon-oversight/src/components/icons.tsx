import type { SVGProps } from 'react';

/**
 * The report's glyphs: the tick and cross the props table marks each row with,
 * and the lightbulb that reveals a finding's hint.
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

// A suggestion, which is what a hint is: the glyph an editor offers a fix
// behind. Two strokes rather than a filled bulb and a filament, which turn to
// mud at 14px.
export function LightbulbIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5.2 8.8a3.5 3.5 0 1 1 3.6 0c-.5.4-.7.9-.7 1.5H5.9c0-.6-.2-1.1-.7-1.5Z" />
      <path d="M5.9 12.2h2.2" />
    </svg>
  );
}
