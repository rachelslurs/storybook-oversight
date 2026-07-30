import { detectManifestFormat } from './format';
import { firstNonEmptyLine } from './text';
import type {
  ExtractionFailure,
  NormalizeResult,
  NormalizedComponent,
  RawEntry,
  RawManifest,
  RawPayload,
  ShapeIssue,
  StoryFailure,
} from './types';

/** Empty strings count as "not documented". */
function text(value: string | undefined | null): string | null {
  return value ? value : null;
}

function payloadOf(entry: RawEntry): RawPayload | undefined {
  return entry.reactDocgenTypescript ?? entry.reactDocgen ?? entry.reactComponentMeta;
}

function sourcePathOf(payload: RawPayload): string | undefined {
  return payload.filePath ?? payload.definedInFile;
}

function stringifyError(error: unknown): string | null {
  if (error == null) return null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const { message, name } = error as { message?: unknown; name?: unknown };
    if (typeof message === 'string' && message) return message;
    if (typeof name === 'string' && name) return name;
  }
  return String(error);
}

/** The error's `name` field, kept apart from the message text: for some
 *  extractors it is the diagnosis while the message opens with a file path. */
function errorNameOf(error: unknown): string | null {
  if (error !== null && typeof error === 'object') {
    const { name } = error as { name?: unknown };
    if (typeof name === 'string' && name) return name;
  }
  return null;
}

/** Tag values are newline-joined strings or arrays depending on the extractor. */
function stringifyTag(value: unknown): string {
  // A value-less JSDoc tag (bare `@oversightIgnore` / `@deprecated`) arrives as
  // `true`, `[true]`, or `""` depending on the extractor — normalize the boolean
  // forms to "" so a bare tag reads as "no value" rather than the token "true".
  if (value === true) return '';
  if (Array.isArray(value)) {
    return value.map((v) => (v === true ? '' : String(v))).join('\n');
  }
  return String(value);
}

function tagsFrom(source: Record<string, unknown> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [tag, value] of Object.entries(source ?? {})) {
    result[tag] = stringifyTag(value);
  }
  return result;
}

/**
 * Detect the absolute repo-root prefix live manifests carry in `filePath`.
 *
 * Per-prop `declarations[].fileName` values are repo-relative
 * ("storybook/src/X/X.tsx"), so any declaration that is a path-boundary
 * suffix of its entry's source path reveals the prefix. Scans all props and
 * all declarations — some props carry extra declarations pointing at
 * node_modules type files, which the suffix guard skips. Returns "" when the
 * manifest is already repo-relative (the committed fixture), null when
 * undetectable.
 */
export function detectRepoRoot(raw: RawManifest): string | null {
  for (const entry of Object.values(raw.components ?? {})) {
    const payload = payloadOf(entry);
    if (!payload) continue;
    const sourcePath = sourcePathOf(payload);
    if (!sourcePath) continue;
    for (const prop of Object.values(payload.props ?? {})) {
      for (const declaration of prop.declarations ?? []) {
        const fileName = declaration.fileName;
        if (!fileName) continue;
        if (sourcePath === fileName) return '';
        if (sourcePath.endsWith(`/${fileName}`)) {
          return sourcePath.slice(0, sourcePath.length - fileName.length);
        }
      }
    }
  }
  return null;
}

/**
 * The manifest's recorded extractor: `meta.docgen` when non-empty, else the
 * payload key every extracted entry agrees on, else null. Flag-built 10.2
 * manifests ship `meta: null` while each entry still carries an
 * extractor-named payload key, so a missing `meta` alone does not mean
 * "unrecorded". Substituting a default here made `extractor-drift` read the
 * absence as a match (#32).
 */
function recordedExtractor(raw: RawManifest): string | null {
  const recorded = raw.meta?.docgen;
  if (typeof recorded === 'string' && recorded.trim() !== '') return recorded;
  const flavors = new Set<string>();
  for (const entry of Object.values(raw.components ?? {})) {
    if (entry.reactDocgenTypescript) flavors.add('react-docgen-typescript');
    else if (entry.reactDocgen) flavors.add('react-docgen');
    else if (entry.reactComponentMeta) flavors.add('react-component-meta');
  }
  return flavors.size === 1 ? [...flavors][0] : null;
}

/**
 * Whether the prop payload still carries the keys `prop-descriptions-missing`
 * and `required-prop-undocumented` read.
 *
 * The test is the field's type, never its value, because an undocumented prop
 * and a renamed field are otherwise identical: react-component-meta emits
 * `description: ""` for a prop nobody documented, and `typeof "" === 'string'`
 * keeps that case passing. Presence alone is not enough. A `description`
 * retyped to an object would still be present, `text()` would read it as
 * truthy, and every prop would report as documented with nothing said.
 *
 * The question is asked of the whole manifest rather than each prop: one prop
 * anywhere carrying the field proves it still exists under that name, and an
 * individual prop missing it then reads as undocumented. The `props` container
 * gets the same treatment one level up: renaming it would otherwise look like a
 * library that takes no props, and pass.
 *
 * Unknown extra keys never fail this. Additive changes are the common
 * non-breaking case, and refusing them would manufacture the under-report the
 * check exists to prevent.
 */
