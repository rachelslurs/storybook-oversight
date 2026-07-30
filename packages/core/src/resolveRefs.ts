import { describeManifestUnavailable } from './manifestStatus';
import type { RawDocgenNode, RawEntry, RawManifest, RawStory, RawStoryDocsNode } from './types';

/**
 * Reads one ref target's text, addressed relative to the index file's
 * directory. The CLI backs this with readFileSync, the addon with fetch;
 * core stays free of I/O and Storybook imports.
 */
export type RefLoader = (relativePath: string) => string | Promise<string>;

type ParsedRef = { path: string; pointer: string } | { refused: string };

/**
 * Validate the `<relative-path>#<json-pointer>` grammar and normalize the
 * path. The checks are structural: matching the literal `services/core/...`
 * layout would turn an upstream rename into mass docgen-missing errors, and
 * Storybook documents that layout as an internal construct.
 *
 * The index sits one directory below the build root, so a legal ref climbs at
 * most one level above the index's directory.
 */
function parseRef(ref: string): ParsedRef {
  const hash = ref.indexOf('#');
  if (hash === -1) return { refused: 'missing "#" fragment' };
  const pointer = ref.slice(hash + 1);
  if (pointer === '') return { refused: 'empty "#" fragment' };
  if (!pointer.startsWith('/')) return { refused: 'fragment is not a JSON pointer' };
  const rawPath = ref.slice(0, hash);
  if (rawPath === '') return { refused: 'missing file path' };
  if (rawPath.startsWith('/')) return { refused: 'absolute path' };
  // Backslashes would hide `..\` segments from the slash-based normalization.
  if (rawPath.includes('\\')) return { refused: 'backslash in path' };
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(rawPath)) return { refused: 'URL scheme' };

  const segments: string[] = [];
  let up = 0;
  for (const part of rawPath.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length > 0) segments.pop();
      else up += 1;
      continue;
    }
    segments.push(part);
  }
  if (up > 1) return { refused: 'path escapes the build output' };
  if (segments.length === 0) return { refused: 'path resolves to no file' };
  return { path: up === 1 ? `../${segments.join('/')}` : segments.join('/'), pointer };
}

/**
 * RFC-6901 lookup. Own properties only, so tokens like "constructor" read as
 * missing on plain objects. `~1` unescapes before `~0`: the reverse order
 * turns the token "x~01y" (the key "x~1y") into "x/y".
 */
function resolvePointer(doc: unknown, pointer: string): unknown {
  let node: unknown = doc;
  for (const token of pointer.split('/').slice(1)) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(node)) {
      if (!/^(0|[1-9]\d*)$/.test(key)) return undefined;
      node = node[Number(key)];
    } else if (node !== null && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key)) {
      node = (node as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return node;
}

type FileLoad = { ok: true; data: unknown } | { ok: false; detail: string | undefined };
type LoadFile = (path: string) => Promise<FileLoad>;

/**
 * Read and parse one leaf file. A parse failure keeps the raw body as the
 * detail, never the JSON.parse message, which quotes the body verbatim;
 * `describeManifestUnavailable` screens the detail before it can reach an
 * entry error (in dev these paths return an HTML 404 page).
 */
async function readLeaf(load: RefLoader, path: string): Promise<FileLoad> {
  let body: string;
  try {
    body = await load(path);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : undefined };
  }
  try {
    return { ok: true, data: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, detail: body };
  }
}

function loadFailure(ref: string, detail: string | undefined): string {
  const reason = describeManifestUnavailable(detail);
  return reason ? `Manifest ref "${ref}" failed to load: ${reason}` : `Manifest ref "${ref}" failed to load.`;
}

/** Anything carrying a `$ref` key counts as a ref, even malformed, so a broken
 *  ref degrades to an entry error instead of reaching the normalizer as-is. */
function refOf(value: unknown): { isRef: boolean; ref?: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { isRef: false };
  if (!('$ref' in value)) return { isRef: false };
  const ref = (value as { $ref?: unknown }).$ref;
  return { isRef: true, ref: typeof ref === 'string' ? ref : undefined };
}

type RefResult = { node?: Record<string, unknown>; error?: string };

