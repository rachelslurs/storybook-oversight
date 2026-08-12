/**
 * Prints what Storybook's MCP server serves for one component or docs entry.
 *
 * A finding says a component's docs are missing; nothing showed what that costs.
 * An entry carrying an extraction error, an entry with no docgen payload, and an
 * entry whose payload records no props all render identically to an agent, with
 * no `## Props` section and no trace of the diagnosis, so a warning reads as
 * "the component still works". The served text is the argument that it does not.
 *
 * The manifest goes to the server raw. `@storybook/mcp` follows a v:1 `$ref`
 * itself: `addGetDocumentationTool` calls the exported `resolveComponentEntry`,
 * which walks the ref through `manifestProvider` (storybookjs/storybook,
 * `code/lib/mcp/src/tools/get-documentation.ts` and
 * `code/lib/mcp/src/utils/get-manifest.ts`). Resolving first would hand it an
 * entry that had already absorbed its own failure: a ref that dangles would
 * render as a healthy component with nothing in it, instead of failing the
 * call, which is the one case this command exists to make visible.
 *
 * The output is the tool result. It says nothing about what a model does with
 * it, and nothing here should suggest otherwise.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describeLoaderFailure, parseRef } from 'oversight-core';
import type { RawManifest } from 'oversight-core';
import { getDocumentation, listAllDocumentation } from 'oversight-agent-view';
import type { ManifestSource, McpModule } from 'oversight-agent-view';
import type { AgentViewOptions } from './config';
import { ManifestError, assertManifestShape, buildRoot, readLeafFile, readManifest } from './manifest';
import { McpLoadError, describeOrigin, loadMcp } from './mcpModule';
import type { RunResult } from './run';

/** What a build writes when it has no MDX docs, and what a missing file stands in as. */
const EMPTY_DOCS = JSON.stringify({ v: 0, docs: {} });

/**
 * Fences the served text.
 *
 * Tildes rather than backticks: the served text carries triple-backtick blocks
 * of its own around every story snippet and the props type, so a backtick fence
 * closes at the first one and a paste keeps a fraction of the entry. The served
 * text also opens on `# <Name>` and carries `## Props`, which would otherwise
 * read as sections of this report rather than as the document it quotes.
 */
const MIN_FENCE = '~~~~';

/**
 * A fence long enough to survive the text it wraps.
 *
 * `formatDocsManifest` interpolates a docs entry's `content` into its output, so
 * markdown the page author wrote can reach this report. A page demonstrating a
 * backtick fence writes a tilde one to hold it, and a fixed four tildes would
 * close on that line, spilling the rest of the served text and the closing note
 * into the surrounding document. A docs entry carrying one renders it verbatim,
 * which `run.test.ts` drives end to end.
 *
 * A closing fence may be indented up to three spaces (CommonMark 4.5), so
 * indented tilde runs count toward the width too.
 */
