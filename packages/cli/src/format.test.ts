import { describe, expect, it } from 'vitest';
import type { Diagnostic } from 'oversight-core';
import { formatGithub, formatJson, formatStepSummary, formatStylish } from './format';
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
  files: new Map([
    ['ui-card', './stories/Card/Card.stories.tsx'],
    ['ui-old', './stories/Old/Old.stories.tsx'],
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
      { diagnostics: [], errors: 0, warnings: 0, infos: 0, names: new Map(), files: new Map() },
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

  it('keeps the full extraction error on diagnostics that carry one', () => {
    const failing: LintSummary = {
      diagnostics: [
        {
          rule: 'docgen-missing',
          severity: 'error',
          componentId: 'ui-broken',
          message: 'Docgen extraction failed for Broken: No component file found',
          error: 'No component file found\nat resolve (/src/Broken.tsx:1:1)',
        },
      ],
      errors: 1,
      warnings: 0,
      infos: 0,
      names: new Map([['ui-broken', 'Broken']]),
      files: new Map(),
    };
    const out = JSON.parse(formatJson(failing)) as { components: Record<string, { error?: string }[]> };
    expect(out.components['ui-broken'][0].error).toBe('No component file found\nat resolve (/src/Broken.tsx:1:1)');
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
    const clean = formatStepSummary(
      { diagnostics: [], errors: 0, warnings: 0, infos: 0, names: new Map(), files: new Map() },
      'x.json',
    );
    expect(clean).toContain('No problems found.');
    expect(clean).not.toContain('| Component |');
  });
});

describe('formatGithub', () => {
  const gh = formatGithub(summary);
  const lines = gh.split('\n');

  it('maps severity to the workflow command', () => {
    expect(gh).toContain('::error ');
    expect(gh).toContain('::warning ');
    expect(gh).toContain('::notice ');
  });

  it('carries the rule as title and the message (with props) as payload', () => {
    const errorLine = lines.find((l) => l.startsWith('::error '));
    expect(errorLine).toContain('title=oversight/required-prop-undocumented');
    expect(errorLine).toContain('::Card has a required prop. (props: title)');
  });

  it('anchors component findings to the stories file, stripping the ./', () => {
    const errorLine = lines.find((l) => l.startsWith('::error '));
    expect(errorLine).toContain('file=stories/Card/Card.stories.tsx');
    expect(errorLine).not.toContain('./stories');
  });

  it('emits manifest-level findings without a file (job-level)', () => {
    const drift = lines.find((l) => l.includes('oversight/extractor-drift'));
    expect(drift).toBeDefined();
    expect(drift).not.toContain('file=');
  });

  it('caps annotations per type and notes the truncation', () => {
    const many: Diagnostic[] = Array.from({ length: 12 }, (_, i) => ({
      rule: 'docgen-missing',
      severity: 'error',
      componentId: `c${i}`,
      message: `err ${i}`,
    }));
    const big = formatGithub({
      diagnostics: many,
      errors: 12,
      warnings: 0,
      infos: 0,
      names: new Map(),
      files: new Map(),
    });
    const errorLines = big.split('\n').filter((l) => l.startsWith('::error '));
    expect(errorLines).toHaveLength(10);
    expect(big).toContain('2 more error annotations omitted');
  });

  it('percent-encodes newlines in the message', () => {
    const encoded = formatGithub({
      diagnostics: [{ rule: 'docgen-missing', severity: 'error', componentId: 'x', message: 'line1\nline2' }],
      errors: 1,
      warnings: 0,
      infos: 0,
      names: new Map(),
      files: new Map([['x', 'a.tsx']]),
    });
    expect(encoded).toContain('line1%0Aline2');
  });
});
