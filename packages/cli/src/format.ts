import type { Diagnostic, DiagnosticSeverity } from 'oversight-core';
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

/** ESLint `stylish`-style output, grouped by component instead of by file. */
export function formatStylish(summary: LintSummary, options: { color: boolean; quiet: boolean }): string {
  const on = options.color;
  const shown = options.quiet ? summary.diagnostics.filter((d) => d.severity === 'error') : summary.diagnostics;
  const groups = groupByComponent(shown);
  const lines: string[] = [];

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
  const { errors, warnings, infos } = summary;
  const total = errors + warnings + infos;
  if (total === 0) {
    lines.push(paint('✓ No problems found.', ANSI.green, on));
  } else {
    const detail = `${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info`;
    const tone = errors > 0 ? ANSI.red : ANSI.yellow;
    lines.push(paint(`✖ ${plural(total, 'problem')} (${detail})`, tone, on));
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
    });
  }
  return JSON.stringify(
    { summary: { errors: summary.errors, warnings: summary.warnings, infos: summary.infos }, components },
    null,
    2,
  );
}

/** GitHub Actions job-summary markdown. Component-keyed, so no line anchors. */
export function formatStepSummary(summary: LintSummary, manifestPath: string): string {
  const { errors, warnings, infos, diagnostics } = summary;
  const lines = [
    '### Oversight manifest lint',
    '',
    `\`${manifestPath}\` — ${plural(errors, 'error')}, ${plural(warnings, 'warning')}, ${infos} info.`,
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
