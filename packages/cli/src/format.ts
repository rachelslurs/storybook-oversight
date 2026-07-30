import { summarizeError } from 'oversight-core';
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
  // Painting an empty string would emit the escape codes with nothing inside.
  return on && text ? `${code}${text}${ANSI.reset}` : text;
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

/** Entry floor for the rule-level trigger and for a signature's own row.
 *  Below 10 entries, per-entry lines stay readable and carry more detail
 *  than a summary row would. */
const COLLAPSE_MIN_ENTRIES = 10;

/** One row of collapsed output, shared by the stylish and step-summary
 *  renderers so both stay at the same size on the same input. */
type CollapsedRow = {
  severity: DiagnosticSeverity;
  rule: DiagnosticRule;
  /** Findings in the row. */
  count: number;
  /** Distinct entries those findings sit on. */
  entries: number;
  /** The row's error signature, or the pooled-leftovers label. */
  message: string;
};

/** The clamped one-line error summary doubles as the grouping signature: it is
 *  the only single-line, diagnosis-led text (raw `errorName` can be multi-line
 *  or whitespace), and `summarizeError` skips the message's `File: <path>`
 *  location line, so entries that share a diagnosis but not a path share a
 *  signature (#44). */
function signatureOf(d: Diagnostic): string {
  return summarizeError(d.errorName, d.error) ?? 'unknown error';
}

function rowOf(group: Diagnostic[], message: string): CollapsedRow {
  return {
    severity: group[0].severity,
    rule: group[0].rule,
    count: group.length,
    entries: affectedEntries(group),
    message,
  };
}

/** "N of M entries", with the finding count prefixed when stories multiply it. */
function reachOf(row: CollapsedRow, entryCount: number): string {
  const share = `${row.entries} of ${entryCount} ${entriesWord(entryCount)}`;
  return row.count === row.entries ? share : `${row.count} findings across ${share}`;
}

/**
 * A repo-wide extraction failure renders as hundreds of near-identical
 * per-entry findings, and the fact the reader needs (most of the manifest
 * failed the same way) appears nowhere. A rule collapses when its findings
 * touch at least 10 distinct entries and at least half the manifest's
 * entries; the thresholds count entries, so a pile of failing stories on one
 * entry never collapses. A collapsed rule renders one row per signature, with
 * signatures under the entry floor pooled into one leftovers row, so
 * per-entry variation in the signature text cannot re-flood the output.
 * Rendering only: the tally still counts every finding, and `--format json`
 * keeps each one.
 */
function collapseMassFailures(
  diagnostics: Diagnostic[],
  entryCount: number,
): { rows: CollapsedRow[]; visible: Diagnostic[] } {
  const byRule = new Map<DiagnosticRule, Diagnostic[]>();
  for (const d of diagnostics) {
    if (!COLLAPSIBLE_RULES.has(d.rule)) continue;
    const findings = byRule.get(d.rule) ?? [];
    byRule.set(d.rule, findings);
    findings.push(d);
  }

  const rows: CollapsedRow[] = [];
  const hidden = new Set<Diagnostic>();
  for (const findings of byRule.values()) {
    const touched = affectedEntries(findings);
    if (touched < COLLAPSE_MIN_ENTRIES || touched * 2 < entryCount) continue;

    const bySignature = new Map<string, Diagnostic[]>();
    for (const d of findings) {
      const signature = signatureOf(d);
      const group = bySignature.get(signature) ?? [];
      bySignature.set(signature, group);
      group.push(d);
    }

    const leftovers: Diagnostic[] = [];
    let leftoverSignatures = 0;
    let ownRows = 0;
    const sorted = [...bySignature.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [signature, group] of sorted) {
      if (affectedEntries(group) >= COLLAPSE_MIN_ENTRIES) {
        rows.push(rowOf(group, signature));
        ownRows += 1;
      } else {
        leftovers.push(...group);
        leftoverSignatures += 1;
      }
    }
    if (leftoverSignatures === 1) {
      // A lone leftover signature reads better as itself than as a pool of one.
      rows.push(rowOf(leftovers, signatureOf(leftovers[0])));
    } else if (leftoverSignatures > 1) {
      rows.push(rowOf(leftovers, `${leftoverSignatures} ${ownRows > 0 ? 'other' : 'distinct'} errors`));
    }
    for (const d of findings) hidden.add(d);
  }
  return { rows, visible: diagnostics.filter((d) => !hidden.has(d)) };
}

