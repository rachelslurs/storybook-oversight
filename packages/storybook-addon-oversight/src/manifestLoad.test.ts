// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManifestLoad, createRuntimeManifestSource } from './manifestLoad';
import type { GetService } from './manifestLoad';
import type { RawEntry } from 'oversight-core';

// The transport under test routes by URL: the index, the per-component service
// leaves, and the story index. Leaf shapes are modeled on the #50 runtime
// captures (probe-results on the proto/service-api-observation branch): a leaf
// wraps its node in { components: { <id>: node } } and the ref's pointer is
// #/components/<id>.

const resolveUrl = (name: string) => `http://sb.test/manifests/${name}`;

/** No waiting in tests: one resolution attempt, no delay. */
const NO_RETRY = { attempts: 1, delayMs: 0 };

const REFUSAL = 'Manifest "components" is not available in dev when experimentalDocgenServer is enabled';

const BANNER_DOCGEN_NODE = {
  id: 'feedback-banner',
  name: 'Banner',
  path: './stories/Banner/Banner.stories.tsx',
  description: 'A full-width inline message.',
  jsDocTags: { deprecated: ['Use Toast for transient messages, or Card for persistent ones.'] },
  argTypes: { children: { name: 'children' } },
  reactComponentMeta: {
    displayName: 'Banner',
    exportName: 'Banner',
    filePath: '/repo/stories/Banner/Banner.tsx',
    description: 'A full-width inline message.',
    props: {
      children: {
        name: 'children',
        required: false,
        description: 'Message shown in the banner.',
        declarations: [{ name: 'BannerProps', fileName: 'stories/Banner/Banner.tsx' }],
      },
    },
  },
};

const CARD_DOCGEN_NODE = {
  id: 'data-display-card',
  name: 'Card',
  path: './stories/Card/Card.stories.tsx',
  jsDocTags: {},
  reactComponentMeta: {
    displayName: 'Card',
    exportName: 'Card',
    filePath: '/repo/stories/Card/Card.tsx',
    props: { title: { name: 'title', required: true, description: '' } },
  },
};

const BANNER_STORY_NODE = {
  id: 'feedback-banner',
  name: 'Banner',
  path: './stories/Banner/Banner.stories.tsx',
  import: 'import { Banner } from "demo";',
  stories: {
    'feedback-banner--default': { id: 'feedback-banner--default', name: 'Default', snippet: '<Banner/>' },
  },
};

const V1_INDEX = {
  v: 1,
  components: {
    'feedback-banner': {
      id: 'feedback-banner',
      name: 'Banner',
      description: 'A full-width inline message.',
      docgen: { $ref: '../services/core/docgen/feedback-banner.json#/components/feedback-banner' },
      stories: { $ref: '../services/core/story-docs/feedback-banner.json#/components/feedback-banner' },
    },
    'data-display-card': {
      id: 'data-display-card',
      name: 'Card',
      docgen: { $ref: '../services/core/docgen/data-display-card.json#/components/data-display-card' },
    },
  },
};

function okJson(body: unknown): Response {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) as unknown } as Response;
}

function okBody(body: string): Response {
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) as unknown } as Response;
}

function notOk(status: number, body = ''): Response {
  return { ok: false, status, text: async () => body, json: async () => JSON.parse(body) as unknown } as Response;
}

