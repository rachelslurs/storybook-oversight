import type { Diagnostic } from 'oversight-core';

/** The linted manifest reduced to what the formatters and the exit code need. */
export type LintSummary = {
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  infos: number;
  /** componentId -> display name, for group headers and the summary table. */
  names: Map<string, string>;
};
