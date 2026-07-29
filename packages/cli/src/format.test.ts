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
  manifestPath: 'storybook-static/manifests/components.json',
  extractor: 'react-docgen-typescript',
  entryCount: 2,
  names: new Map([
    ['ui-card', 'Card'],
    ['ui-old', 'Old'],
  ]),
  files: new Map([
    ['ui-card', './stories/Card/Card.stories.tsx'],
    ['ui-old', './stories/Old/Old.stories.tsx'],
  ]),
};

/** A summary whose counts are derived from the diagnostics, for one-off cases. */
function summaryOf(diagnostics: Diagnostic[], over: Partial<LintSummary> = {}): LintSummary {
  return {
    diagnostics,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
    infos: diagnostics.filter((d) => d.severity === 'info').length,
    manifestPath: 'storybook-static/manifests/components.json',
    extractor: 'react-docgen-typescript',
    entryCount: 0,
    names: new Map(),
    files: new Map(),
    ...over,
  };
}

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

  it('reports a clean run with the entry count', () => {
    const clean = formatStylish(summaryOf([], { entryCount: 3 }), { color: false, quiet: false });
    expect(clean).toContain('No problems found in 3 entries.');
  });

  it('opens with the manifest path and its recorded extractor', () => {
    expect(out).toMatch(/^storybook-static\/manifests\/components\.json \(docgen: react-docgen-typescript\)/);
  });

  it('omits the docgen note when the manifest records no extractor', () => {
    const bare = formatStylish(summaryOf([], { extractor: null, entryCount: 1 }), { color: false, quiet: false });
    expect(bare).toMatch(/^storybook-static\/manifests\/components\.json\n/);
    expect(bare).not.toContain('docgen:');
  });

  it('labels the tally with affected entries', () => {
    expect(out).toContain('✖ 4 problems (1 error, 2 warnings, 1 info), 2 of 2 entries affected');
  });

  it('quiet hides non-errors but keeps the full tally', () => {
    const quiet = formatStylish(summary, { color: false, quiet: true });
    expect(quiet).toContain('required-prop-undocumented');
    expect(quiet).not.toContain('deprecated-tag');
    expect(quiet).toContain('2 warnings');
  });
});

describe('formatStylish: mass-failure collapse', () => {
  const render = (diags: Diagnostic[], entryCount: number) =>
    formatStylish(summaryOf(diags, { entryCount }), { color: false, quiet: false });

  function docgenFailure(i: number, over: Partial<Diagnostic> = {}): Diagnostic {
    return {
      rule: 'docgen-missing',
      severity: 'error',
      componentId: `ui-c${i}`,
      message: `Docgen extraction failed for C${i}: No docs found: File: /repo/c${i}.tsx`,
      error: `File: /repo/c${i}.tsx\nno docs`,
      errorName: 'No docs found',
      ...over,
    };
  }

  const twelve = Array.from({ length: 12 }, (_, i) => docgenFailure(i));

  it('collapses a dominant signature into one line with share and signature', () => {
    const out = render(twelve, 20);
    expect(out).toContain('12 of 20 entries: No docs found');
    expect(out).not.toContain('ui-c3');
    expect(out).toContain('--json');
  });

  it('keeps per-entry lines below 10 findings, whatever the share', () => {
    const out = render(twelve.slice(0, 9), 10);
    expect(out).toContain('ui-c3');
    expect(out).not.toContain('of 10 entries:');
  });

  it('keeps per-entry lines when the share is under half the manifest', () => {
    const out = render(twelve.slice(0, 10), 100);
    expect(out).toContain('ui-c3');
    expect(out).not.toContain('of 100 entries:');
  });

  it('collapses rarer signatures of the same rule along with the dominant one', () => {
    const straggler = docgenFailure(12, {
      componentId: 'ui-s0',
      error: 'story file unreadable',
      errorName: 'Unreadable',
    });
    const out = render([...twelve, straggler], 20);
    expect(out).toContain('12 of 20 entries: No docs found');
    expect(out).toContain('1 of 20 entries: Unreadable: story file unreadable');
    expect(out).not.toContain('ui-s0');
  });

  it('states findings and entries separately when stories multiply the count', () => {
    const stories = Array.from({ length: 36 }, (_, i) => ({
      rule: 'story-extraction-error' as const,
      severity: 'warning' as const,
      componentId: `ui-c${i % 12}`,
      message: `Story "S${i}" failed extraction: SyntaxError: Expected a function`,
      error: 'Expected a function\n> 14 | export { X }',
      errorName: 'SyntaxError',
    }));
    const out = render(stories, 20);
    expect(out).toContain('36 findings across 12 of 20 entries: SyntaxError: Expected a function');
  });

  it('groups on the clamped error text when the error carries no name', () => {
    const unnamed = Array.from({ length: 12 }, (_, i) =>
      docgenFailure(i, { error: 'kaput\nat parse (/x:1:1)', errorName: undefined }),
    );
    const out = render(unnamed, 20);
    expect(out).toContain('12 of 20 entries: kaput');
  });

  it('shows the shared one-line summary when every finding in the group agrees', () => {
    const uniform = Array.from({ length: 12 }, (_, i) =>
      docgenFailure(i, { error: 'File: /repo/index.js\nno docs for this file' }),
    );
    const out = render(uniform, 20);
    expect(out).toContain('12 of 20 entries: No docs found: File: /repo/index.js');
  });
});

