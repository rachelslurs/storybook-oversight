import { firstNonEmptyLine, summarizeError } from 'oversight-core';
import type { Diagnostic, DiagnosticRule, DiagnosticSeverity } from 'oversight-core';
import type { LintSummary } from './types';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
} as const;

const SEVERITY_COLOR: Record<DiagnosticSeverity, string> = {
  error: ANSI.red,
  warning: ANSI.yellow,
  info: ANSI.blue,
};

function paint(text: string, code: string, on: boolean): string {
  return on ? `${code}${text}${ANSI.reset}` : text;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function entriesWord(n: number): string {
  return n === 1 ? 'entry' : 'entries';
}

/** Distinct manifest entries the diagnostics sit on (manifest-level ones excluded). */
function affectedEntries(diagnostics: Diagnostic[]): number {
  const ids = new Set<string>();
  for (const d of diagnostics) {
    if (d.componentId !== null) ids.add(d.componentId);
  }
  return ids.size;
}

function withProps(message: string, props: string[] | undefined): string {
  return props?.length ? `${message} (props: ${props.join(', ')})` : message;
}

/** Group diagnostics by component in first-seen order; manifest-level last. */
function groupByComponent(diagnostics: Diagnostic[]): Map<string | null, Diagnostic[]> {
  const groups = new Map<string | null, Diagnostic[]>();
  for (const d of diagnostics) {
    const existing = groups.get(d.componentId);
    if (existing) existing.push(d);
    else groups.set(d.componentId, [d]);
  }
  return groups;
}

/** The rules that fire once per entry or story off a manifest `error` payload,
 *  the only ones that carry an error signature to collapse on. */
const COLLAPSIBLE_RULES: ReadonlySet<DiagnosticRule> = new Set(['docgen-missing', 'story-extraction-error']);

/** Below this many findings, per-entry lines stay readable and carry more
 *  detail than a summary line would. */
const COLLAPSE_MIN_FINDINGS = 10;

type CollapsedGroup = {
  severity: DiagnosticSeverity;
  rule: DiagnosticRule;
  /** Findings in the group. */
  count: number;
  /** Distinct entries those findings sit on. */
  entries: number;
  /** The one-line error summary when every finding shares it, else the
   *  signature the group was keyed on. */
  display: string;
};

/** The signature mass failures group on: the manifest error's `name`, or the
 *  clamped error text when the error carried none. The message's first line
 *  cannot serve as the key: for docgen failures it is often a per-entry file
 *  path, which would split one failure mode into hundreds of groups. */
function signatureOf(d: Diagnostic): string {
  return d.errorName ?? firstNonEmptyLine(d.error) ?? 'unknown error';
}

/**
 * A repo-wide extraction failure renders as hundreds of near-identical
 * per-entry findings, and the fact the reader needs (most of the manifest
 * failed the same way) appears nowhere. When one rule's findings sharing an
 * error signature reach both 10 findings and half the manifest's entries, that
 * rule's findings leave the per-component groups and render as one line per
 * signature. Rendering only: the tally and every other format keep each
 * finding.
 */
function collapseMassFailures(
  diagnostics: Diagnostic[],
  entryCount: number,
): { groups: CollapsedGroup[]; hidden: Set<Diagnostic> } {
  const byRule = new Map<DiagnosticRule, Map<string, Diagnostic[]>>();
  for (const d of diagnostics) {
    if (!COLLAPSIBLE_RULES.has(d.rule)) continue;
    const signatures = byRule.get(d.rule) ?? new Map<string, Diagnostic[]>();
    byRule.set(d.rule, signatures);
    const group = signatures.get(signatureOf(d)) ?? [];
    signatures.set(signatureOf(d), group);
    group.push(d);
  }

  const groups: CollapsedGroup[] = [];
  const hidden = new Set<Diagnostic>();
  for (const signatures of byRule.values()) {
    const dominated = [...signatures.values()].some(
      (group) => group.length >= COLLAPSE_MIN_FINDINGS && entryCount > 0 && affectedEntries(group) * 2 >= entryCount,
    );
    if (!dominated) continue;
    // Rarer signatures of the same rule collapse along with the dominant one:
    // once the mass failure is summarized, per-entry groups for the leftovers
    // would scatter the remainder of the failure across the listing.
    const sorted = [...signatures.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [signature, group] of sorted) {
      const summaries = new Set(group.map((d) => summarizeError(d.errorName, d.error) ?? signature));
      groups.push({
        severity: group[0].severity,
        rule: group[0].rule,
        count: group.length,
        entries: affectedEntries(group),
        display: summaries.size === 1 ? [...summaries][0] : signature,
      });
      for (const d of group) hidden.add(d);
    }
  }
  return { groups, hidden };
}

/** ESLint `stylish`-style output, grouped by component instead of by file. */
export function formatStylish(summary: LintSummary, options: { color: boolean; quiet: boolean }): string {
  const on = options.color;
  const shown = options.quiet ? summary.diagnostics.filter((d) => d.severity === 'error') : summary.diagnostics;
  const { groups: collapsedGroups, hidden } = collapseMassFailures(shown, summary.entryCount);
  const groups = groupByComponent(shown.filter((d) => !hidden.has(d)));
  const lines: string[] = [];

  const docgen = summary.extractor === null ? '' : ` (docgen: ${summary.extractor})`;
  lines.push(paint(summary.manifestPath, ANSI.bold, on) + paint(docgen, ANSI.dim, on));
  lines.push('');

  if (collapsedGroups.length > 0) {
    const width = Math.max(...collapsedGroups.map((g) => g.severity.length));
    for (const g of collapsedGroups) {
      const severity = paint(g.severity.padEnd(width), SEVERITY_COLOR[g.severity], on);
      const rule = paint(g.rule, ANSI.dim, on);
      const share = `${g.entries} of ${summary.entryCount} ${entriesWord(summary.entryCount)}`;
      const reach = g.count === g.entries ? share : `${g.count} findings across ${share}`;
      lines.push(`  ${severity}  ${rule}  ${reach}: ${g.display}`);
    }
    lines.push(paint('  Findings above are collapsed; re-run with --json for the per-entry list.', ANSI.dim, on));
    lines.push('');
  }

  const render = (title: string, diags: Diagnostic[]) => {
    lines.push(paint(title, ANSI.bold, on));
    const width = Math.max(...diags.map((d) => d.severity.length));
    for (const d of diags) {
      const severity = paint(d.severity.padEnd(width), SEVERITY_COLOR[d.severity], on);
      const rule = paint(d.rule, ANSI.dim, on);
      lines.push(`  ${severity}  ${rule}  ${withProps(d.message, d.props)}`);
    }
    lines.push('');
  };

  for (const [componentId, diags] of groups) {
    if (componentId === null) continue;
    render(summary.names.get(componentId) ?? componentId, diags);
  }
  const manifestLevel = groups.get(null);
  if (manifestLevel) render('Manifest', manifestLevel);

  // The summary counts the full set, so `--quiet` never changes the tally.
  const { errors, warnings, infos, entryCount } = summary;
  const total = errors + warnings + infos;
  if (total === 0) {
    lines.push(paint(`✓ No problems found in ${entryCount} ${entriesWord(entryCount)}.`, ANSI.green, on));
  } else {
    const detail = `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info`;
    const share = `${affectedEntries(summary.diagnostics)} of ${entryCount} ${entriesWord(entryCount)} affected`;
    const tone = errors > 0 ? ANSI.red : ANSI.yellow;
    lines.push(paint(`✖ ${plural(total, 'problem')} (${detail}), ${share}`, tone, on));
  }
  return lines.join('\n');
}

/** Machine-readable output: top level keyed by component id. */
export function formatJson(summary: LintSummary): string {
  const components: Record<string, unknown[]> = {};
  for (const d of summary.diagnostics) {
    const key = d.componentId ?? '__manifest__';
    (components[key] ??= []).push({
      rule: d.rule,
      severity: d.severity,
      message: d.message,
      ...(d.props ? { props: d.props } : {}),
      ...(d.targets ? { targets: d.targets } : {}),
      ...(d.error ? { error: d.error } : {}),
      ...(d.errorName ? { errorName: d.errorName } : {}),
    });
  }
  return JSON.stringify(
    {
      summary: {
        errors: summary.errors,
        warnings: summary.warnings,
        infos: summary.infos,
        manifest: { path: summary.manifestPath, docgen: summary.extractor },
      },
      components,
    },
    null,
    2,
  );
}

/** GitHub Actions job-summary markdown. Component-keyed, so no line anchors. */
export function formatStepSummary(summary: LintSummary): string {
  const { errors, warnings, infos, diagnostics, entryCount } = summary;
  const docgen = summary.extractor === null ? '' : ` (docgen: ${summary.extractor})`;
  const share = `${affectedEntries(diagnostics)} of ${entryCount} ${entriesWord(entryCount)} affected`;
  const lines = [
    '### Oversight manifest lint',
    '',
    `\`${summary.manifestPath}\`${docgen}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info, ${share}.`,
    '',
  ];
  if (diagnostics.length === 0) {
    lines.push('No problems found.');
    return lines.join('\n');
  }
  lines.push('| Component | Severity | Rule | Message |', '| --- | --- | --- | --- |');
  for (const d of diagnostics) {
    const component = d.componentId ? (summary.names.get(d.componentId) ?? d.componentId) : 'Manifest';
    const message = withProps(d.message, d.props).replace(/\|/g, '\\|');
    lines.push(`| ${component} | ${d.severity} | \`${d.rule}\` | ${message} |`);
  }
  return lines.join('\n');
}

const GITHUB_COMMAND: Record<DiagnosticSeverity, 'error' | 'warning' | 'notice'> = {
  error: 'error',
  warning: 'warning',
  info: 'notice',
};

/** GitHub renders at most ~10 annotations of each type per step. */
const MAX_ANNOTATIONS_PER_TYPE = 10;

/** Escape a workflow-command message payload. */
function encodeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a workflow-command property value (also `:` and `,`). */
function encodeProperty(value: string): string {
  return encodeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/**
 * GitHub Actions workflow-command annotations, one per finding. GitHub lists them
 * on the run and the pull request's Checks tab; they also show inline on the
 * Files-changed tab when the anchored line is part of the diff. Anchored to the
 * stories file with no line (the manifest carries no line numbers, so GitHub
 * defaults to line 1). Manifest-level findings get a file-less, job-level
 * annotation. Emission is capped per type to match what GitHub renders, with a
 * trailing note if truncated.
 */
export function formatGithub(summary: LintSummary): string {
  const emitted: Record<string, number> = { error: 0, warning: 0, notice: 0 };
  const dropped: Record<string, number> = { error: 0, warning: 0, notice: 0 };
  const lines: string[] = [];

  for (const d of summary.diagnostics) {
    const command = GITHUB_COMMAND[d.severity];
    if (emitted[command] >= MAX_ANNOTATIONS_PER_TYPE) {
      dropped[command] += 1;
      continue;
    }
    emitted[command] += 1;

    const properties = [`title=${encodeProperty(`oversight/${d.rule}`)}`];
    const anchor = d.componentId ? summary.files.get(d.componentId)?.replace(/^\.\//, '') : undefined;
    if (anchor) properties.push(`file=${encodeProperty(anchor)}`);

    lines.push(`::${command} ${properties.join(',')}::${encodeData(withProps(d.message, d.props))}`);
  }

  for (const command of ['error', 'warning', 'notice'] as const) {
    if (dropped[command] > 0) {
      lines.push(
        `${dropped[command]} more ${command} annotation${dropped[command] === 1 ? '' : 's'} omitted ` +
          `(GitHub renders at most ${MAX_ANNOTATIONS_PER_TYPE} per type per step); re-run with --format text or --json to see all findings.`,
      );
    }
  }

  return lines.join('\n');
}