function inspectPropShape(raw: RawManifest): { propShape: 'known' | 'unrecognized'; issue?: ShapeIssue } {
  let total = 0;
  let sawPayload = false;
  let sawPropsContainer = false;
  let sawDescription = false;
  let sawRequired = false;
  let sample: string[] = [];

  for (const entry of Object.values(raw.components ?? {})) {
    const payload = payloadOf(entry);
    if (!payload) continue;
    sawPayload = true;
    if (payload.props !== null && typeof payload.props === 'object') sawPropsContainer = true;
    for (const prop of Object.values(payload.props ?? {})) {
      if (prop === null || typeof prop !== 'object') continue;
      total += 1;
      if (total === 1) sample = Object.keys(prop);
      if (typeof prop.description === 'string') sawDescription = true;
      if (typeof prop.required === 'boolean') sawRequired = true;
      if (sawDescription && sawRequired) return { propShape: 'known' };
    }
  }

  const unrecognized = (got: string): { propShape: 'unrecognized'; issue: ShapeIssue } => ({
    propShape: 'unrecognized',
    issue: {
      componentId: null,
      expected: 'a prop payload carrying "description" as a string and "required" as a boolean',
      got: `${got}. prop-descriptions-missing and required-prop-undocumented did not run`,
    },
  });

  // An extracted payload always carries a `props` object, empty when the
  // component takes none. Every payload lacking one means the container moved.
  if (sawPayload && !sawPropsContainer) return unrecognized('no payload carries a "props" object');

  // A library that genuinely takes no props leaves nothing to misread, and the
  // two rules would stay silent either way.
  if (total === 0) return { propShape: 'known' };

  const missing = [!sawDescription && 'a string "description"', !sawRequired && 'a boolean "required"']
    .filter(Boolean)
    .join(' and ');
  return unrecognized(
    `${total} prop${total === 1 ? '' : 's'}, none with ${missing} (first prop's keys: ${sample.join(', ') || 'none'})`,
  );
}

export function normalizeManifest(raw: RawManifest): NormalizeResult {
  const rawExtractor = recordedExtractor(raw);
  const repoRoot = detectRepoRoot(raw);
  const format = detectManifestFormat(raw).kind === 'ref' ? 'ref' : 'inline';
  // Scoped to the ref format: react-docgen declares `description` optional on
  // its own prop descriptor, so an inline manifest may legitimately omit it.
  const { propShape, issue } = format === 'ref' ? inspectPropShape(raw) : { propShape: 'known' as const };

  const components: NormalizedComponent[] = [];
  const failures: ExtractionFailure[] = [];
  const storyFailures: StoryFailure[] = [];
  const shapeIssues: ShapeIssue[] = issue ? [issue] : [];
  const tags: NormalizeResult['tags'] = {};

  for (const [id, entry] of Object.entries(raw.components ?? {})) {
    // The name is interpolated into every finding message, and a newline in it
    // would split the CLI step-summary table row; an empty name falls back to
    // the manifest key like a missing one.
    const name = firstNonEmptyLine(entry.name) ?? id;
    const storiesFile = entry.path ?? '';
    const payload = payloadOf(entry);

    // Scan story errors and entry-level jsDocTags before the payload check:
    // payload-less entries carry both (the story-meta JSDoc is the only place
    // an @oversightIgnore can live when component extraction failed).
    for (const story of entry.stories ?? []) {
      if (story.error != null) {
        storyFailures.push({
          componentId: id,
          storyId: story.id ?? '',
          storyName: story.name ?? story.id ?? '',
          error: stringifyError(story.error),
          errorName: errorNameOf(story.error),
        });
      }
    }
    const entryTags = tagsFrom(entry.jsDocTags);

    if (!payload) {
      if (Object.keys(entryTags).length > 0) tags[id] = entryTags;
      failures.push({ id, name, storiesFile, error: stringifyError(entry.error), errorName: errorNameOf(entry.error) });
      continue;
    }

    const props: NormalizedComponent['props'] = {};
    for (const [propName, prop] of Object.entries(payload.props ?? {})) {
      // A null or non-object prop used to throw out of the whole normalizer,
      // which cost every diagnostic in the manifest for one malformed entry.
      // Skipping it also keeps a string-valued `props` map from inventing props
      // named "0" and "1" and reporting them as undocumented.
      if (prop === null || typeof prop !== 'object') continue;
      props[propName] = {
        description: text(prop.description),
        required: prop.required === true,
      };
    }

    const sourcePath = sourcePathOf(payload);
    const sourceFile = sourcePath
      ? repoRoot && sourcePath.startsWith(repoRoot)
        ? sourcePath.slice(repoRoot.length)
        : sourcePath
      : null;

    components.push({
      id,
      name,
      description: text(entry.description) ?? text(payload.description),
      sourceFile,
      storiesFile,
      props,
    });

    // A resolved entry can still carry an error: a v:1 component whose docgen
    // ref loaded while its stories ref did not keeps its payload, so the
    // failure would otherwise be recorded and reported nowhere. Gated on the
    // ref format because an inline entry's error has no refs to blame, and
    // clamped to one line because the message reaches a step-summary table row.
    const entryError = format === 'ref' ? firstNonEmptyLine(stringifyError(entry.error)) : null;
    if (entryError) {
      shapeIssues.push({
        componentId: id,
        expected: 'every $ref on this entry to resolve',
        got: entryError.replace(/\.$/, ''),
      });
    }

    // Entry-level tags (story-meta JSDoc) win collisions with payload tags.
    const componentTags = { ...tagsFrom(payload.tags), ...entryTags };
    if (Object.keys(componentTags).length > 0) {
      tags[id] = componentTags;
    }
  }

  return { extractor: rawExtractor, format, propShape, components, failures, storyFailures, shapeIssues, tags };
}