/** ESLint `stylish`-style output, grouped by manifest entry instead of by file. */
export function formatStylish(summary: LintSummary, options: { color: boolean; quiet: boolean }): string {
  const on = options.color;
  const shown = options.quiet ? summary.diagnostics.filter((d) => d.severity === 'error') : summary.diagnostics;
  const { rows, visible } = collapseMassFailures(shown, summary.entryCount);
  const groups = groupByComponent(visible);
  const lines: string[] = [];

  const docgen = summary.extractor === null ? '' : ` (docgen: ${summary.extractor})`;
  lines.push(paint(summary.manifestPath, ANSI.bold, on) + paint(docgen, ANSI.dim, on));
  lines.push('');

  if (rows.length > 0) {
    const width = Math.max(...rows.map((r) => r.severity.length));
    for (const r of rows) {
      const severity = paint(r.severity.padEnd(width), SEVERITY_COLOR[r.severity], on);
      const rule = paint(r.rule, ANSI.dim, on);
      lines.push(`  ${severity}  ${rule}  ${reachOf(r, summary.entryCount)}: ${r.message}`);
    }
    lines.push(paint('  Findings above are collapsed; re-run with --json for the per-entry list.', ANSI.dim, on));
    lines.push('');
  }

  const shared = sharedNames(summary);
  const render = (title: string, detail: string, diags: Diagnostic[]) => {
    lines.push(paint(title, ANSI.bold, on) + paint(detail, ANSI.dim, on));
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
    const { name, detail } = labelOf(summary, componentId, shared);
    render(name, detail, diags);
  }
  const manifestLevel = groups.get(null);
  if (manifestLevel) render('Manifest', '', manifestLevel);

  // The summary counts the full set, so `--quiet` never changes the tally.
  const { errors, warnings, infos, entryCount } = summary;
  const total = errors + warnings + infos;
  if (total === 0) {
    lines.push(paint(`✓ No problems found in ${entryCount} ${entriesWord(entryCount)}.`, ANSI.green, on));
  } else {
    const detail = `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info`;
    const tone = errors > 0 ? ANSI.red : ANSI.yellow;
    lines.push(paint(`✖ ${plural(total, 'problem')} (${detail})${entryShare(summary)}`, tone, on));
  }
  return lines.join('\n');
}

/** ", N of M entries affected", or "" when every finding is manifest-level:
 *  a share of zero entries beside a nonzero problem count reads as a
 *  contradiction. */
function entryShare(summary: LintSummary): string {
  const affected = affectedEntries(summary.diagnostics);
  if (affected === 0) return '';
  return `, ${affected} of ${summary.entryCount} ${entriesWord(summary.entryCount)} affected`;
}

/**
 * Entry ids whose display name another entry in the same manifest also uses,
 * mapped to the text that tells them apart. One entry exists per stories file,
 * so a component split across `Foo.stories.tsx` and `Foo.features.stories.tsx`
 * is two entries under one name, and a heading of just the name leaves the
 * reader no way to know which file a finding came from. The stories file is the
 * disambiguator: it is what the reader opens next. The entry id stands in when
 * any of the colliding entries has no recorded file, so a name's entries are
 * never labelled two different ways.
 */
function sharedNames(summary: LintSummary): Map<string, string> {
  const idsByName = new Map<string, string[]>();
  for (const [id, name] of summary.names) {
    const ids = idsByName.get(name) ?? [];
    idsByName.set(name, ids);
    ids.push(id);
  }

  const labels = new Map<string, string>();
  for (const ids of idsByName.values()) {
    if (ids.length < 2) continue;
    const files = ids.map((id) => summary.files.get(id)?.replace(/^\.\//, '') ?? '');
    const byFile = files.every((file) => file !== '') && new Set(files).size === files.length;
    ids.forEach((id, i) => labels.set(id, byFile ? files[i] : id));
  }
  return labels;
}

/** An entry's display name, plus the parenthesized disambiguator when another
 *  entry shares that name (empty otherwise). */
function labelOf(
  summary: LintSummary,
  componentId: string,
  shared: Map<string, string>,
): { name: string; detail: string } {
  const label = shared.get(componentId);
  return { name: summary.names.get(componentId) ?? componentId, detail: label ? ` (${label})` : '' };
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
        manifest: { path: summary.manifestPath, docgen: summary.extractor, entries: summary.entryCount },
      },
      components,
    },
    null,
    2,
  );
}

/** GitHub Actions job-summary markdown. Component-keyed, so no line anchors.
 *  Mass failures collapse into the same rows as the stylish output: GitHub
 *  truncates oversized step summaries, so a manifest-wide failure must not
 *  write one table row per entry. */
export function formatStepSummary(summary: LintSummary): string {
  const { errors, warnings, infos, diagnostics, entryCount } = summary;
  const docgen = summary.extractor === null ? '' : ` (docgen: ${summary.extractor})`;
  const lines = [
    '### Oversight manifest lint',
    '',
    `\`${summary.manifestPath}\`${docgen}: ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info${entryShare(summary)}.`,
    '',
  ];
  if (diagnostics.length === 0) {
    lines.push('No problems found.');
    return lines.join('\n');
  }
  const { rows, visible } = collapseMassFailures(diagnostics, entryCount);
  if (rows.length > 0) {
    lines.push('Mass failures are collapsed; re-run with `--json` for the per-entry list.', '');
  }
  lines.push('| Component | Severity | Rule | Message |', '| --- | --- | --- | --- |');
  for (const r of rows) {
    lines.push(`| ${reachOf(r, entryCount)} | ${r.severity} | \`${r.rule}\` | ${r.message.replace(/\|/g, '\\|')} |`);
  }
  const shared = sharedNames(summary);
  for (const d of visible) {
    const { name, detail } = d.componentId ? labelOf(summary, d.componentId, shared) : { name: 'Manifest', detail: '' };
    const component = name + detail;
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
