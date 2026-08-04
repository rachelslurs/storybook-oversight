// @vitest-environment happy-dom
//
// The dark case renders in its own file on purpose. Emotion's stylesheet
// accumulates across the tests in a file, so a rule read during a dark render
// may have been emitted by an earlier light one, and a reviewer reported seeing
// exactly that: both headings carrying the light class, the second assertion
// reading the first render's color. It did not reproduce across 69 runs here.
// A separate file starts with an empty stylesheet, which makes the question
// moot rather than unanswered.
//
// The light fallback case lives in blocks.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import { Oversight } from './blocks';
import { DEMO_MANIFEST, whichTheme } from './testing';

vi.mock('@storybook/addon-docs/blocks', () => ({
  DocsContainer: (props: { children?: unknown }) => props.children,
  // `className` is forwarded because `SectionHeading` is `styled(Heading)`, and
  // emotion styles a wrapped component by handing it a generated class. A mock
  // that drops it renders a heading with none of the block's styling on it.
  Heading: ({ id, className, children }: { id?: string; className?: string; children?: unknown }) => (
    <h2 id={id} className={className}>
      {children as never}
    </h2>
  ),
  useOf: () => ({ csfFile: { meta: { id: 'ex-doc' } } }),
}));

const state = vi.hoisted(() => ({ manifest: null as unknown }));

vi.mock('./manifestSource', () => ({
  createManifestSource: () => ({
    load: () => Promise.resolve(state.manifest),
    urlFor: (name: string) => `http://localhost/manifests/${name}`,
    unavailableReason: () => undefined,
    parseFailed: () => false,
  }),
}));

beforeEach(() => {
  state.manifest = DEMO_MANIFEST;
});

afterEach(cleanup);

describe('ThemedRoot theme', () => {
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
