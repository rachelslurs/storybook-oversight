export { detectRepoRoot, normalizeManifest } from './normalize';
export { detectManifestFormat } from './format';
export type { ManifestFormat } from './format';
export { resolveManifestRefs } from './resolveRefs';
export type { RefLoader } from './resolveRefs';
export { lint, hintFor, ALL_RULES, VALID_SETTINGS } from './lint';
export type { LintOptions } from './lint';
export { describeManifestUnavailable } from './manifestStatus';
export { firstNonEmptyLine, summarizeError } from './text';
export { parsePathTargetId, pathLinkPattern } from './pathLinks';
export { analyzeManifest, buildReport, resolveComponent } from './report';
export type { ComponentReport, ManifestAnalysis } from './report';
export type {
  Diagnostic,
  DiagnosticRule,
  DiagnosticSeverity,
  ExtractionFailure,
  NormalizeResult,
  NormalizedComponent,
  RawDeclaration,
  RawEntry,
  RawManifest,
  RawPayload,
  RawProp,
  RawStory,
  RuleSetting,
  ShapeIssue,
  StoryFailure,
} from './types';
