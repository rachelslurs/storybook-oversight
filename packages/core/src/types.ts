/**
 * The normalization contract. Everything the panel renders derives from these
 * types; nothing here may import from `storybook/*` or `@storybook/*`.
 */
export type NormalizedComponent = {
  id: string; // manifest key, e.g. "forms-checkbox"
  name: string;
  description: string | null; // entry.description ?? payload.description
  sourceFile: string | null; // repo-relative; from payload.filePath ?? payload.definedInFile
  sourcePath: string | null; // the same path as the manifest recorded it, before any prefix is dropped
  storiesFile: string; // entry.path (always the .stories file)
  props: Record<string, { description: string | null; required: boolean }>;
};

/**
 * Loose input types for the raw manifest. The schema is unstable (`v: 0`), so
 * every field is optional and `error` is deliberately `unknown` (observed as
 * an object `{name, message}` in the wild, but nothing guarantees that).
 */
export type RawDeclaration = {
  fileName?: string;
  name?: string;
};

export type RawProp = {
  description?: string;
  required?: boolean;
  declarations?: RawDeclaration[];
};

export type RawStory = {
  id?: string;
  name?: string;
  error?: unknown;
};

export type RawPayload = {
  description?: string;
  filePath?: string; // react-docgen-typescript (absolute in live manifests)
  definedInFile?: string; // react-docgen
  tags?: Record<string, unknown>;
  props?: Record<string, RawProp>;
};

export type RawEntry = {
  id?: string;
  name?: string;
  path?: string;
  description?: string;
  jsDocTags?: Record<string, unknown>;
  reactDocgenTypescript?: RawPayload;
  reactDocgen?: RawPayload;
  // Emitted when `features.experimentalReactComponentMeta` is on, and inside the
  // per-component payload under `features.experimentalDocgenServer`. Same shape,
  // except tags arrive as `jsDocTags` (arrays) rather than `tags` (strings);
  // the entry-level `jsDocTags` carries the same values, so tags read from there.
  reactComponentMeta?: RawPayload;
  stories?: RawStory[];
  error?: unknown;
  /** Ref resolution failures, recorded by `resolveManifestRefs`. Kept apart
   *  from `error` so neither overwrites the other: `error` is the manifest's
   *  own diagnosis and may carry a `name` the message depends on. */
  refErrors?: string[];
};

export type RawManifest = {
  v?: number;
  meta?: { docgen?: string } | null; // flag-built 10.2 manifests ship `meta: null`
  components?: Record<string, RawEntry>;
};

/**
 * v:1 raw types (`features.experimentalDocgenServer`). The index defers each
 * entry's payload to per-component leaf files via
 * `../services/core/{docgen,story-docs}/<id>.json#/components/<id>`;
 * `resolveManifestRefs` folds the leaves back into the inline `RawEntry`
 * shape. The same instability caveat applies: every field is optional.
 */
export type RawRef = { $ref?: string };

export type RawIndexEntry = {
  id?: string;
  name?: string;
  description?: string;
  docgen?: RawRef;
  stories?: RawRef;
};

/** The docgen leaf's per-component node: the fields an inline entry carries
 *  directly, minus stories. */
export type RawDocgenNode = {
  id?: string;
  name?: string;
  path?: string;
  description?: string;
  jsDocTags?: Record<string, unknown>;
  // Whichever extractor produced the payload. Declaring only one key let a leaf
  // from either other extractor resolve into an entry with no payload.
  reactComponentMeta?: RawPayload;
  reactDocgenTypescript?: RawPayload;
  reactDocgen?: RawPayload;
};

/** The story-docs leaf's per-component node. Stories arrive keyed by story id;
 *  `RawEntry.stories` is an array, so resolution converts with Object.values. */
export type RawStoryDocsNode = {
  id?: string;
  name?: string;
  path?: string;
  import?: string;
  stories?: Record<string, RawStory>;
};

/** A leaf file's envelope: the `#/components/<id>` pointer lands in `components`. */
export type RawLeafFile<Node = RawDocgenNode | RawStoryDocsNode> = {
  components?: Record<string, Node>;
};

/** An entry whose docgen extraction failed (no payload in the manifest). */
export type ExtractionFailure = {
  id: string;
  name: string;
  storiesFile: string; // entry.path, which lets the panel match the current story
  error: string | null;
  /** The manifest error's `name` field, when the entry carried one. */
  errorName: string | null;
};

/** A single story whose snippet/docgen extraction failed (`stories[].error`). */
export type StoryFailure = {
  componentId: string;
  storyId: string;
  storyName: string;
  error: string | null;
  /** The manifest error's `name` field, when the story carried one. */
  errorName: string | null;
};

/**
 * A part of the manifest that did not arrive in the shape this version reads.
 * `componentId` is null when the finding is manifest-wide.
 */
export type ShapeIssue = {
  componentId: string | null;
  /** What was looked for. */
  expected: string;
  /** What arrived instead. */
  got: string;
};

export type NormalizeResult = {
  /** The manifest's recorded extractor: `meta.docgen` verbatim when non-empty,
   *  else the payload key every extracted entry shares, else null. */
  extractor: string | null;
  /** Which manifest shape this came from. `ref` means the payloads were
   *  resolved from per-component files rather than read inline. */
  format: 'inline' | 'ref';
  /** Whether the prop payload still carries the keys the prop rules read.
   *  `unrecognized` holds those two rules rather than reporting every prop as
   *  undocumented off a renamed field. */
  propShape: 'known' | 'unrecognized';
  components: NormalizedComponent[];
  failures: ExtractionFailure[];
  storyFailures: StoryFailure[];
  shapeIssues: ShapeIssue[];
  /** Side-band JSDoc tags per component id; values normalized to strings. */
  tags: Record<string, Record<string, string>>;
};

export type RuleName =
  | 'docgen-missing'
  | 'story-extraction-error'
  | 'extractor-drift'
  | 'component-description-missing'
  | 'prop-descriptions-missing'
  | 'props-unrecorded'
  | 'required-prop-undocumented'
  | 'docs-link-dangling'
  | 'unknown-ignore-rule'
  | 'deprecated-tag'
  | 'prop-shape-unrecognized'
  | 'ref-unresolved';

export type Severity = 'error' | 'warning' | 'info';

/** Per-rule override: remap the severity or disable the rule entirely. */
export type RuleSetting = Severity | 'off';

export type Finding = {
  rule: RuleName;
  severity: Severity;
  /** null for manifest-level rules (e.g. extractor-drift). */
  componentId: string | null;
  message: string;
  props?: string[];
  /** For `docs-link-dangling`: the `?path=` target ids that resolve to nothing,
   *  so the renderer can strike the offending links through inline. */
  targets?: string[];
  /** The full multi-line text behind a clamped message: the extraction error
   *  for `docgen-missing` / `story-extraction-error`, the complete note for
   *  `deprecated-tag`. Machine-readable output keeps the whole text here. */
  error?: string;
  /** For `docgen-missing` / `story-extraction-error`: the manifest error's
   *  `name`, when the entry carried one. Renderers group mass failures by it. */
  errorName?: string;
  /** What to do about the finding, in one imperative line. Absent on a rule
   *  that reports a fact rather than a defect (`deprecated-tag`). */
  hint?: string;
};
