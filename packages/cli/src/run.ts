import { analyzeManifest } from 'oversight-core';
import type { RunOptions } from './config';
import { formatJson, formatStepSummary, formatStylish } from './format';
import { ManifestError, readManifest } from './manifest';
import type { LintSummary } from './types';

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
  /** GitHub Actions job-summary markdown; the caller writes it when under Actions. */
  stepSummary?: string;
};

/** Read, analyze, and format a manifest. Pure over the filesystem: no process
 *  exit, no console, no env — the caller owns that so the exit-code matrix is
 *  testable. */
export function run(options: RunOptions): RunResult {
  let manifest;
  try {
    manifest = readManifest(options.manifestPath);
  } catch (err) {
    if (err instanceof ManifestError) return { code: 2, stdout: '', stderr: err.message };
    throw err;
  }

  let analysis;
  try {
    analysis = analyzeManifest(manifest, options.lint);
  } catch (err) {
    return {
      code: 2,
      stdout: '',
      stderr:
        `Could not analyze ${options.manifestPath}: ${(err as Error).message}\n` +
        `This is likely the experimentalDocgenServer ref-based (v:1) manifest, which is not supported yet.`,
    };
  }

  const names = new Map<string, string>();
  for (const component of analysis.result.components) names.set(component.id, component.name);
  for (const failure of analysis.result.failures) names.set(failure.id, failure.name);

  const { diagnostics } = analysis;
  const summary: LintSummary = {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
    names,
  };

  const stdout = options.json ? formatJson(summary) : formatStylish(summary, options);
  const stepSummary = formatStepSummary(summary, options.manifestPath);

  // Errors always fail; warnings fail only past the threshold; info never fails.
  const code = summary.errors > 0 || summary.warnings > options.maxWarnings ? 1 : 0;

  return { code, stdout, stderr: '', stepSummary };
}
