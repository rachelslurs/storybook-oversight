import { describeManifestUnavailable, detectManifestFormat, resolveManifestRefs } from 'oversight-core';
import type { RawManifest, RawStory } from 'oversight-core';
import { belongsToComponent } from './componentId';
import { createManifestSource } from './manifestSource';
import type { ManifestLoad, ManifestLoadOutcome, ManifestSource } from './manifestSource';

/**
 * Builds a runtime's manifest transport, one strategy behind both surfaces:
 *
 * 1. Fetch `manifests/components.json`. An inline (v:0) manifest passes
 *    through; a ref (v:1) index gets its `$ref`s resolved by fetching the
 *    per-component files over the same transport, which is how a static build
 *    made with `experimentalDocgenServer` reads.
 * 2. When the fetch fails, ask the runtime's service API instead. Dev under
 *    the flag is the one world where that is the only source: the manifest
 *    route 404s on purpose, and the same flag registers the services, so
 *    "are the services registered" is the branch condition rather than a
 *    string match on the server's message.
 *
 * The synthesized manifest is fed through core's ref resolver with the nodes
 * inlined, so the lifting and the keyed-stories conversion are the same code
 * that handles a resolved v:1 leaf, and the payload shape checks downstream
 * see the shape they already know.
 */

/**
 * The runtime's `getService`, taken structurally so this module imports
 * neither manager-api nor preview-api: the panel passes the manager's, the
 * docs block the preview's. Throws when the service is not registered, which
 * is how "flag off" reads.
 */
export type GetService = (serviceId: string) => unknown;

type LoadedQuery = { loaded: () => Promise<unknown> };

function queryOf(service: unknown, name: string): LoadedQuery | undefined {
  const queries = (service as { queries?: Record<string, unknown> } | undefined)?.queries;
  const query = queries?.[name] as LoadedQuery | undefined;
  return typeof query?.loaded === 'function' ? query : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type FetchOutcome =
  | { kind: 'manifest'; raw: RawManifest }
  | { kind: 'failed'; reason?: string }
  | { kind: 'parse-failed'; outcome: ManifestLoadOutcome };

async function fetchIndex(url: string): Promise<FetchOutcome> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    // The request never completed (server down, offline), so "unavailable"
    // is literally true and the browser has already logged the network
    // failure on its own; nothing truer to add.
    return { kind: 'failed' };
  }
  if (!response.ok) {
    return { kind: 'failed', reason: describeManifestUnavailable(await response.text().catch(() => '')) };
  }
  try {
    return { kind: 'manifest', raw: (await response.json()) as RawManifest };
  } catch (err) {
    // A 200 whose body will not parse (a proxy's HTML error page, a
    // truncated write) is not a missing manifest: the feature answered, its
    // body was the problem, so the "enable addon-mcp" guess would be wrong.
    // The network tab shows this request as a success, which makes this log
    // the only evidence of the real cause; same convention as the analyze
    // step in useOversightReport.
    console.error('[storybook-addon-oversight] the components manifest was served but could not be parsed', err);
    return {
      kind: 'parse-failed',
      outcome: {
        manifest: null,
        parseFailed: true,
        unavailableReason:
          'The components manifest was served but could not be parsed. See the browser console for details.',
      },
    };
  }
}

/** Fetch one `$ref` target relative to the index's own URL. The status line is
 *  the whole detail: dev 404 bodies are HTML pages, which the entry-error
 *  screening would drop anyway. */
function refLoaderFor(indexUrl: URL): (relativePath: string) => Promise<string> {
  return async (relativePath) => {
    const response = await fetch(new URL(relativePath, indexUrl).href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  };
}

export type ServiceRetry = { attempts: number; delayMs: number };
const REGISTRATION_RETRY: ServiceRetry = { attempts: 6, delayMs: 250 };
const SINGLE_ATTEMPT: ServiceRetry = { attempts: 1, delayMs: 0 };

/**
 * How long to wait for service registration. The retry exists for one race:
 * the consumers warm the load at bundle eval, before a flag-on runtime has
 * registered its services (about half a second in the runs recorded on #50).
 * The registry cannot tell "not yet" apart from "never" (both throw the same
 * missing-service error), so waiting unconditionally stalled the unavailable
 * state by the whole window for everyone without the flag. The dev server's
 * 404 body naming the flag is the evidence that waiting can pay off. The hint
 * gates patience only, never reachability: without it, the one immediate
 * attempt still synthesizes whenever the services are already registered.
 */
function retryFor(reason: string | undefined): ServiceRetry {
  return reason !== undefined && /experimentalDocgenServer/i.test(reason) ? REGISTRATION_RETRY : SINGLE_ATTEMPT;
}

async function resolveService(getService: GetService | undefined, id: string, retry: ServiceRetry): Promise<unknown> {
  if (!getService) return undefined;
  for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
    try {
      return getService(id);
    } catch {
      if (attempt < retry.attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, retry.delayMs));
      }
    }
  }
  return undefined;
}

type IndexEntryTag = { id: string; tags: string[] };

/**
 * The story index's entries with their tags, or null when the index gave no
 * answer. The services key off the story index and ignore the `manifest` tag,
 * so without this filter the synthesized manifest lints components the built
 * manifest deliberately excludes. Null disables filtering rather than
 * emptying the manifest: over-linting beats silently linting nothing.
 */
async function indexEntryTags(indexJsonUrl: URL): Promise<IndexEntryTag[] | null> {
  try {
    const response = await fetch(indexJsonUrl.href);
    if (!response.ok) return null;
    const data = (await response.json()) as { entries?: unknown };
    if (!isRecord(data.entries)) return null;
    const entries: IndexEntryTag[] = [];
    for (const entry of Object.values(data.entries)) {
      if (!isRecord(entry)) continue;
      const { id, tags } = entry;
      if (typeof id !== 'string' || !Array.isArray(tags)) continue;
      entries.push({ id, tags: tags.filter((tag): tag is string => typeof tag === 'string') });
    }
    return entries;
  } catch {
    return null;
  }
}

