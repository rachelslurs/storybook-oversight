// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { createManifestSource } from './manifestSource';
import type { ManifestLoadOutcome } from './manifestSource';

// The hook reads these members of manager-api; mocking them keeps the test on
// the code under test instead of on Storybook's manager runtime. `getService`
// throws the way an unregistered service does, which is what every project
// without `experimentalDocgenServer` serves.
vi.mock('storybook/manager-api', () => ({
  addons: { getConfig: () => ({}) },
  useStorybookState: () => ({ storyId: 'button--primary' }),
  getService: () => {
    throw new Error('No registered service with id "core/docgen" exists in this environment.');
  },
}));

const MANIFEST = { v: 0, components: {} };
const urlFor = (name: string) => `/manifests/${name}`;

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The transport behind the load (fetch, ref resolution, service fallback) is
// manifestLoad's and tested there; these tests pin the source's own policy:
// the cache, the retry-after-failure, and the failure accounting.
describe('createManifestSource policy', () => {
  it('reports the outcome the load carried: reason and parse flag, read after settle', async () => {
    const load = vi.fn(
      async (): Promise<ManifestLoadOutcome> => ({
        manifest: null,
        parseFailed: true,
        unavailableReason: 'The components manifest was served but could not be parsed.',
      }),
    );
    const source = createManifestSource({ load, urlFor });

    await expect(source.load()).resolves.toBeNull();
    expect(source.parseFailed()).toBe(true);
    expect(source.unavailableReason()).toContain('could not be parsed');
  });

  it('a failure is never cached: the next load retries and recovery clears the stale diagnosis', async () => {
    const load = vi
      .fn<() => Promise<ManifestLoadOutcome>>()
      .mockResolvedValueOnce({ manifest: null, parseFailed: true, unavailableReason: 'truncated write' })
      .mockResolvedValueOnce({ manifest: MANIFEST });
    const source = createManifestSource({ load, urlFor });

    await expect(source.load()).resolves.toBeNull();
    await expect(source.load()).resolves.toEqual(MANIFEST);
    expect(load).toHaveBeenCalledTimes(2);
    expect(source.parseFailed()).toBe(false);
    expect(source.unavailableReason()).toBeUndefined();
  });

  it('a successful load is cached: one load per page', async () => {
    const load = vi.fn(async (): Promise<ManifestLoadOutcome> => ({ manifest: MANIFEST }));
    const source = createManifestSource({ load, urlFor });

    await source.load();
    await source.load();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('a load that breaks its no-reject contract degrades to unavailable, logged, and still retries', async () => {
    const errorSpy = silenceConsoleError();
    const load = vi
      .fn<() => Promise<ManifestLoadOutcome>>()
      .mockRejectedValueOnce(new Error('loader bug'))
      .mockResolvedValueOnce({ manifest: MANIFEST });
    const source = createManifestSource({ load, urlFor });

    await expect(source.load()).resolves.toBeNull();
    expect(source.parseFailed()).toBe(false);
    expect(source.unavailableReason()).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[storybook-addon-oversight]'), expect.any(Error));
    await expect(source.load()).resolves.toEqual(MANIFEST);
  });

  it('urlFor is the injected resolver, untouched by the load', () => {
    const load = vi.fn(async (): Promise<ManifestLoadOutcome> => ({ manifest: MANIFEST }));
    const source = createManifestSource({ load, urlFor });
    expect(source.urlFor('components.html')).toBe('/manifests/components.html');
    expect(load).not.toHaveBeenCalled();
  });
});

describe('useOversightReport failure routing', () => {
  // The module under test caches at module scope and warms the load at eval,
  // so each test needs a fresh module registry and its fetch stub in place
  // BEFORE the import. These run the real load chain (manifestLoad behind the
  // source), so the routing they pin is end to end: the mocked `getService`
  // above answers the service fallback with "not registered".
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
      vi.fn(
        async () => ({ ok: true, text: async () => '<!doctype html>', json: async () => JSON.parse('<') }) as Response,
      ),
    );
    const { getByTestId } = await renderStatus();
    await waitFor(() => expect(getByTestId('status').textContent).toBe('error'));
  });

  it('keeps a network failure in the unavailable state when the services are not registered either', async () => {
    silenceConsoleError();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { getByTestId } = await renderStatus();
    // A failure with no docgen-server evidence gets one service attempt and no
    // retry window, so this settles at the default waitFor pace.
    await waitFor(() => expect(getByTestId('status').textContent).toBe('unavailable'));
  });
});