async function resolveRef(ref: string | undefined, loadFile: LoadFile): Promise<RefResult> {
  if (ref === undefined) return { error: 'Manifest ref refused: $ref is not a string.' };
  const parsed = parseRef(ref);
  if ('refused' in parsed) return { error: `Manifest ref "${ref}" refused: ${parsed.refused}.` };
  const loaded = await loadFile(parsed.path);
  if (!loaded.ok) return { error: loadFailure(ref, loaded.detail) };
  const node = resolvePointer(loaded.data, parsed.pointer);
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    return { error: `Manifest ref "${ref}" does not resolve in the loaded file.` };
  }
  return { node: node as Record<string, unknown> };
}

/** The leaf keys `stories` by story id; the normalizer iterates it. */
function storiesToArray(value: unknown): RawStory[] | undefined {
  if (Array.isArray(value)) return value as RawStory[];
  if (value === null || typeof value !== 'object') return undefined;
  return Object.values(value) as RawStory[];
}

async function resolveEntry(entry: RawEntry, loadFile: LoadFile): Promise<RawEntry> {
  const docgen = refOf((entry as { docgen?: unknown }).docgen);
  const stories = refOf(entry.stories);
  if (!docgen.isRef && !stories.isRef) {
    // An entry the index inlined rather than deferred still carries the leaf's
    // keyed `stories`, which the normalizer cannot iterate.
    if (entry.stories !== undefined && !Array.isArray(entry.stories)) {
      return { ...entry, stories: storiesToArray(entry.stories) };
    }
    return entry;
  }

  const next = { ...entry } as RawEntry & { docgen?: unknown };
  delete next.docgen;
  const errors: string[] = [];

  if (docgen.isRef) {
    const { node, error } = await resolveRef(docgen.ref, loadFile);
    if (error) errors.push(error);
    if (node) {
      const leaf = node as RawDocgenNode;
      if (leaf.path !== undefined) next.path = leaf.path;
      if (leaf.jsDocTags !== undefined) next.jsDocTags = leaf.jsDocTags;
      if (leaf.reactComponentMeta !== undefined) next.reactComponentMeta = leaf.reactComponentMeta;
    }
  }

  if (stories.isRef) {
    // Never leave the `{ $ref }` wrapper in place: the normalizer iterates
    // `stories`, and a plain object is not iterable.
    delete next.stories;
    const { node, error } = await resolveRef(stories.ref, loadFile);
    if (error) errors.push(error);
    if (node) {
      const leaf = node as RawStoryDocsNode;
      if (leaf.stories !== undefined) next.stories = storiesToArray(leaf.stories);
      // Both leaves carry an identical `path`. When the docgen leaf is the one
      // missing, the story-docs copy keeps `ExtractionFailure.storiesFile`
      // usable: it lets the panel match the current story and anchors CI
      // annotations.
      if (next.path === undefined && leaf.path !== undefined) next.path = leaf.path;
    }
  }

  if (errors.length > 0 && next.error == null) next.error = errors.join('\n');
  return next;
}

/**
 * Fold a v:1 ref index into the inline entry shape `normalizeManifest`
 * consumes. `v` and `meta` pass through untouched (normalization reads the
 * format later), as does any entry without a ref.
 *
 * Every per-ref failure (refused grammar, unreadable file, unparseable JSON,
 * unresolved pointer) lands as that entry's `error`, which normalization turns
 * into an `ExtractionFailure` and the docgen-missing rule reports. One bad ref
 * never fails the whole manifest.
 *
 * Leaf files are cached by normalized path so a file shared by several refs
 * loads once; each ref's pointer applies to the cached parse afterward.
 */
export async function resolveManifestRefs(raw: RawManifest, load: RefLoader): Promise<RawManifest> {
  if (!raw.components) return { ...raw };

  const cache = new Map<string, Promise<FileLoad>>();
  const loadFile: LoadFile = (path) => {
    let pending = cache.get(path);
    if (!pending) {
      pending = readLeaf(load, path);
      cache.set(path, pending);
    }
    return pending;
  };

  const components: Record<string, RawEntry> = {};
  for (const [id, entry] of Object.entries(raw.components)) {
    components[id] = await resolveEntry(entry, loadFile);
  }
  return { ...raw, components };
}