/** The index holds story and docs ids, the services component ids; the
 *  pairing rule is the panel's own, shared through `belongsToComponent`. */
function hasManifestTaggedEntry(componentId: string, entries: IndexEntryTag[]): boolean {
  return entries.some((entry) => belongsToComponent(entry.id, componentId) && entry.tags.includes('manifest'));
}

/** The synthesized entry before core lifts it: `docgen` holds the service's
 *  node inline, `stories` the story-docs service's keyed record. Both are the
 *  shapes a resolved v:1 leaf hands the same resolver. */
type SynthesizedEntry = {
  id: string;
  name?: string;
  docgen: Record<string, unknown>;
  stories?: Record<string, RawStory>;
  import?: string;
};

async function synthesizeFromServices(
  getService: GetService | undefined,
  indexUrl: URL,
  retry: ServiceRetry,
): Promise<RawManifest | null> {
  const docgen = await resolveService(getService, 'core/docgen', retry);
  const allComponents = queryOf(docgen, 'docgenForAllComponents');
  if (!allComponents) return null;

  // The three reads are independent, so they run concurrently: the findings
  // paint after the slowest of them, not after their sum.
  const allPromise = allComponents.loaded().catch((err: unknown) => {
    // The service exists but its whole-index read failed (observed in static
    // builds, where the query's load needs a live server). The fetch already
    // failed to get here, so this is a real unavailable, worth its evidence.
    console.error('[storybook-addon-oversight] the docgen service could not read the component index', err);
    return undefined;
  });
  // story-docs is not registered in every runtime (the manager lacks it at
  // storybook 10.5, with registration announced). Its absence costs story
  // snippets and story-level errors, not the manifest, and docgen resolving
  // above means the registry is up, so there is nothing to wait for.
  const storyNodesPromise = (async (): Promise<Record<string, unknown>> => {
    const storyDocs = await resolveService(getService, 'core/story-docs', SINGLE_ATTEMPT);
    const allStoryDocs = queryOf(storyDocs, 'storyDocsForAllComponents');
    if (!allStoryDocs) return {};
    try {
      const loaded = await allStoryDocs.loaded();
      return isRecord(loaded) ? loaded : {};
    } catch {
      // Same degradation as an unregistered service.
      return {};
    }
  })();
  const taggedPromise = indexEntryTags(new URL('../index.json', indexUrl));

  const [all, storyNodes, tagged] = await Promise.all([allPromise, storyNodesPromise, taggedPromise]);
  if (!isRecord(all)) return null;

  const components: Record<string, SynthesizedEntry> = {};
  for (const [id, node] of Object.entries(all)) {
    if (!isRecord(node)) continue;
    if (tagged !== null && !hasManifestTaggedEntry(id, tagged)) continue;
    const entry: SynthesizedEntry = {
      id,
      name: typeof node.name === 'string' ? node.name : undefined,
      docgen: node,
    };
    const storyNode = storyNodes[id];
    if (isRecord(storyNode)) {
      if (isRecord(storyNode.stories)) entry.stories = storyNode.stories as Record<string, RawStory>;
      if (typeof storyNode.import === 'string') entry.import = storyNode.import;
    }
    components[id] = entry;
  }

  // A filter that stripped every component is not an empty project: the
  // services reported components and the index refused them all the manifest
  // tag. An empty manifest here read as "nothing to lint" and swallowed the
  // server's refusal; null keeps the unavailable state and its reason, which
  // point at the manifest configuration instead of at every component.
  if (Object.keys(components).length === 0 && Object.keys(all).length > 0) return null;

  // Core's resolver lifts the inline docgen node and converts the keyed
  // stories, the same paths a resolved ref leaf takes. Nothing here carries a
  // `$ref`, so a loader call means a service payload smuggled one in, and
  // refusing it lands as that entry's error rather than a fetch.
  return resolveManifestRefs({ v: 1, components: components as RawManifest['components'] } as RawManifest, () => {
    throw new Error('unexpected $ref in a service payload');
  });
}

export function createManifestLoad(io: {
  resolveUrl: (name: string) => string;
  getService: GetService | undefined;
  serviceRetry?: ServiceRetry;
}): ManifestLoad {
  return async () => {
    const indexUrl = new URL(io.resolveUrl('components.json'), document.baseURI);
    const fetched = await fetchIndex(indexUrl.href);
    if (fetched.kind === 'parse-failed') return fetched.outcome;
    if (fetched.kind === 'manifest') {
      if (detectManifestFormat(fetched.raw).kind !== 'ref') return { manifest: fetched.raw };
      return { manifest: await resolveManifestRefs(fetched.raw, refLoaderFor(indexUrl)) };
    }
    const synthesized = await synthesizeFromServices(
      io.getService,
      indexUrl,
      io.serviceRetry ?? retryFor(fetched.reason),
    );
    if (synthesized) return { manifest: synthesized };
    return { manifest: null, unavailableReason: fetched.reason };
  };
}

/**
 * The one composition both surfaces use: the resolver names sibling manifest
 * URLs and the load owns the transport. Kept here so the next load option
 * lands in one place instead of once per bundle. `getService` may be
 * undefined: storybook below 10.5 has none, and the load then stays
 * fetch-only, which is all those versions serve anyway.
 */
export function createRuntimeManifestSource(io: {
  resolveUrl: (name: string) => string;
  getService: GetService | undefined;
}): ManifestSource {
  return createManifestSource({ urlFor: io.resolveUrl, load: createManifestLoad(io) });
}