export function fenceFor(...sections: string[]): string {
  const longest = sections
    .flatMap((section) => section.split('\n'))
    .map((line) => /^ {0,3}(~{4,})/.exec(line)?.[1].length ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return longest === 0 ? MIN_FENCE : '~'.repeat(longest + 1);
}

/** Closes the report. Exported so a test can find the section above it by whole line. */
export const AGENT_VIEW_DISCLAIMER =
  'This is the text the MCP server returns. It says nothing about what a model does with it.';

/** Heads the `get-documentation` section. Exported for the same reason. */
export const DOCUMENTATION_HEADING = '## get-documentation';

/**
 * Answer the server's manifest requests from the build output on disk.
 *
 * The component manifest is served from what was already read, not re-read from
 * the path the server names: a manifest may be passed by an explicit path under
 * any filename, and the server always asks for the canonical one.
 *
 * The docs manifest is optional. `getManifests` requests both together through
 * `Promise.allSettled` and returns without a docs manifest when that one rejects
 * (storybookjs/storybook, `code/lib/mcp/src/utils/get-manifest.ts`), but the
 * empty stub keeps the two surfaces reading the same way whether or not a build
 * wrote MDX docs. It is served from beside the manifest, which is where a build
 * writes it, rather than from the canonical path the server names.
 */
function diskSource(
  mcp: McpModule,
  raw: RawManifest,
  manifestPath: string,
  onDocs: { refused: (reason: string) => void; entries: (found: EntryPrefix[]) => void },
): ManifestSource {
  const { base, root } = buildRoot(manifestPath);
  const manifest = JSON.stringify(raw);
  const arrivals = refArrivals(raw);
  const docsPath = resolve(dirname(resolve(manifestPath)), 'docs.json');

  return async (path: string) => {
    if (path === mcp.COMPONENT_MANIFEST_PATH) return manifest;
    if (path === mcp.DOCS_MANIFEST_PATH) {
      if (!existsSync(docsPath)) return EMPTY_DOCS;
      try {
        const docs = docsManifest(read(path, docsPath, root));
        onDocs.entries(docPrefixes(docs.entries));
        return docs.body;
      } catch (err) {
        // Upstream carries on without a docs manifest when this request rejects,
        // so a docs entry then reports as one the server does not offer. The
        // reason has to reach the report or the file looks absent.
        onDocs.refused((err as Error).message);
        throw err;
      }
    }
    return refPayload(path, arrivals, base, root);
  };
}

/**
 * The path the server will ask for, per `$ref` in the manifest.
 *
 * Upstream joins every ref against a constant `manifests/` URL directory
 * (`new URL(ref, ...)`) and asks for the resulting pathname, which
 * percent-encodes the path and clamps any climb past the URL's root. The join
 * is lossy, so a request alone cannot say which ref produced it: `../x` and
 * `../../x` both arrive as `x`. Walking the manifest's own refs forward through
 * the same join leaves nothing to invert, and each request is answered from the
 * original ref, resolved and refused exactly where the lint path resolves and
 * refuses it.
 */
function refArrivals(raw: RawManifest): Map<string, string[]> {
  const arrivals = new Map<string, string[]>();
  for (const entry of Object.values(raw.components ?? {})) {
    for (const holder of [(entry as { docgen?: unknown }).docgen, entry.stories]) {
      if (holder === null || typeof holder !== 'object' || Array.isArray(holder)) continue;
      const ref = (holder as { $ref?: unknown }).$ref;
      if (typeof ref !== 'string') continue;
      let arrival: string;
      try {
        arrival = new URL(ref, 'https://localhost/manifests/').pathname.replace(/^\//, '');
      } catch {
        continue; // a ref the URL parser rejects is one the server never asks for
      }
      const refs = arrivals.get(arrival) ?? [];
      if (!refs.includes(ref)) refs.push(ref);
      arrivals.set(arrival, refs);
    }
  }
  return arrivals;
}

/**
 * One ref target's text, or the refusal the lint path gives for the same ref.
 *
 * A request that matches no ref is an error rather than a guess: the only paths
 * the server asks for beyond the two manifests are the ones its join produces
 * from the manifest's refs, so an unmatched one means the mapping above no
 * longer mirrors the join. Two refs can collide on one arrival (`../manifests/x`
 * and `./manifests/x` both arrive as `manifests/x`); the collision is answered
 * only when both name the same file.
 */
function refPayload(requested: string, arrivals: Map<string, string[]>, base: string, root: string): string {
  const refs = arrivals.get(requested.replace(/^\.\//, ''));
  if (refs === undefined) {
    throw new Error(`The server asked for "${requested}", which no $ref in the manifest produces.`);
  }
  const verdicts = refs.map((ref) => {
    const parsed = parseRef(ref);
    return 'refused' in parsed ? `refused: ${parsed.refused}` : resolve(base, parsed.path);
  });
  if (new Set(verdicts).size > 1) {
    throw new Error(
      `The server asked for "${requested}", which ${refs.map((ref) => `"${ref}"`).join(' and ')} produce with different targets.`,
    );
  }
  const ref = refs[0] as string;
  const parsed = parseRef(ref);
  if ('refused' in parsed) throw new Error(`Manifest ref "${ref}" refused: ${parsed.refused}.`);
  return read(ref, resolve(base, parsed.path), root);
}

/**
 * The docs manifest, or a rejection.
 *
 * `docs.json` is an ordinary filename that TypeDoc and Docusaurus also write, so
 * the file beside a components manifest is not necessarily this one. Upstream
 * settles both manifest requests together and carries on without docs when the
 * docs one rejects, but a value that parses and then fails the schema throws out
 * of `parseManifest` and takes the whole call with it. Rejecting an unrecognized
 * file reaches the path that renders the components anyway.
 */
function docsManifest(body: string): { body: string; entries: Record<string, unknown> } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('docs.json beside the manifest is not JSON.');
  }
  const shape = parsed as { v?: unknown; docs?: unknown };
  // `v` is 0 or 1, not any number: a `v: 2` file clears a typeof check, reaches
  // `parseManifest` and throws outside the tolerance this gate exists to reach.
  // `parsed` is tested first because the cast above is erased at runtime, and a
  // file holding `null` parses: reading `v` off it raises a TypeError that goes
  // out as the refusal reason in place of this sentence. Every other primitive
  // answers `undefined` there and is rejected by the same clause.
  // Entry-level shape stays upstream's to validate; this only keeps a document
  // that is plainly not a docs manifest away from it. The residue: a real docs
  // manifest whose entries drift from the rendering copy's schema at an
  // unchanged `v` passes here, throws inside `parseManifest`, and fails every
  // get-documentation call loudly, with no refusal note to explain it.
  if (parsed === null || (shape.v !== 0 && shape.v !== 1) || typeof shape.docs !== 'object' || shape.docs === null) {
    throw new Error('docs.json beside the manifest is some other document, not a Storybook docs manifest.');
  }
  return { body, entries: shape.docs as Record<string, unknown> };
}

/**
 * Read one file the server asked for, reusing the ref hardening the lint path
 * already applies: real path, contained in the build output, a regular file, and
 * under the size ceiling.
 *
 * The failure is reported the way `resolveManifestRefs` reports its own, and for
 * the same reason. A refusal and a missing file are different events, and this
 * text is meant to be pasted into a pull request, where `realpathSync`'s
 * absolute path would carry the runner's directory layout with it.
 */
function read(requested: string, target: string, root: string): string {
  try {
    return readLeafFile(target, root);
  } catch (err) {
    const detail = describeLoaderFailure(err) ?? 'unknown error';
    // A refusal is thrown here with no errno; anything with one came from the
    // filesystem, which is a load that failed rather than a path turned away.
    const refused = typeof (err as { code?: unknown }).code !== 'string';
    throw new Error(
      refused
        ? `Manifest ref "${requested}" refused: ${detail}.`
        : `Manifest ref "${requested}" failed to load: ${detail}`,
    );
  }
}

/** One entry's fixed bullet prefix in the selection list, as upstream writes it. */
type EntryPrefix = { id: string; prefix: string };

/**
 * The prefixes `formatComponentLine` will write: `- ${name} (${id})`, with the
 * optional `: <summary>` after. Interpolated the way upstream interpolates, so
 * a missing field renders here exactly as it renders there.
 */
function componentPrefixes(raw: RawManifest): EntryPrefix[] {
  return Object.values(raw.components ?? {}).map((entry) => ({
    id: String(entry.id),
    prefix: `- ${entry.name} (${entry.id})`,
  }));
}

/** The prefixes `formatDocLine` will write: the title falls back to the name. */
function docPrefixes(entries: Record<string, unknown>): EntryPrefix[] {
  return Object.values(entries).map((doc) => {
    const d = doc as { id?: unknown; name?: unknown; title?: unknown };
    return { id: String(d.id), prefix: `- ${d.title ?? d.name} (${d.id})` };
  });
}

/**
 * The entry's whole bullet in the selection list.
 *
 * An entry is one bullet, not one line of text. Upstream truncates a description
 * to 90 characters and appends an ellipsis without touching the newlines inside
 * it (`formatComponentLine`, storybookjs/storybook,
 * `code/lib/mcp/src/utils/manifest-formatter/markdown.ts`), so a description that
 * wraps arrives as several physical lines, blank ones included, and the ellipsis
 * that marks the cut is on the last of them.
 *
 * Both ends are anchored on prefixes computed from the manifests rather than on
 * a grammar guessed from the text: a description is arbitrary markdown, and any
 * line-shape test (a leading `- `, a parenthesized id, a heading, a blank) is a
 * shape a description can also contain. A bullet opens where the list carries an
 * entry's own `- ${name} (${id})`, ends at the next entry's, or at the `#
 * Components` / `# Docs` section headings upstream writes between the two
 * groups. The residual ambiguity is a description that quotes a sibling's
 * entire prefix at the start of a line within its 90-character summary window;
 * flat text cannot distinguish that, and nothing narrower reintroduces it.
 *
 * A story sub-line is the same bullet indented two spaces, which the leading
 * `- ` excludes.
 */
function selectionEntry(list: string, id: string, entries: EntryPrefix[]): string | undefined {
  const opens = (line: string, entry: EntryPrefix) => line === entry.prefix || line.startsWith(`${entry.prefix}: `);

  const target = entries.find((entry) => entry.id === id);
  if (target === undefined) return undefined;

  const lines = list.split('\n');
  const start = lines.findIndex((line) => opens(line, target));
  if (start === -1) return undefined;

  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] ?? '';
    if (entries.some((entry) => opens(line, entry)) || line === '# Components' || line === '# Docs') break;
    end += 1;
  }
  const bullet = lines.slice(start, end);
  while (bullet.length > 1 && (bullet[bullet.length - 1] ?? '').trim() === '') bullet.pop();
  return bullet.join('\n');
}