/** Routes fetch by URL; a route returning undefined is a network failure. */
function stubFetch(route: (url: string) => Response | undefined) {
  const mock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    const response = route(url);
    if (!response) throw new TypeError(`Failed to fetch ${url}`);
    return response;
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A getService that resolves only the services handed to it and throws for
 *  the rest, the way an unregistered service reads at runtime. */
function servicesWith(registered: Record<string, unknown>): GetService & ReturnType<typeof vi.fn> {
  return vi.fn((serviceId: string) => {
    if (serviceId in registered) return registered[serviceId];
    throw new Error(`No registered service with id "${serviceId}" exists in this environment.`);
  }) as GetService & ReturnType<typeof vi.fn>;
}

function docgenService(loaded: () => Promise<unknown>) {
  return { queries: { docgenForAllComponents: { loaded } } };
}

function storyDocsService(loaded: () => Promise<unknown>) {
  return { queries: { storyDocsForAllComponents: { loaded } } };
}

const ALL_TAGGED_INDEX = {
  v: 5,
  entries: {
    'feedback-banner--default': { id: 'feedback-banner--default', tags: ['dev', 'test', 'manifest'] },
    'data-display-card--default': { id: 'data-display-card--default', tags: ['dev', 'test', 'manifest'] },
  },
};

function componentsOf(manifest: { components?: Record<string, RawEntry> } | null): Record<string, RawEntry> {
  expect(manifest).not.toBeNull();
  return manifest?.components ?? {};
}

function silenceConsoleError() {
  return vi.spyOn(console, 'error').mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createManifestLoad over fetch', () => {
  it('passes a v:0 manifest through untouched, without consulting the services', async () => {
    const raw = { v: 0, components: { 'actions-button': { id: 'actions-button', name: 'Button' } } };
    stubFetch((url) => (url.includes('manifests/components.json') ? okJson(raw) : undefined));
    const getService = servicesWith({});
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    expect(outcome.manifest).toEqual(raw);
    expect(getService).not.toHaveBeenCalled();
  });

  it('resolves a v:1 index by fetching its refs relative to the index URL', async () => {
    stubFetch((url) => {
      if (url.includes('manifests/components.json')) return okJson(V1_INDEX);
      if (url === 'http://sb.test/services/core/docgen/feedback-banner.json')
        return okJson({ components: { 'feedback-banner': BANNER_DOCGEN_NODE } });
      if (url === 'http://sb.test/services/core/story-docs/feedback-banner.json')
        return okJson({ components: { 'feedback-banner': BANNER_STORY_NODE } });
      if (url === 'http://sb.test/services/core/docgen/data-display-card.json')
        return okJson({ components: { 'data-display-card': CARD_DOCGEN_NODE } });
      return undefined;
    });
    const getService = servicesWith({});
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    const components = componentsOf(outcome.manifest);
    const banner = components['feedback-banner'];
    expect(banner.reactComponentMeta).toEqual(BANNER_DOCGEN_NODE.reactComponentMeta);
    expect(banner.path).toBe('./stories/Banner/Banner.stories.tsx');
    expect(banner.description).toBe('A full-width inline message.');
    expect(banner.jsDocTags).toEqual(BANNER_DOCGEN_NODE.jsDocTags);
    expect(banner.stories).toEqual([{ id: 'feedback-banner--default', name: 'Default', snippet: '<Banner/>' }]);
    expect(banner).not.toHaveProperty('docgen');
    expect(banner.refErrors).toBeUndefined();
    expect(components['data-display-card'].reactComponentMeta).toEqual(CARD_DOCGEN_NODE.reactComponentMeta);
    expect(getService).not.toHaveBeenCalled();
  });

  it("turns one unreachable leaf into that entry's refErrors while the rest resolve", async () => {
    stubFetch((url) => {
      if (url.includes('manifests/components.json')) return okJson(V1_INDEX);
      if (url === 'http://sb.test/services/core/docgen/feedback-banner.json')
        return okJson({ components: { 'feedback-banner': BANNER_DOCGEN_NODE } });
      if (url === 'http://sb.test/services/core/story-docs/feedback-banner.json')
        return okJson({ components: { 'feedback-banner': BANNER_STORY_NODE } });
      if (url === 'http://sb.test/services/core/docgen/data-display-card.json')
        return notOk(404, '<html>dev 404</html>');
      return undefined;
    });
    const load = createManifestLoad({ resolveUrl, getService: servicesWith({}), serviceRetry: NO_RETRY });

    const outcome = await load();
    const components = componentsOf(outcome.manifest);
    expect(components['feedback-banner'].refErrors).toBeUndefined();
    const card = components['data-display-card'];
    expect(card.refErrors).toHaveLength(1);
    expect(card.refErrors?.[0]).toContain('failed to load');
    expect(card.reactComponentMeta).toBeUndefined();
  });

  it('reports an unparseable 200 as a parse failure and never asks the services', async () => {
    const errorSpy = silenceConsoleError();
    stubFetch((url) => (url.includes('manifests/components.json') ? okBody('{"v":0,"compo') : undefined));
    const getService = servicesWith({});
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.parseFailed).toBe(true);
    expect(outcome.unavailableReason).toContain('could not be parsed');
    expect(getService).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[storybook-addon-oversight]'),
      expect.any(SyntaxError),
    );
  });
});

