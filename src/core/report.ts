import { lint } from './lint';
import type { LintOptions } from './lint';
import { normalizeManifest } from './normalize';
import type {
  Diagnostic,
  ExtractionFailure,
  NormalizeResult,
  NormalizedComponent,
  RawManifest,
  StoryFailure,
} from './types';

/** The manifest-wide analysis — computed once per page load, shared by all
 *  components' reports. */
export type ManifestAnalysis = {
  result: NormalizeResult;
  diagnostics: Diagnostic[];
};

/** Everything the panel/block needs to render one component's coverage. */
export type ComponentReport = {
  /** false → the manifest has no entry for this id (docs-only page, etc.). */
  found: boolean;
  component?: NormalizedComponent;
  failure?: ExtractionFailure;
  storyFailures: StoryFailure[];
  /** Diagnostics scoped to this component. */
  diagnostics: Diagnostic[];
  /** Manifest-level diagnostics (`componentId: null`, e.g. extractor-drift) —
   *  the same list on every component's report, rendered in their own section
   *  and deliberately kept out of the per-component count. */
  manifestDiagnostics: Diagnostic[];
};

export function analyzeManifest(manifest: RawManifest, options?: LintOptions): ManifestAnalysis {
  const result = normalizeManifest(manifest);
  const diagnostics = lint(result, options);
  return { result, diagnostics };
}

export function resolveComponent(analysis: ManifestAnalysis, componentId: string): ComponentReport {
  const component = analysis.result.components.find((c) => c.id === componentId);
  const failure = analysis.result.failures.find((f) => f.id === componentId);
  return {
    found: component !== undefined || failure !== undefined,
    component,
    failure,
    storyFailures: analysis.result.storyFailures.filter((f) => f.componentId === componentId),
    diagnostics: analysis.diagnostics.filter((d) => d.componentId === componentId),
    manifestDiagnostics: analysis.diagnostics.filter((d) => d.componentId === null),
  };
}

/** Convenience: analyze + resolve in one call (the block's data path). */
export function buildReport(manifest: RawManifest, componentId: string, options?: LintOptions): ComponentReport {
  return resolveComponent(analyzeManifest(manifest, options), componentId);
}