/** Render the report. Separate from the calls so the assembly is readable in one place. */
function report(parts: {
  manifestPath: string;
  id: string;
  version: string;
  origin: string;
  selection: string | undefined;
  selectionNote: string | undefined;
  documentation: string;
  failed: boolean;
}): string {
  const fence = fenceFor(parts.selection ?? '', parts.documentation);
  const fenced = (body: string) => [fence, body, fence];

  return [
    `${parts.manifestPath} (${parts.id})`,
    // A blank line between them, so the provenance line stays its own paragraph
    // wherever a single newline collapses.
    '',
    `@storybook/mcp ${parts.version} (${parts.origin})`,
    '',
    '## list-all-documentation',
    '',
    // Above the fence, never inside it. Everything a reader finds fenced under
    // one of these headings is text the server returned, and this note is ours.
    ...(parts.selectionNote ? [parts.selectionNote, ''] : []),
    ...(parts.selection === undefined ? [] : [...fenced(parts.selection), '']),
    ...(parts.failed ? ['The get-documentation call failed. What it returned is below.', ''] : []),
    DOCUMENTATION_HEADING,
    '',
    ...fenced(parts.documentation),
    '',
    AGENT_VIEW_DISCLAIMER,
    '',
  ].join('\n');
}

/**
 * Render one entry instead of linting the manifest.
 *
 * The exit code does not depend on findings: this inspects rather than lints. It
 * is 2 when the text could not be shown at all, which the server reports the
 * same way for an id it does not hold and for a ref that failed.
 */
