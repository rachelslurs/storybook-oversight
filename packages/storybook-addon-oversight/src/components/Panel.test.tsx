// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import { buildReport } from 'oversight-core';
import type { RawManifest } from 'oversight-core';
import type { ManagerReport } from '../useOversightReport';
import { Panel } from './Panel';

// `useStorybookApi` lives in the manager bundle, which no browser-mode story
// test can reach, so the api and the report hook are both replaced here. What
// is under test is the panel's own wiring: the active/hidden default and the
// navigation behavior of its links.
const state = vi.hoisted(() => ({
  report: {} as ManagerReport,
  selectStory: (() => {}) as (id: string) => void,
  selectStoryCalls: [] as string[],
}));

vi.mock('storybook/manager-api', () => ({
  useStorybookApi: () => ({
    selectStory: (id: string) => {
      state.selectStoryCalls.push(id);
      state.selectStory(id);
    },
  }),
}));

vi.mock('../useOversightReport', () => ({
  useOversightReport: () => state.report,
}));

const DEBUGGER_URL = 'http://localhost/manifests/components.html';

// One documented component whose description carries both link shapes the
// panel has to tell apart: a story reference and an off-site citation. The
// sibling it cites is in the manifest too, so the target resolves and stays a
// link. A dangling one is struck through and deliberately not clickable.
const BUTTON = {
  name: 'Button',
  path: './Button.stories.tsx',
  description: 'See [Sibling](?path=/docs/ex-card--docs) and [MDN](https://developer.mozilla.org/).',
  reactDocgenTypescript: {
    props: { tone: { description: 'The tone.', required: false, declarations: [] } },
  },
};

const CARD = {
  name: 'Card',
  path: './Card.stories.tsx',
  description: 'The sibling.',
  reactDocgenTypescript: {
    props: { tone: { description: 'The tone.', required: false, declarations: [] } },
  },
};

const MANIFEST = {
  meta: { docgen: 'react-docgen-typescript' },
  components: { 'ex-button': BUTTON, 'ex-card': CARD },
} as unknown as RawManifest;

/** The same component, citing a sibling that is no longer in the manifest. */
const MANIFEST_WITHOUT_CARD = {
  meta: { docgen: 'react-docgen-typescript' },
  components: { 'ex-button': BUTTON },
} as unknown as RawManifest;

function readyReport(): ManagerReport {
  return {
    status: 'ready',
    report: buildReport(MANIFEST, 'ex-button'),
    debuggerUrl: DEBUGGER_URL,
    showDebuggerLink: true,
  };
}

function renderPanel(active?: boolean) {
  return render(
    <ThemeProvider theme={ensure(themes.light)}>
      <Panel active={active} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  state.report = readyReport();
  state.selectStory = () => {};
  state.selectStoryCalls = [];
});

afterEach(cleanup);

describe('Panel visibility', () => {
  it('renders the report when the tab is open', () => {
    renderPanel(true);

    expect(screen.getByRole('link', { name: 'Sibling' })).toBeTruthy();
  });

  it('stays hidden until its tab is opened, including when told nothing', () => {
    // Storybook mounts every panel and shows one; a panel that ignored `active`
    // would paint over whichever tab the user actually opened
    const { container } = renderPanel(false);
    expect(container.querySelector('[hidden]')).toBeTruthy();

    cleanup();
    const { container: byDefault } = renderPanel(undefined);
    expect(byDefault.querySelector('[hidden]')).toBeTruthy();
  });
});

describe('Panel links', () => {
  it('navigates in-app on a plain click instead of reloading Storybook', () => {
    renderPanel(true);
    const link = screen.getByRole('link', { name: 'Sibling' });

    // `href` stays a real URL so middle-click and copy-link still work
    expect(link.getAttribute('href')).toBe('?path=/docs/ex-card--docs');

    const notPrevented = fireEvent.click(link, { button: 0 });

    expect(state.selectStoryCalls).toEqual(['ex-card--docs']);
    expect(notPrevented).toBe(false); // preventDefault ran: no full page load
  });

  it('falls back to the href when the id is absent from the manager index', () => {
    // `selectStory` throws "Unknown id or title" for ids docsMode filters out;
    // swallowing that without releasing the default click would strand the user
    state.selectStory = () => {
      throw new Error('Unknown id or title');
    };
    renderPanel(true);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Sibling' }), { button: 0 });

    expect(state.selectStoryCalls).toEqual(['ex-card--docs']);
    expect(notPrevented).toBe(true); // the browser still follows the href
  });

  it.each([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle', { button: 1 }],
  ])('leaves a %s-click to the browser, so open-in-new-tab keeps working', (_name, init) => {
    renderPanel(true);

    const notPrevented = fireEvent.click(screen.getByRole('link', { name: 'Sibling' }), init);

    expect(state.selectStoryCalls).toEqual([]);
    expect(notPrevented).toBe(true);
  });

  it('strikes a citation whose component is gone rather than linking to nothing', () => {
    // the dangling treatment has to reach the panel too: left as a link it
    // promises a destination the manifest no longer has, and the click would
    // navigate away to it
    state.report = { ...readyReport(), report: buildReport(MANIFEST_WITHOUT_CARD, 'ex-button') };
    renderPanel(true);

    expect(screen.queryByRole('link', { name: 'Sibling' })).toBeNull();
    expect(screen.getByText('Sibling').tagName).toBe('S');
    // the citation that still resolves is left alone
    expect(screen.getByRole('link', { name: 'MDN' })).toBeTruthy();
  });

  it('lets the browser handle a link that names no story', () => {
    renderPanel(true);
    const external = screen.getByRole('link', { name: 'MDN' });

    const notPrevented = fireEvent.click(external, { button: 0 });

    expect(external.getAttribute('href')).toBe('https://developer.mozilla.org/');
    expect(state.selectStoryCalls).toEqual([]);
    expect(notPrevented).toBe(true);
  });
});
