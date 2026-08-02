import { lint } from './lint';
import type { LintOptions } from './lint';
import { normalizeManifest } from './normalize';
import type {
  Finding,
  ExtractionFailure,
  NormalizeResult,
  NormalizedComponent,
  RawManifest,
  StoryFailure,
} from './types';

/** The manifest-wide analysis, computed once per page load and shared by all
 *  components' reports. */
export type ManifestAnalysis = {
  result: NormalizeResult;
  findings: Finding[];
};

/** Everything the panel/block needs to render one component's coverage. */
export type ComponentReport = {
  /** false → the manifest has no entry for this id (docs-only page, etc.). */
  found: boolean;
  component?: NormalizedComponent;
  failure?: ExtractionFailure;
  storyFailures: StoryFailure[];
  /** Findings scoped to this component. */
  findings: Finding[];
  /** Manifest-level findings (`componentId: null`, e.g. extractor-drift).
   *  The same list on every component's report, rendered in their own section
   *  and deliberately kept out of the per-component count. */
  manifestFindings: Finding[];
  /** `unrecognized` means the prop payload was not in a shape this build reads,
   *  so `props` is not trustworthy. Renderers must not present prop coverage
   *  from it: the lint rules do not run in that case, and a coverage figure
   *  drawn from the same fields would contradict the finding saying so. */
  propShape: 'known' | 'unrecognized';
};

export function analyzeManifest(manifest: RawManifest, options?: LintOptions): ManifestAnalysis {
  const result = normalizeManifest(manifest);
  const findings = lint(result, options);
  return { result, findings };
}

export function resolveComponent(analysis: ManifestAnalysis, componentId: string): ComponentReport {
  const component = analysis.result.components.find((c) => c.id === componentId);
  const failure = analysis.result.failures.find((f) => f.id === componentId);
  return {
    found: component !== undefined || failure !== undefined,
    component,
    failure,
    storyFailures: analysis.result.storyFailures.filter((f) => f.componentId === componentId),
    findings: analysis.findings.filter((d) => d.componentId === componentId),
    manifestFindings: analysis.findings.filter((d) => d.componentId === null),
    propShape: analysis.result.propShape,
  };
}

/** Convenience: analyze + resolve in one call (the block's data path). */
export function buildReport(manifest: RawManifest, componentId: string, options?: LintOptions): ComponentReport {
  return resolveComponent(analyzeManifest(manifest, options), componentId);
}