describe('formatJson', () => {
  const parsed = JSON.parse(formatJson(summary)) as {
    summary: { errors: number; warnings: number; infos: number };
    components: Record<string, { rule: string; props?: string[] }[]>;
  };

  it('carries the summary counts and the manifest provenance', () => {
    expect(parsed.summary).toEqual({
      errors: 1,
      warnings: 2,
      infos: 1,
      manifest: { path: 'storybook-static/manifests/components.json', docgen: 'react-docgen-typescript' },
    });
  });

  it('records a null docgen when the manifest has no extractor', () => {
    const bare = JSON.parse(formatJson(summaryOf([], { extractor: null }))) as {
      summary: { manifest: { docgen: string | null } };
    };
    expect(bare.summary.manifest.docgen).toBeNull();
  });

  it('keys component diagnostics by id and manifest-level ones under __manifest__', () => {
    expect(parsed.components['ui-card']).toHaveLength(2);
    expect(parsed.components['__manifest__'][0].rule).toBe('extractor-drift');
  });

  it('keeps props on the diagnostics that carry them', () => {
    const required = parsed.components['ui-card'].find((d) => d.rule === 'required-prop-undocumented');
    expect(required?.props).toEqual(['title']);
  });

  it('keeps the full extraction error and its name on diagnostics that carry them', () => {
    const failing = summaryOf(
      [
        {
          rule: 'docgen-missing',
          severity: 'error',
          componentId: 'ui-broken',
          message: 'Docgen extraction failed for Broken: No component found: No component file found',
          error: 'No component file found\nat resolve (/src/Broken.tsx:1:1)',
          errorName: 'No component found',
        },
      ],
      { entryCount: 1, names: new Map([['ui-broken', 'Broken']]) },
    );
    const out = JSON.parse(formatJson(failing)) as {
      components: Record<string, { error?: string; errorName?: string }[]>;
    };
    expect(out.components['ui-broken'][0].error).toBe('No component file found\nat resolve (/src/Broken.tsx:1:1)');
    expect(out.components['ui-broken'][0].errorName).toBe('No component found');
  });
});

describe('formatStepSummary', () => {
  const md = formatStepSummary(summary);

  it('is a markdown table with a heading', () => {
    expect(md).toContain('### Oversight manifest lint');
    expect(md).toContain('| Component | Severity | Rule | Message |');
  });

  it('names the manifest, its extractor, and the affected entries', () => {
    expect(md).toContain(
      '`storybook-static/manifests/components.json` (docgen: react-docgen-typescript): ' +
        '1 error, 2 warnings, 1 info, 2 of 2 entries affected.',
    );
  });

  it('escapes pipes in messages so the table survives', () => {
    expect(md).toContain('drift \\| with a pipe');
  });

  it('renders a clean run without a table', () => {
    const clean = formatStepSummary(summaryOf([], { manifestPath: 'x.json', entryCount: 1 }));
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
    const big = formatGithub(summaryOf(many, { entryCount: 12 }));
    const errorLines = big.split('\n').filter((l) => l.startsWith('::error '));
    expect(errorLines).toHaveLength(10);
    expect(big).toContain('2 more error annotations omitted');
  });

  it('percent-encodes newlines in the message', () => {
    const encoded = formatGithub(
      summaryOf([{ rule: 'docgen-missing', severity: 'error', componentId: 'x', message: 'line1\nline2' }], {
        entryCount: 1,
        files: new Map([['x', 'a.tsx']]),
      }),
    );
    expect(encoded).toContain('line1%0Aline2');
  });
});
