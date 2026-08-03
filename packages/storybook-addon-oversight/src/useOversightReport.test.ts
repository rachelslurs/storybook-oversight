// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { RawManifest } from 'oversight-core';
import { ADDON_ID } from './constants';

// The hook reaches for the manager store and for the network, neither of which
// exists here. `useStorybookState` supplies the selected story and the manifest
// source supplies the payload, so what is left under test is the hook's own
// job: turning a manifest plus a story id into one of six states.
const state = vi.hoisted(() => ({
  manifest: null as unknown,
  loadRejection: undefined as Error | undefined,
  parseFailed: false,
  unavailableReason: undefined as string | undefined,
  storyId: '',
  config: {} as Record<string, unknown>,
  loadCalls: 0,
}));

vi.mock('storybook/manager-api', () => ({
  addons: { getConfig: () => state.config },
  useStorybookState: () => ({ storyId: state.storyId }),
}));

vi.mock('./manifestSource', () => ({
  createManifestSource: () => ({
    load: () => {
      state.loadCalls += 1;
      return state.loadRejection ? Promise.reject(state.loadRejection) : Promise.resolve(state.manifest);
    },
    urlFor: (name: string) => `http://localhost/manifests/${name}`,
    unavailableReason: () => state.unavailableReason,
    parseFailed: () => state.parseFailed,
  }),
}));

const MANIFEST = {
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ex-button': {
      name: 'Button',
      path: './Button.stories.tsx',
      reactDocgenTypescript: {
        description: 'A button.',
        props: { tone: { description: 'The tone.', required: false, declarations: [] } },
      },
    },
  },
} as unknown as RawManifest;

/**
 * The analysis is cached in a module-scoped promise for the session, so every
 * test needs its own instance of the module or the first manifest to load would
 * answer for all of them.
 */
async function loadHook() {
  vi.resetModules();
  const { useOversightReport } = await import('./useOversightReport');
  return useOversightReport;
}

/** Mount the hook and wait for the manifest to settle out of `loading`. */
async function mount() {
  const useOversightReport = await loadHook();
  const rendered = renderHook(() => useOversightReport());
  await waitFor(() => expect(rendered.result.current.status).not.toBe('loading'));
  return rendered;
}

beforeEach(() => {
  state.manifest = MANIFEST;
  state.loadRejection = undefined;
  state.parseFailed = false;
  state.unavailableReason = undefined;
  state.storyId = 'ex-button--primary';
  state.config = {};
  state.loadCalls = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useOversightReport story matching', () => {
  it('reports on the component whose stories are showing', async () => {
    const { result } = await mount();

    expect(result.current.status).toBe('ready');
    expect(result.current.report?.found).toBe(true);
    expect(result.current.report?.component?.id).toBe('ex-button');
  });

  it('matches a component id given on its own', async () => {
    state.storyId = 'ex-button';
    const { result } = await mount();

    expect(result.current.status).toBe('ready');
    expect(result.current.report?.component?.id).toBe('ex-button');
  });

  it('requires the story separator, so a longer id is not a match', async () => {
    // "ex-buttonbar--primary" starts with "ex-button" but is a different
    // component; a bare prefix test would report the wrong one's coverage
    state.storyId = 'ex-buttonbar--primary';
    const { result } = await mount();

    expect(result.current.status).toBe('no-entry');
  });

  it('says the manifest has no entry rather than showing an empty report', async () => {
    state.storyId = 'ex-absent--primary';
    const { result } = await mount();

    expect(result.current.status).toBe('no-entry');
    expect(result.current.report).toBeUndefined();
  });

  it('waits for a story without claiming the manifest is still loading', async () => {
    // the root URL selects nothing; a spinner here would say the manifest had
    // not arrived when it had
    state.storyId = '';
    const { result } = await mount();

    expect(result.current.status).toBe('no-story');
  });
});

describe('useOversightReport manifest states', () => {
  it('starts in loading before the manifest arrives', async () => {
    const useOversightReport = await loadHook();
    const { result } = renderHook(() => useOversightReport());

    expect(result.current.status).toBe('loading');
  });

  it('reports an unavailable manifest when nothing answered', async () => {
    state.manifest = null;
    const { result } = await mount();

    expect(result.current.status).toBe('unavailable');
  });

  it('tells a served-but-unparseable manifest apart from a missing one', async () => {
    state.manifest = null;
    state.parseFailed = true;
    const { result } = await mount();

    expect(result.current.status).toBe('error');
  });

  it('surfaces the server’s own reason rather than guessing a cause', async () => {
    state.manifest = null;
    state.unavailableReason = 'Manifest "components" is not available in dev.';
    const { result } = await mount();

    expect(result.current.status).toBe('unavailable');
    expect(result.current.unavailableReason).toBe('Manifest "components" is not available in dev.');
  });

  it('ends in error, never an endless spinner, when the manifest cannot be analyzed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.loadRejection = new Error('unsupported manifest');
    const { result } = await mount();

    expect(result.current.status).toBe('error');
    // the throw is handled here, so it is no longer an uncaught exception and
    // would otherwise leave no trace of why the panel is empty
    expect(logged).toHaveBeenCalled();
  });
});

describe('useOversightReport analysis caching', () => {
  it('analyzes once per session, not once per story change', async () => {
    const useOversightReport = await loadHook();
    const first = renderHook(() => useOversightReport());
    await waitFor(() => expect(first.result.current.status).toBe('ready'));
    const afterFirst = state.loadCalls;

    const second = renderHook(() => useOversightReport());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));

    expect(state.loadCalls).toBe(afterFirst);
  });

  it('retries a manifest that failed to load instead of caching the miss', async () => {
    state.manifest = null;
    const useOversightReport = await loadHook();
    const first = renderHook(() => useOversightReport());
    await waitFor(() => expect(first.result.current.status).toBe('unavailable'));
    const afterFirst = state.loadCalls;

    // a manifest served late (dev server still starting) must be picked up
    state.manifest = MANIFEST;
    const second = renderHook(() => useOversightReport());
    await waitFor(() => expect(second.result.current.status).toBe('ready'));

    expect(state.loadCalls).toBeGreaterThan(afterFirst);
  });
});

describe('useOversightReport display config', () => {
  it('shows the manifest-debugger link by default', async () => {
    const { result } = await mount();

    expect(result.current.showDebuggerLink).toBe(true);
    expect(result.current.debuggerUrl).toBe('http://localhost/manifests/components.html');
  });

  it('honors a consumer opting the debugger link out', async () => {
    state.config = { [ADDON_ID]: { debuggerLink: false } };
    const { result } = await mount();

    expect(result.current.showDebuggerLink).toBe(false);
  });
});
