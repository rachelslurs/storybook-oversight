// Test-only helpers. Not an entry point: nothing in tsup.config.ts builds this,
// so it never reaches dist or the published tarball.

import { ensure, themes } from 'storybook/theming';

/**
 * A manifest whose one component carries the link shapes the block has to
 * handle. Shared so the theme cases, which live in separate files, describe the
 * same page.
 */
export const DEMO_MANIFEST = {
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ex-doc': {
      name: 'Doc',
      path: './Doc.stories.tsx',
      description:
        'See [MDN](https://developer.mozilla.org/en-US/docs/Web), [More](?path=/docs/ex-doc--docs), ' +
        '[Sized](?path=/docs/ex-doc--docs&args=size:lg) and [Deep](?path=/docs/ex-doc--docs#oversight).',
      reactDocgenTypescript: {
        props: {},
      },
    },
  },
};

/**
 * Names the theme a painted color belongs to, so a failure reads `expected
 * 'dark' to be 'light'` rather than comparing two hex strings the reader then
 * has to look up.
 */
export function whichTheme(el: Element): string {
  const painted = paintedColor(el, 'color');
  if (painted === normalizeColor(ensure(themes.light).textMutedColor)) return 'light';
  if (painted === normalizeColor(ensure(themes.dark).textMutedColor)) return 'dark';
  return painted;
}

/**
 * A computed color, normalized so the comparison does not depend on how the DOM
 * implementation writes it down.
 *
 * happy-dom returns whatever the stylesheet declared, so a theme token like
 * `#5C6570` comes back verbatim and compares equal to the token by luck. Browsers
 * and jsdom serialize per spec and return `rgb(92, 101, 112)` instead. Comparing
 * raw strings would tie these assertions to happy-dom, and a routine bump would
 * read as a theming regression when nothing about the painting had changed.
 *
 * Anything that is neither hex nor rgb() is returned lowercased and unchanged,
 * which keeps the failure message legible rather than turning it into a parse
 * error.
 */
export function paintedColor(el: Element, property: 'color' | 'backgroundColor'): string {
  return normalizeColor(getComputedStyle(el)[property]);
}

/** Same normalization, for the theme token being compared against. */
export function normalizeColor(value: string): string {
  const raw = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(raw);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const n = Number.parseInt(digits, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(raw);
  if (rgb) {
    const [r, g, b] = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if ([r, g, b].every((c) => Number.isFinite(c))) return `rgb(${r}, ${g}, ${b})`;
  }

  return raw;
}
