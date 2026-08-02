// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createManifestSource } from './manifestSource';

// The hook reads only these two members of manager-api; mocking them keeps the
// test on the code under test instead of on Storybook's manager runtime.
vi.mock('storybook/manager-api', () => ({
  addons: { getConfig: () => ({}) },
  useStorybookState: () => ({ storyId: 'button--primary' }),
}));

// Only `ok`, `text`, and `json` are read from a response, so hand-rolled stubs
// keep each test's failure mode explicit instead of relying on fetch internals.
function okResponse(body: string): Response {
  return { ok: true, text: async () => body, json: async () => JSON.parse(body) as unknown } as Response;
}

function notOkResponse(body: string): Response {
  return { ok: false, text: async () => body, json: async () => JSON.parse(body) as unknown } as Response;
}

const MANIFEST = JSON.stringify({ v: 0, components: {} });

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createManifestSource failure split', () => {
  it('a 200 with an unparseable body is a parse failure, logged, with a truthful reason', async () => {
    const errorSpy = silenceConsoleError();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse('<!doctype html><html>proxy error page</html>')),
    );
    const source = createManifestSource((name) => `/manifests/${name}`);

    await expect(source.load()).resolves.toBeNull();
    expect(source.parseFailed()).toBe(true);
    expect(source.unavailableReason()).toContain('could not be parsed');
    // The generic "enable addon-mcp" guess must never render for this class.
    expect(source.unavailableReason()).not.toContain('addon-mcp');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storybook-addon-oversight]'),
      expect.any(SyntaxError),
    );
  });

  it('a rejected fetch is genuinely unavailable: no reason, no parse flag, no addon log', async () => {
    const errorSpy = silenceConsoleError();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const source = createManifestSource((name) => `/manifests/${name}`);

    await expect(source.load()).resolves.toBeNull();
    expect(source.parseFailed()).toBe(false);
    expect(source.unavailableReason()).toBeUndefined();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('a non-OK response keeps the server’s own explanation, not the parse diagnosis', async () => {
    const reason = 'Manifest "components" is not available in dev when experimentalDocgenServer is enabled.';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => notOkResponse(reason)),
    );
    const source = createManifestSource((name) => `/manifests/${name}`);

    await expect(source.load()).resolves.toBeNull();
    expect(source.parseFailed()).toBe(false);
    expect(source.unavailableReason()).toContain('experimentalDocgenServer');
  });

  it('a parse failure is never cached: the next load refetches and can recover', async () => {
    silenceConsoleError();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse('{"v":0,"compo')) // truncated write
      .mockResolvedValueOnce(okResponse(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);
    const source = createManifestSource((name) => `/manifests/${name}`);

    await expect(source.load()).resolves.toBeNull();
    await expect(source.load()).resolves.toEqual({ v: 0, components: {} });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The recovery must also clear the stale diagnosis.
    expect(source.parseFailed()).toBe(false);
    expect(source.unavailableReason()).toBeUndefined();
  });

  it('a successful load is cached: one fetch per page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(MANIFEST));
    vi.stubGlobal('fetch', fetchMock);
    const source = createManifestSource((name) => `/manifests/${name}`);

    await source.load();
    await source.load();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useOversightReport failure routing', () => {
  // The module under test caches at module scope and warms the fetch at eval,
  // so each test needs a fresh module registry and its fetch stub in place
  // BEFORE the import.
  async function renderStatus() {
    vi.resetModules();
    const { useOversightReport } = await import('./useOversightReport');
    function Probe() {
      return <output data-testid="status">{useOversightReport().status}</output>;
    }
    return render(<Probe />);
  }

  it('routes a served-but-unparseable manifest to the error state, not "unavailable"', async () => {
    silenceConsoleError();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse('<!doctype html>')),
    );
    const { getByTestId } = await renderStatus();
    await waitFor(() => expect(getByTestId('status').textContent).toBe('error'));
  });

  it('keeps a network failure in the unavailable state', async () => {
    silenceConsoleError();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { getByTestId } = await renderStatus();
    await waitFor(() => expect(getByTestId('status').textContent).toBe('unavailable'));
  });
});