export async function showAgentView(options: AgentViewOptions): Promise<RunResult> {
  const { id } = options;

  // Whether the file is a manifest this build can read is upstream of what a
  // server would serve from it, so it is answered here with the same message
  // the lint path gives rather than left to the server's schema error.
  let raw;
  try {
    raw = readManifest(options.manifestPath);
    assertManifestShape(raw, options.manifestPath);
  } catch (err) {
    if (err instanceof ManifestError) return { code: 2, stdout: '', stderr: err.message };
    throw err;
  }

  let loaded;
  try {
    loaded = await loadMcp(options.manifestPath);
  } catch (err) {
    if (err instanceof McpLoadError) return { code: 2, stdout: '', stderr: err.message };
    throw err;
  }
  const { mcp, version, origin } = loaded;

  let docsRefused: string | undefined;
  let docsEntries: EntryPrefix[] = [];
  const source = diskSource(mcp, raw, options.manifestPath, {
    refused: (reason) => {
      docsRefused = reason;
    },
    entries: (found) => {
      docsEntries = found;
    },
  });
  const documentation = await getDocumentation(mcp, source, id);
  const list = await listAllDocumentation(mcp, source);

  const selection = list.isError
    ? undefined
    : selectionEntry(list.text, id, [...componentPrefixes(raw), ...docsEntries]);

  const stdout = report({
    manifestPath: options.manifestPath,
    id,
    version,
    origin: describeOrigin(origin),
    selection,
    selectionNote: selection === undefined ? absenceOf(id, list, docsRefused) : undefined,
    documentation: documentation.text,
    failed: documentation.isError,
  });

  if (!documentation.isError) return { code: 0, stdout, stderr: '' };
  return {
    code: 2,
    stdout,
    stderr: `Could not show what the MCP serves for "${id}": the get-documentation call failed.`,
  };
}

/**
 * What to print where the entry's line would be.
 *
 * An entry missing from the selection list is a finding in itself: it is the
 * only surface a component is chosen from, so an agent that cannot see it there
 * never asks for its documentation.
 */
function absenceOf(id: string, list: { isError: boolean }, docsRefused: string | undefined): string {
  if (list.isError) return 'list-all-documentation failed, so this entry has no line to show.';
  const offered = `No line for "${id}". It is not offered by list-all-documentation, which is the only surface a component is selected from.`;
  // A docs entry can be missing from the list because this run declined to read
  // the docs manifest, which upstream drops silently. Saying so keeps the reader
  // from reading a refusal as an absence.
  return docsRefused === undefined ? offered : `${offered}\nThe docs manifest was not read: ${docsRefused}`;
}
