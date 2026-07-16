import type {
  ExtractionFailure,
  NormalizeResult,
  NormalizedComponent,
  RawEntry,
  RawManifest,
  RawPayload,
  StoryFailure,
} from './types';

/** Empty strings count as "not documented". */
function text(value: string | undefined | null): string | null {
  return value ? value : null;
}

function payloadOf(entry: RawEntry): RawPayload | undefined {
  return entry.reactDocgenTypescript ?? entry.reactDocgen;
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

export function normalizeManifest(raw: RawManifest): NormalizeResult {
  const rawExtractor = raw.meta?.docgen ?? 'react-docgen-typescript';
  const extractor: NormalizedComponent['extractor'] =
    rawExtractor === 'react-docgen' ? 'react-docgen' : 'react-docgen-typescript';
  const repoRoot = detectRepoRoot(raw);

  const components: NormalizedComponent[] = [];
  const failures: ExtractionFailure[] = [];
  const storyFailures: StoryFailure[] = [];
  const tags: NormalizeResult['tags'] = {};

  for (const [id, entry] of Object.entries(raw.components ?? {})) {
    const name = entry.name ?? id;
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
        });
      }
    }
    const entryTags = tagsFrom(entry.jsDocTags);

    if (!payload) {
      if (Object.keys(entryTags).length > 0) tags[id] = entryTags;
      failures.push({ id, name, storiesFile, error: stringifyError(entry.error) });
      continue;
    }

    const props: NormalizedComponent['props'] = {};
    for (const [propName, prop] of Object.entries(payload.props ?? {})) {
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
      extractor,
      description: text(entry.description) ?? text(payload.description),
      sourceFile,
      storiesFile,
      props,
    });

    // Entry-level tags (story-meta JSDoc) win collisions with payload tags.
    const componentTags = { ...tagsFrom(payload.tags), ...entryTags };
    if (Object.keys(componentTags).length > 0) {
      tags[id] = componentTags;
    }
  }

  return { extractor: rawExtractor, components, failures, storyFailures, tags };
}
