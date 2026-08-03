import type { Finding } from 'oversight-core';

/** The linted manifest reduced to what the formatters and the exit code need. */
export type LintSummary = {
  findings: Finding[];
  errors: number;
  warnings: number;
  infos: number;
  /** The manifest file the findings came from. */
  manifestPath: string;
  /** The manifest's recorded extractor (`meta.docgen`, or the payload key its
   *  entries share); null when the manifest records none. */
  extractor: string | null;
  /** Total manifest entries, extracted plus failed. One entry exists per
   *  stories file, so every count in the output is per entry, and one
   *  component can span several. */
  entryCount: number;
  /** componentId -> display name, for group headers and the summary table. */
  names: Map<string, string>;
  /** componentId -> stories file (repo-relative), the anchor for GitHub annotations. */
  files: Map<string, string>;
  /** Where the docs a finding is about actually live, when the manifest records
   *  it. An annotation anchored on the stories file lands on a file that does
   *  not contain the problem. `recorded` is the path as the manifest wrote it,
   *  which is absolute for the extractors that report one; `display` is the
   *  trimmed one a message reads. */
  sources: Map<string, { recorded: string; display: string }>;
};
