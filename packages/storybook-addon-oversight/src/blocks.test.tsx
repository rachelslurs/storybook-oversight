// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import { Oversight } from './blocks';
import { normalizeColor, paintedColor } from './testing';

// `useOf` walks addon-docs' DocsContext and the real manifest source fetches
// at import time, so both are replaced: the subject here is what the block
// makes of what it is given, not how the manifest arrives.
vi.mock('@storybook/addon-docs/blocks', () => ({
  DocsContainer: (props: { children?: unknown }) => props.children,
  // `className` is forwarded because `SectionHeading` is `styled(Heading)`, and
  // emotion styles a wrapped component by handing it a generated class. A mock
  // that drops it renders a heading with none of the block's styling on it, so
  // nothing about how the heading paints could be asserted at all.
  Heading: ({ id, className, children }: { id?: string; className?: string; children?: unknown }) => (
    <h2 id={id} className={className}>
      {children as never}
    </h2>
  ),
  useOf: () => ({ csfFile: { meta: { id: 'ex-doc' } } }),
}));

// Each test sets the outcome it needs; `beforeEach` restores a manifest that loads.
const state = vi.hoisted(() => ({ parseFailed: false, manifest: null as unknown }));

vi.mock('./manifestSource', () => ({
  createManifestSource: () => ({
    load: () => Promise.resolve(state.manifest),
    urlFor: (name: string) => `http://localhost/manifests/${name}`,
    unavailableReason: () =>
      state.parseFailed ? 'The components manifest was served but could not be parsed.' : undefined,
    parseFailed: () => state.parseFailed,
  }),
}));

const LOADS = {
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ex-doc': {
      name: 'Doc',
      path: './Doc.stories.tsx',
      reactDocgenTypescript: {
        description:
          'See [MDN](https://developer.mozilla.org/en-US/docs/Web), [More](?path=/docs/ex-doc--docs), ' +
          '[Sized](?path=/docs/ex-doc--docs&args=size:lg) and [Deep](?path=/docs/ex-doc--docs#oversight).',
        props: {},
      },
    },
  },
};

beforeEach(() => {
  state.parseFailed = false;
  state.manifest = LOADS;
});

afterEach(cleanup);

describe('DocsLink', () => {
  // The markdown parser admits absolute http(s) targets as well as `?path=`
  // ones. Rebasing an absolute URL with `./` resolves it to
  // `<storybook-origin>/https://…`, a 404, and `_top` takes the whole tab
  // there, out of Storybook.
  it('rebases ?path= targets onto the root and leaves absolute URLs untouched', async () => {
    render(<Oversight />);

    const external = await screen.findByRole('link', { name: 'MDN' });
    expect(external.getAttribute('href')).toBe('https://developer.mozilla.org/en-US/docs/Web');
    expect(external.getAttribute('target')).toBe('_top');
    // the Referer sent to a cited third-party site would name the Storybook
    // host, which may be private
    expect(external.getAttribute('rel')).toBe('noopener noreferrer');

    // every relative target rebases, whether or not it parses as a story id:
    // left alone they resolve against `iframe.html` and load the preview frame
    // as the whole page
    for (const [name, href] of [
      ['More', './?path=/docs/ex-doc--docs'],
      ['Sized', './?path=/docs/ex-doc--docs&args=size:lg'],
      ['Deep', './?path=/docs/ex-doc--docs#oversight'],
    ]) {
      const internal = screen.getByRole('link', { name });
      expect(internal.getAttribute('href')).toBe(href);
      expect(internal.getAttribute('target')).toBe('_top');
      expect(internal.getAttribute('rel')).toBeNull();
    }
  });
});

describe('Oversight section anchor', () => {
  it('gives the section a stable id to link to', async () => {
    // `Heading` slugs its own id from the text on every render, and this block
    // renders again when the manifest arrives, so the second pass would take
    // "oversight-1" and every link naming "#oversight" would land nowhere
    const { container } = render(<Oversight />);
    await screen.findByRole('link', { name: 'MDN' });

    expect(container.querySelector('#oversight')).toBeTruthy();
  });

  it('lets only the first block on a page own the anchor', async () => {
    // the global container and a hand-placed <Oversight/> can both land on one
    // page; duplicate ids are invalid and getElementById returns only the first
    const { container } = render(
      <>
        <Oversight />
        <Oversight />
      </>,
    );
    await screen.findAllByRole('link', { name: 'MDN' });

    expect(container.querySelectorAll('#oversight')).toHaveLength(1);
  });
});

/**
 * Names the theme a painted color belongs to, so a failure reads `expected
 * 'dark' to be 'light'` rather than comparing two hex strings the reader then
 * has to look up. Asserting the positive and then separately asserting "not the
 * other one" cannot do this: the positive assertion throws first, so the second
 * line only ever runs in the case where it was already going to pass.
 */
function whichTheme(el: Element): string {
  const painted = paintedColor(el, 'color');
  if (painted === normalizeColor(ensure(themes.light).textMutedColor)) return 'light';
  if (painted === normalizeColor(ensure(themes.dark).textMutedColor)) return 'dark';
  return painted;
}

// These assert which theme `ThemedRoot` hands to the block, read off a painted
// color rather than off the value passed to the provider. They do not establish
// what the heading looks like on a real Docs page: the `Heading` mock renders
// without addon-docs' `DocsContent` wrapper, whose `:where(h2)` rule sets a
// color at the same specificity as `SectionHeading`'s class. Item 2b of #75 is
// where that gets covered, through autodocs rather than a mocked container.
describe('ThemedRoot theme', () => {
  it('falls back to light, matching what DocsContainer falls back to', async () => {
    render(<Oversight />);
    await screen.findByRole('link', { name: 'MDN' });

    expect(whichTheme(screen.getByRole('heading', { name: 'Oversight' }))).toBe('light');
  });

  // The fallback is meant to run only when the surrounding context does not
  // resolve. A ThemedRoot that always fell back would paint a dark Storybook's
  // docs page with a light block.
  it('inherits the surrounding theme when there is one', async () => {
    render(
      <ThemeProvider theme={ensure(themes.dark)}>
        <Oversight />
      </ThemeProvider>,
    );
    await screen.findByRole('link', { name: 'MDN' });

    expect(whichTheme(screen.getByRole('heading', { name: 'Oversight' }))).toBe('dark');
  });
});

describe('Oversight manifest states', () => {
  it('tells a served-but-unparseable manifest apart from a missing one', async () => {
    state.manifest = null;
    state.parseFailed = true;
    render(<Oversight />);

    // the two states both talk about parsing once a reason is set, so the title
    // is what separates them
    expect(await screen.findByText('Manifest could not be parsed')).toBeTruthy();
    expect(screen.queryByText('Components manifest unavailable')).toBeNull();
  });

  it('keeps the manifest-feature hint when nothing answered', async () => {
    state.manifest = null;
    render(<Oversight />);

    expect(await screen.findByText(/@storybook\/addon-mcp/)).toBeTruthy();
  });
});
