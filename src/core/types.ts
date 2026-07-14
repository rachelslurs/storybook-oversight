/**
 * The normalization contract (see CLAUDE.md — keep in sync). Everything the
 * panel renders derives from these types; nothing here may import from
 * `storybook/*` or `@storybook/*`.
 */
export type NormalizedComponent = {
  id: string; // manifest key, e.g. "forms-checkbox"
  name: string;
  extractor: 'react-docgen' | 'react-docgen-typescript'; // meta.docgen
  description: string | null; // entry.description ?? payload.description
  sourceFile: string | null; // repo-relative; from payload.filePath ?? payload.definedInFile
  storiesFile: string; // entry.path (always the .stories file)
  props: Record<string, { description: string | null; required: boolean }>;
};

/**
 * Loose input types for the raw manifest. The schema is unstable (`v: 0`) —
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
  stories?: RawStory[];
  error?: unknown;
};

export type RawManifest = {
  v?: number;
  meta?: { docgen?: string };
  components?: Record<string, RawEntry>;
};

/** An entry whose docgen extraction failed (no payload in the manifest). */
export type ExtractionFailure = {
  id: string;
  name: string;
  storiesFile: string; // entry.path — lets the panel match the current story
  error: string | null;
};

/** A single story whose snippet/docgen extraction failed (`stories[].error`). */
export type StoryFailure = {
  componentId: string;
  storyId: string;
  storyName: string;
  error: string | null;
};

export type NormalizeResult = {
  /** Raw `meta.docgen` value (kept verbatim so extractor drift is detectable). */
  extractor: string;
  components: NormalizedComponent[];
  failures: ExtractionFailure[];
  storyFailures: StoryFailure[];
  /** Side-band JSDoc tags per component id; values normalized to strings. */
  tags: Record<string, Record<string, string>>;
};

export type DiagnosticRule =
  | 'docgen-missing'
  | 'story-extraction-error'
  | 'extractor-drift'
  | 'component-description-missing'
  | 'prop-descriptions-missing'
  | 'required-prop-undocumented'
  | 'docs-link-dangling'
  | 'unknown-ignore-rule'
  | 'deprecated-tag';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

/** Per-rule override: remap the severity or disable the rule entirely. */
export type RuleSetting = DiagnosticSeverity | 'off';

export type Diagnostic = {
  rule: DiagnosticRule;
  severity: DiagnosticSeverity;
  /** null for manifest-level rules (e.g. extractor-drift). */
  componentId: string | null;
  message: string;
  props?: string[];
  /** For `docs-link-dangling`: the `?path=` target ids that resolve to nothing,
   *  so the renderer can strike the offending links through inline. */
  targets?: string[];
};
