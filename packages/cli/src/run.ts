import { analyzeManifest } from 'oversight-core';
import type { RunOptions } from './config';
import { formatGithub, formatJson, formatStepSummary, formatStylish } from './format';
import { ManifestError, hydrateManifest, readManifest } from './manifest';
import type { LintSummary } from './types';

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
  /** GitHub Actions job-summary markdown; the caller writes it when under Actions. */
  stepSummary?: string;
};

/** Read, analyze, and format a manifest. Pure over the filesystem: no process
 *  exit, no console, no env. The caller owns those so the exit-code matrix is
 *  testable. Async because a ref-based manifest resolves its payloads by
 *  reading further files. */
export async function run(options: RunOptions): Promise<RunResult> {
  let manifest;
  try {
    manifest = await hydrateManifest(readManifest(options.manifestPath), options.manifestPath);
  } catch (err) {
    if (err instanceof ManifestError) return { code: 2, stdout: '', stderr: err.message };
    throw err;
  }

  let analysis;
  try {
    analysis = analyzeManifest(manifest, options.lint);
  } catch (err) {
    // A version this build knows is refused by name in hydrateManifest, so
    // anything reaching here is a shape no message can describe. The raw error
    // is the only information available and it earns its place.
    return {
      code: 2,
      stdout: '',
      stderr:
        `Could not analyze ${options.manifestPath}: ${(err as Error).message}\n` +
        `The manifest could not be analyzed; it may be malformed or in an unsupported format.`,
    };
  }

  const names = new Map<string, string>();
  const files = new Map<string, string>();
  for (const component of analysis.result.components) {
    names.set(component.id, component.name);
    files.set(component.id, component.storiesFile);
  }
  for (const failure of analysis.result.failures) {
    names.set(failure.id, failure.name);
    files.set(failure.id, failure.storiesFile);
  }

  const { diagnostics } = analysis;
  const summary: LintSummary = {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
    manifestPath: options.manifestPath,
    extractor: analysis.result.extractor,
    entryCount: analysis.result.components.length + analysis.result.failures.length,
    names,
    files,
  };

  const stdout =
    options.format === 'json'
      ? formatJson(summary)
      : options.format === 'github'
        ? formatGithub(summary)
        : formatStylish(summary, options);
  const stepSummary = formatStepSummary(summary);

  // Errors always fail; warnings fail only past the threshold; info never fails.
  const code = summary.errors > 0 || summary.warnings > options.maxWarnings ? 1 : 0;

  return { code, stdout, stderr: '', stepSummary };
}
