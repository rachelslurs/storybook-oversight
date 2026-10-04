// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { loadCsf } from 'storybook/internal/csf-tools';
import { StoryStore } from 'storybook/preview-api';
import { Oversight } from './blocks';
import { DEMO_MANIFEST, whichTheme } from './testing';

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
  useOf: () => ({ csfFile: { meta: state.meta } }),
}));

// Each test sets the outcome it needs; `beforeEach` restores a manifest that loads.
const state = vi.hoisted(() => ({ parseFailed: false, manifest: null as unknown, meta: {} as { id?: string } }));

vi.mock('./manifestSource', () => ({
  createManifestSource: () => ({
    load: () => Promise.resolve(state.manifest),
    urlFor: (name: string) => `http://localhost/manifests/${name}`,
    unavailableReason: () =>
      state.parseFailed ? 'The components manifest was served but could not be parsed.' : undefined,
    parseFailed: () => state.parseFailed,
  }),
}));

beforeEach(() => {
  state.parseFailed = false;
  state.manifest = DEMO_MANIFEST;
  state.meta = { id: 'ex-doc' };
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

// Asserts which theme `ThemedRoot` hands the block, read off a painted color
// rather than off the value passed to the provider. It does not establish what
// the heading looks like on a real Docs page: the `Heading` mock renders without
// addon-docs' `DocsContent` wrapper, whose `:where(h2)` rule sets a color at the
// same specificity as `SectionHeading`'s class. Item 2b of #75 covers that,
// through autodocs rather than a mocked container.
//
// The inherited case is in blocks.theme-dark.test.tsx, which explains why.
describe('ThemedRoot theme', () => {
  it('falls back to light, matching what DocsContainer falls back to', async () => {
    render(<Oversight />);
    await screen.findByRole('link', { name: 'MDN' });

    expect(whichTheme(screen.getByRole('heading', { name: 'Oversight' }))).toBe('light');
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

describe('Oversight component id', () => {
  // Both halves come from Storybook rather than literals, because the bug is in
  // how they relate. The preview's CSF processing sanitizes `id || title` and
  // then spreads the default export over it, so an explicit id survives raw in
  // the meta the block reads. The indexer builds story ids from the sanitized
  // id, and addon-mcp keys the manifest by a story id's prefix.
  it('finds the entry when the stories meta sets an id that is not already sanitized', async () => {
    const exportsAsSource = "export default { id: 'Ex_Doc', title: 'Examples/Ex Doc' };\nexport const Primary = {};";
    const indexed = loadCsf(exportsAsSource, { makeTitle: (title) => title!, fileName: 'ExDoc.stories.tsx' }).parse();
    const manifestKey = indexed.indexInputs[0]?.__id?.split('--')[0];
    expect(manifestKey).toBe('ex-doc');
    expect(DEMO_MANIFEST.components).toHaveProperty([manifestKey!]);

    // `processCSFFile` is internal to preview-api; the store holds the same
    // function, memoized, and it is what DocsContext reads `csfFile` from
    const store = new StoryStore({ v: 5, entries: {} }, async () => ({}), {});
    const { meta } = store.processCSFFileWithCache(
      { default: { id: 'Ex_Doc', title: 'Examples/Ex Doc' }, Primary: {} },
      './ExDoc.stories.tsx',
      'Examples/Ex Doc',
    );
    // the raw and sanitized forms differ, so matching on the raw one cannot pass
    expect(meta.id).toBe('Ex_Doc');
    state.meta = meta;

    render(<Oversight />);

    expect(await screen.findByRole('link', { name: 'MDN' })).toBeTruthy();
    expect(screen.queryByText('No manifest entry for this component.')).toBeNull();
  });
});