describe('createManifestLoad service fallback', () => {
  function refusedFetch(extra?: (url: string) => Response | undefined) {
    return stubFetch((url) => {
      if (url.includes('manifests/components.json')) return notOk(404, REFUSAL);
      return extra?.(url);
    });
  }

  it('synthesizes the manifest from both services when the fetch is refused', async () => {
    refusedFetch((url) => (url.endsWith('/index.json') ? okJson(ALL_TAGGED_INDEX) : undefined));
    const getService = servicesWith({
      'core/docgen': docgenService(async () => ({
        'feedback-banner': BANNER_DOCGEN_NODE,
        'data-display-card': CARD_DOCGEN_NODE,
      })),
      'core/story-docs': storyDocsService(async () => ({ 'feedback-banner': BANNER_STORY_NODE })),
    });
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    expect(outcome.unavailableReason).toBeUndefined();
    const components = componentsOf(outcome.manifest);
    const banner = components['feedback-banner'];
    expect(banner.reactComponentMeta).toEqual(BANNER_DOCGEN_NODE.reactComponentMeta);
    expect(banner.path).toBe('./stories/Banner/Banner.stories.tsx');
    expect(banner.stories).toEqual([{ id: 'feedback-banner--default', name: 'Default', snippet: '<Banner/>' }]);
    expect((banner as { import?: string }).import).toBe('import { Banner } from "demo";');
    expect(banner).not.toHaveProperty('docgen');
    expect(components['data-display-card'].reactComponentMeta).toEqual(CARD_DOCGEN_NODE.reactComponentMeta);
  });

  it('synthesizes without stories when story-docs is not registered, the manager at storybook 10.5', async () => {
    refusedFetch((url) => (url.endsWith('/index.json') ? okJson(ALL_TAGGED_INDEX) : undefined));
    const getService = servicesWith({
      'core/docgen': docgenService(async () => ({ 'feedback-banner': BANNER_DOCGEN_NODE })),
    });
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    const components = componentsOf(outcome.manifest);
    expect(components['feedback-banner'].reactComponentMeta).toEqual(BANNER_DOCGEN_NODE.reactComponentMeta);
    expect(components['feedback-banner'].stories).toBeUndefined();
  });

  it('drops components with no manifest-tagged index entry, and filters nothing when the index is unreachable', async () => {
    const taggedIndex = {
      v: 5,
      entries: {
        'feedback-banner--default': { id: 'feedback-banner--default', tags: ['dev', 'manifest'] },
        'internal-docs-block--measures': { id: 'internal-docs-block--measures', tags: ['test'] },
      },
    };
    const all = async () => ({
      'feedback-banner': BANNER_DOCGEN_NODE,
      'internal-docs-block': {
        id: 'internal-docs-block',
        name: 'DocsBlock',
        jsDocTags: {},
        error: { name: 'No component found', message: 'x' },
      },
    });

    refusedFetch((url) => (url.endsWith('/index.json') ? okJson(taggedIndex) : undefined));
    const filtered = await createManifestLoad({
      resolveUrl,
      getService: servicesWith({ 'core/docgen': docgenService(all) }),
      serviceRetry: NO_RETRY,
    })();
    const filteredComponents = componentsOf(filtered.manifest);
    expect(Object.keys(filteredComponents)).toEqual(['feedback-banner']);

    refusedFetch(() => undefined);
    const unfiltered = await createManifestLoad({
      resolveUrl,
      getService: servicesWith({ 'core/docgen': docgenService(all) }),
      serviceRetry: NO_RETRY,
    })();
    expect(Object.keys(componentsOf(unfiltered.manifest)).sort()).toEqual(['feedback-banner', 'internal-docs-block']);
  });

  it("keeps the server's own refusal when no service is registered", async () => {
    refusedFetch(() => undefined);
    const getService = servicesWith({});
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: { attempts: 2, delayMs: 0 } });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.parseFailed).toBeUndefined();
    expect(outcome.unavailableReason).toContain('experimentalDocgenServer');
    expect(getService).toHaveBeenCalledWith('core/docgen');
  });

  it('keeps the fetch reason when the whole-index read rejects, the static-build behavior', async () => {
    const errorSpy = silenceConsoleError();
    refusedFetch(() => undefined);
    const getService = servicesWith({
      'core/docgen': docgenService(async () => {
        throw new Error('No runtime acknowledged remote command "core/docgen.extractAllDocgen"');
      }),
    });
    const load = createManifestLoad({ resolveUrl, getService, serviceRetry: NO_RETRY });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.unavailableReason).toContain('experimentalDocgenServer');
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[storybook-addon-oversight]'), expect.any(Error));
  });

  it('reads a network failure with no services as plain unavailable, no reason invented', async () => {
    stubFetch(() => undefined);
    const load = createManifestLoad({ resolveUrl, getService: servicesWith({}), serviceRetry: NO_RETRY });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.unavailableReason).toBeUndefined();
    expect(outcome.parseFailed).toBeUndefined();
  });

  it('waits out the registration race when the refusal names the flag, with no injected retry', async () => {
    refusedFetch((url) => (url.endsWith('/index.json') ? okJson(ALL_TAGGED_INDEX) : undefined));
    // Not registered on the first attempt, registered on the second: the race
    // the retry window exists for, at one 250ms sleep of test time.
    const docgen = docgenService(async () => ({ 'feedback-banner': BANNER_DOCGEN_NODE }));
    let calls = 0;
    const getService = vi.fn((serviceId: string) => {
      calls += 1;
      if (calls === 1 || serviceId !== 'core/docgen') {
        throw new Error(`No registered service with id "${serviceId}" exists in this environment.`);
      }
      return docgen;
    }) as GetService & ReturnType<typeof vi.fn>;
    const load = createManifestLoad({ resolveUrl, getService });

    const outcome = await load();
    expect(componentsOf(outcome.manifest)['feedback-banner'].reactComponentMeta).toEqual(
      BANNER_DOCGEN_NODE.reactComponentMeta,
    );
    expect(getService.mock.calls.filter(([id]) => id === 'core/docgen').length).toBeGreaterThan(1);
  });

  it('makes exactly one service attempt when the failure carries no docgen-server evidence', async () => {
    stubFetch((url) => (url.includes('manifests/components.json') ? notOk(404, 'plain not found') : undefined));
    const getService = servicesWith({});
    const load = createManifestLoad({ resolveUrl, getService });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(getService).toHaveBeenCalledTimes(1);
    expect(getService).toHaveBeenCalledWith('core/docgen');
  });

  it('treats a filter that stripped every component as unavailable, keeping the refusal', async () => {
    const untaggedIndex = {
      v: 5,
      entries: { 'feedback-banner--default': { id: 'feedback-banner--default', tags: ['dev', 'test'] } },
    };
    refusedFetch((url) => (url.endsWith('/index.json') ? okJson(untaggedIndex) : undefined));
    const load = createManifestLoad({
      resolveUrl,
      getService: servicesWith({
        'core/docgen': docgenService(async () => ({ 'feedback-banner': BANNER_DOCGEN_NODE })),
      }),
      serviceRetry: NO_RETRY,
    });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.unavailableReason).toContain('experimentalDocgenServer');
  });

  it('stays fetch-only when the runtime has no getService, as on storybook 10.3 and 10.4', async () => {
    refusedFetch(() => undefined);
    const load = createManifestLoad({ resolveUrl, getService: undefined });

    const outcome = await load();
    expect(outcome.manifest).toBeNull();
    expect(outcome.unavailableReason).toContain('experimentalDocgenServer');
  });
});

describe('createRuntimeManifestSource', () => {
  it('composes the source over the load, with urlFor the injected resolver', () => {
    const source = createRuntimeManifestSource({ resolveUrl, getService: undefined });
    expect(source.urlFor('components.html')).toBe('http://sb.test/manifests/components.html');
  });
});
