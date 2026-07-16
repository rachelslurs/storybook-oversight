import { describe, expect, it } from 'vitest';
import type { Diagnostic } from 'oversight-core';
import { formatJson, formatStepSummary, formatStylish } from './format';
import type { LintSummary } from './types';

const diagnostics: Diagnostic[] = [
  {
    rule: 'component-description-missing',
    severity: 'warning',
    componentId: 'ui-card',
    message: 'Card has no description.',
  },
  {
    rule: 'required-prop-undocumented',
    severity: 'error',
    componentId: 'ui-card',
    message: 'Card has a required prop.',
    props: ['title'],
  },
  { rule: 'deprecated-tag', severity: 'info', componentId: 'ui-old', message: 'Old is deprecated.' },
  { rule: 'extractor-drift', severity: 'warning', componentId: null, message: 'drift | with a pipe' },
];

const summary: LintSummary = {
  diagnostics,
  errors: 1,
  warnings: 2,
  infos: 1,
  names: new Map([
    ['ui-card', 'Card'],
    ['ui-old', 'Old'],
  ]),
};

describe('formatStylish', () => {
  const out = formatStylish(summary, { color: false, quiet: false });

  it('groups under component display names and a Manifest section', () => {
    expect(out).toContain('Card');
    expect(out).toContain('Old');
    expect(out).toContain('Manifest');
  });

  it('shows severity, rule, message, and props', () => {
    expect(out).toContain('required-prop-undocumented');
    expect(out).toContain('(props: title)');
  });

  it('ends on a problem tally', () => {
    expect(out).toContain('✖ 4 problems (1 error, 2 warnings, 1 info)');
  });

  it('emits no ANSI escapes when color is off', () => {
    expect(out).not.toContain('\x1b[');
  });

  it('reports a clean run', () => {
    const clean = formatStylish(
      { diagnostics: [], errors: 0, warnings: 0, infos: 0, names: new Map() },
      { color: false, quiet: false },
    );
    expect(clean).toContain('No problems found.');
  });

  it('quiet hides non-errors but keeps the full tally', () => {
    const quiet = formatStylish(summary, { color: false, quiet: true });
    expect(quiet).toContain('required-prop-undocumented');
    expect(quiet).not.toContain('deprecated-tag');
    expect(quiet).toContain('2 warnings');
  });
});

describe('formatJson', () => {
  const parsed = JSON.parse(formatJson(summary)) as {
    summary: { errors: number; warnings: number; infos: number };
    components: Record<string, { rule: string; props?: string[] }[]>;
  };

  it('carries the summary counts', () => {
    expect(parsed.summary).toEqual({ errors: 1, warnings: 2, infos: 1 });
  });

  it('keys component diagnostics by id and manifest-level ones under __manifest__', () => {
    expect(parsed.components['ui-card']).toHaveLength(2);
    expect(parsed.components['__manifest__'][0].rule).toBe('extractor-drift');
  });

  it('keeps props on the diagnostics that carry them', () => {
    const required = parsed.components['ui-card'].find((d) => d.rule === 'required-prop-undocumented');
    expect(required?.props).toEqual(['title']);
  });
});

describe('formatStepSummary', () => {
  const md = formatStepSummary(summary, 'storybook-static/manifests/components.json');

  it('is a markdown table with a heading', () => {
    expect(md).toContain('### Oversight manifest lint');
    expect(md).toContain('| Component | Severity | Rule | Message |');
  });

  it('escapes pipes in messages so the table survives', () => {
    expect(md).toContain('drift \\| with a pipe');
  });

  it('renders a clean run without a table', () => {
    const clean = formatStepSummary({ diagnostics: [], errors: 0, warnings: 0, infos: 0, names: new Map() }, 'x.json');
    expect(clean).toContain('No problems found.');
    expect(clean).not.toContain('| Component |');
  });
});
