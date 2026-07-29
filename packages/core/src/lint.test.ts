import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lint } from './lint';
import { normalizeManifest } from './normalize';
import type { RawManifest } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../test/fixtures/components.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

describe('lint (fixture baseline)', () => {
  const result = normalizeManifest(loadFixture());
  const diagnostics = lint(result, { expectedExtractor: 'react-docgen-typescript' });

  it('does not flag extractor drift for the pinned extractor', () => {
    expect(diagnostics.filter((d) => d.rule === 'extractor-drift')).toHaveLength(0);
  });

  it('reports no extraction failures in the live catalog', () => {
    expect(diagnostics.filter((d) => d.rule === 'docgen-missing')).toHaveLength(0);
    expect(diagnostics.filter((d) => d.rule === 'story-extraction-error')).toHaveLength(0);
  });

  it('finds no documentation-coverage gaps after the backfill', () => {
    for (const rule of [
      'component-description-missing',
      'prop-descriptions-missing',
      'required-prop-undocumented',
      'docs-link-dangling',
      'unknown-ignore-rule',
      'deprecated-tag',
    ] as const) {
      expect(diagnostics.filter((d) => d.rule === rule)).toHaveLength(0);
    }
  });
});

describe('lint (synthetic cases the fixture cannot cover)', () => {
  it('escalates required undocumented props to errors', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            description: 'documented',
            props: {
              value: { description: '', required: true },
              tone: { description: '', required: false },
            },
          },
        },
      },
    });
    const diagnostics = lint(result);
    const propDiag = diagnostics.find((d) => d.rule === 'prop-descriptions-missing');
    const requiredDiag = diagnostics.find((d) => d.rule === 'required-prop-undocumented');
    expect(propDiag?.props).toEqual(['value', 'tone']);
    expect(requiredDiag?.severity).toBe('error');
    expect(requiredDiag?.props).toEqual(['value']);
  });

  it('surfaces @deprecated tags as info', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            description: 'documented',
            tags: { deprecated: 'use B instead' },
            props: {},
          },
        },
      },
    });
    const deprecated = lint(result).find((d) => d.rule === 'deprecated-tag');
    expect(deprecated?.severity).toBe('info');
    expect(deprecated?.message).toContain('use B instead');
  });

  it('renders a whitespace @deprecated body as a bare tag (#30)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-old': {
          name: 'Old',
          path: './old.stories.tsx',
          jsDocTags: { deprecated: ' ' },
          reactDocgenTypescript: { description: 'Old.', props: {} },
        },
      },
    });
    const finding = lint(result).find((d) => d.rule === 'deprecated-tag');
    expect(finding).toBeDefined();
    expect(finding?.message).toBe('Old is marked @deprecated.');
  });

  it('clamps a multi-line @deprecated body to its first line (#30)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-old': {
          name: 'Old',
          path: './old.stories.tsx',
          // The array form is how a multi-line @deprecated arrives; stringifyTag
          // joins it with newlines.
          jsDocTags: { deprecated: ['use Gadget instead', 'since 2.0'] },
          reactDocgenTypescript: { description: 'Old.', props: {} },
        },
      },
    });
    const finding = lint(result).find((d) => d.rule === 'deprecated-tag');
    expect(finding).toBeDefined();
    expect(finding?.message).toBe('Old is marked @deprecated: use Gadget instead.');
    expect(finding?.message).not.toContain('\n');
    expect(finding?.message).not.toContain('since 2.0');
    // The full value stays available to consumers: on the tags map for the
    // core API, and on the finding's error field for machine-readable output.
    expect(result.tags['ui-old'].deprecated).toBe('use Gadget instead\nsince 2.0');
    expect(finding?.error).toBe('use Gadget instead\nsince 2.0');
  });

  it('does not double the period when the @deprecated note ends in one (#30)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-old': {
          name: 'Old',
          path: './old.stories.tsx',
          jsDocTags: { deprecated: 'Use Gadget instead.' },
          reactDocgenTypescript: { description: 'Old.', props: {} },
        },
      },
    });
    const finding = lint(result).find((d) => d.rule === 'deprecated-tag');
    expect(finding?.message).toBe('Old is marked @deprecated: Use Gadget instead.');
    // A single-line note loses nothing, so no error field rides along.
    expect(finding?.error).toBeUndefined();
  });

  it('clamps a component name containing a newline in finding messages (#30)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-old': {
          name: 'Old\nLegacy',
          path: './old.stories.tsx',
          jsDocTags: { deprecated: 'use Gadget instead' },
          reactDocgenTypescript: { description: 'Old.', props: {} },
        },
      },
    });
    const finding = lint(result).find((d) => d.rule === 'deprecated-tag');
    expect(finding?.message).toBe('Old is marked @deprecated: use Gadget instead.');
    expect(finding?.message).not.toContain('\n');
  });

  it('flags extractor drift at manifest level', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen' },
      components: {},
    });
    const drift = lint(result, { expectedExtractor: 'react-docgen-typescript' }).find(
      (d) => d.rule === 'extractor-drift',
    );
    expect(drift?.componentId).toBeNull();
    expect(drift?.severity).toBe('warning');
  });

  it('does not run extractor drift without a stated expectation (guards #32)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen' },
      components: {},
    });
    expect(lint(result)).toHaveLength(0);
  });

  it('flags an unrecorded extractor when an expectation is stated (guards #32)', () => {
    const result = normalizeManifest({ components: {} });
    const drift = lint(result, { expectedExtractor: 'react-docgen-typescript' }).find(
      (d) => d.rule === 'extractor-drift',
    );
    expect(drift?.componentId).toBeNull();
    expect(drift?.severity).toBe('warning');
    expect(drift?.message).toContain('does not record which extractor ran');
  });

  it('stays silent on a meta-less manifest when no expectation is stated (guards #32)', () => {
    // The flag-built 10.2 manifests ship `meta: null`; both spellings of
    // "unrecorded" must stay silent without an expectation.
    expect(lint(normalizeManifest({ meta: null, components: {} }))).toHaveLength(0);
    expect(lint(normalizeManifest({ components: {} }))).toHaveLength(0);
  });

  it('treats a null or empty expectation as no expectation', () => {
    const result = normalizeManifest({ meta: { docgen: 'react-docgen' }, components: {} });
    expect(lint(result, { expectedExtractor: null as unknown as string })).toHaveLength(0);
    expect(lint(result, { expectedExtractor: '' })).toHaveLength(0);
    expect(lint(result, { expectedExtractor: '   ' })).toHaveLength(0);
  });

  it('does not flag a meta-less manifest whose entries record the extractor', () => {
    const result = normalizeManifest({
      meta: null,
      components: {
        'ui-a': { name: 'A', path: './a.stories.tsx', reactDocgenTypescript: { description: 'A.', props: {} } },
        'ui-b': { name: 'B', path: './b.stories.tsx', reactDocgenTypescript: { description: 'B.', props: {} } },
      },
    });
    expect(lint(result, { expectedExtractor: 'react-docgen-typescript' })).toHaveLength(0);
  });

  it('flags drift against the extractor inferred from payload keys', () => {
    const result = normalizeManifest({
      meta: null,
      components: {
        'ui-a': { name: 'A', path: './a.stories.tsx', reactDocgen: { description: 'A.', props: {} } },
      },
    });
    const drift = lint(result, { expectedExtractor: 'react-docgen-typescript' }).find(
      (d) => d.rule === 'extractor-drift',
    );
    expect(drift?.message).toContain('extracted with "react-docgen"');
  });

  it('reports an unrecorded extractor when payload keys disagree', () => {
    const result = normalizeManifest({
      components: {
        'ui-a': { name: 'A', path: './a.stories.tsx', reactDocgenTypescript: { description: 'A.', props: {} } },
        'ui-b': { name: 'B', path: './b.stories.tsx', reactDocgen: { description: 'B.', props: {} } },
      },
    });
    const drift = lint(result, { expectedExtractor: 'react-docgen-typescript' }).find(
      (d) => d.rule === 'extractor-drift',
    );
    expect(drift?.message).toContain('does not record');
  });

  it('skips prop rules on components with no props', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { description: 'documented', props: {} },
        },
      },
    });
    expect(lint(result)).toHaveLength(0);
  });

  it('flags a missing component description', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { props: {} },
        },
      },
    });
    const diagnostics = lint(result);
    expect(diagnostics.some((d) => d.rule === 'component-description-missing')).toBe(true);
  });

  it('reports story extraction errors on payload-bearing entries too', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { description: 'd', props: {} },
          stories: [{ id: 'a--broken', name: 'Broken', error: 'kaput' }],
        },
      },
    });
    const storyErrors = lint(result).filter((d) => d.rule === 'story-extraction-error');
    expect(storyErrors).toHaveLength(1);
    expect(storyErrors[0].message).toContain('kaput');
  });

  it('clamps multi-line extraction errors to their first line (guards #16)', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          error: { message: 'No component file found\nat resolve (/src/a.tsx:1:1)' },
        },
        b: {
          name: 'B',
          path: './b.stories.tsx',
          reactDocgenTypescript: { description: 'd', props: {} },
          stories: [{ id: 'b--broken', name: 'Broken', error: 'kaput\nat parse (/src/b.tsx:2:2)' }],
        },
      },
    });
    const diagnostics = lint(result);
    const docgen = diagnostics.find((d) => d.rule === 'docgen-missing');
    expect(docgen?.message).toContain('No component file found');
    expect(docgen?.message).not.toContain('at resolve');
    expect(docgen?.error).toBe('No component file found\nat resolve (/src/a.tsx:1:1)');
    const story = diagnostics.find((d) => d.rule === 'story-extraction-error');
    expect(story?.message).toContain('kaput');
    expect(story?.message).not.toContain('at parse');
    expect(story?.error).toBe('kaput\nat parse (/src/b.tsx:2:2)');
  });

  it('surfaces the diagnosis when error.message leads with a file path (#34)', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-broken': {
          name: 'Broken',
          path: './broken.stories.js',
          error: {
            name: 'react-docgen-typescript found no component docs',
            message:
              'File: /repo/src/index.js\nreact-docgen-typescript did not return any component docs for this file.',
          },
        },
      },
    });
    const finding = lint(result).find((d) => d.rule === 'docgen-missing');
    expect(finding?.message).toMatch(/component docs/);
    // The full original text stays on the error field (guards #16), and the
    // name rides along for renderers to group mass failures by.
    expect(finding?.error).toBe(
      'File: /repo/src/index.js\nreact-docgen-typescript did not return any component docs for this file.',
    );
    expect(finding?.errorName).toBe('react-docgen-typescript found no component docs');
  });

  it('keeps the informative message line when the name is a bare error class (#34)', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgen: { description: 'd', props: {} },
          stories: [
            {
              id: 'a--basic',
              name: 'Basic',
              error: { name: 'SyntaxError', message: 'Expected story to be a function\n> 14 | export { X }' },
            },
          ],
        },
      },
    });
    const story = lint(result).find((d) => d.rule === 'story-extraction-error');
    expect(story?.message).toContain('SyntaxError: Expected story to be a function');
    expect(story?.errorName).toBe('SyntaxError');
  });

  it('takes the first non-empty line of the error and trims a CRLF ending', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          error: { message: '\nSyntaxError: kaput\r\nat parse (/src/a.tsx:1:1)' },
        },
      },
    });
    const docgen = lint(result).find((d) => d.rule === 'docgen-missing');
    expect(docgen?.message).toBe('Docgen extraction failed for A: SyntaxError: kaput');
  });

  it('exempts a component from all rules via bare @oversightIgnore', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            tags: { oversightIgnore: '' },
            props: { x: { description: '', required: true } },
          },
        },
      },
    });
    expect(lint(result).filter((d) => d.componentId === 'a')).toHaveLength(0);
  });

  it('exempts only the listed rules via scoped @oversightIgnore', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            tags: { oversightIgnore: 'component-description-missing' },
            props: { x: { description: '', required: true } },
          },
        },
      },
    });
    const diagnostics = lint(result);
    // The listed rule is exempted…
    expect(diagnostics.filter((d) => d.rule === 'component-description-missing')).toHaveLength(0);
    // …but unlisted rules still fire.
    expect(diagnostics.some((d) => d.rule === 'prop-descriptions-missing')).toBe(true);
    expect(diagnostics.some((d) => d.rule === 'required-prop-undocumented')).toBe(true);
  });

  it("lets @oversightIgnore on a failed entry's meta JSDoc silence its rules", () => {
    const result = normalizeManifest({
      components: {
        broken: {
          name: 'Broken',
          path: './broken.stories.tsx',
          jsDocTags: { oversightIgnore: ['docgen-missing', 'story-extraction-error'] },
          error: { message: 'no component file' },
          stories: [{ id: 'broken--all', name: 'All', error: 'no snippet' }],
        },
      },
    });
    const diagnostics = lint(result);
    expect(diagnostics.filter((d) => d.rule === 'docgen-missing')).toHaveLength(0);
    expect(diagnostics.filter((d) => d.rule === 'story-extraction-error')).toHaveLength(0);
  });

  it('exempts rules from a whitespace-separated @oversightIgnore list', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          // Space-separated — the natural JSDoc form, not comma-separated.
          reactDocgenTypescript: {
            tags: {
              oversightIgnore: 'component-description-missing prop-descriptions-missing',
            },
            props: { x: { required: false } },
          },
        },
      },
    });
    const diagnostics = lint(result);
    expect(diagnostics.filter((d) => d.rule === 'component-description-missing')).toHaveLength(0);
    expect(diagnostics.filter((d) => d.rule === 'prop-descriptions-missing')).toHaveLength(0);
    expect(diagnostics.filter((d) => d.rule === 'unknown-ignore-rule')).toHaveLength(0);
  });

  it('treats a boolean-valued bare @oversightIgnore as exempt-all', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          // Some extractors serialize a value-less `@oversightIgnore` as `true`.
          reactDocgenTypescript: {
            tags: { oversightIgnore: true },
            props: { x: { required: true } },
          },
        },
      },
    });
    const diagnostics = lint(result);
    // Every rule that would otherwise fire is exempted, and "true" is not
    // surfaced as an unknown token.
    for (const rule of [
      'component-description-missing',
      'prop-descriptions-missing',
      'required-prop-undocumented',
      'unknown-ignore-rule',
    ] as const) {
      expect(diagnostics.filter((d) => d.rule === rule)).toHaveLength(0);
    }
  });

  it('flags unknown @oversightIgnore tokens instead of silently ignoring them', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            // No description → component-description-missing should still fire.
            tags: { oversightIgnore: 'internal token catalog' },
            props: {},
          },
        },
      },
    });
    const diagnostics = lint(result);
    const unknown = diagnostics.filter((d) => d.rule === 'unknown-ignore-rule');
    expect(unknown).toHaveLength(1);
    // Whitespace-separated, so each word is surfaced as an unknown token.
    expect(unknown[0].message).toContain('internal, token, catalog');
    // The malformed list exempts nothing — other rules still fire.
    expect(diagnostics.some((d) => d.rule === 'component-description-missing')).toBe(true);
  });

  it('flags prose links to unknown manifest ids', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            description: 'Use [B](?path=/docs/group-b--docs) or [Ghost](?path=/docs/group-ghost--docs).',
            props: {},
          },
        },
        'group-b': {
          name: 'B',
          path: './b.stories.tsx',
          reactDocgenTypescript: { description: 'd', props: {} },
        },
      },
    });
    const dangling = lint(result).filter((d) => d.rule === 'docs-link-dangling');
    expect(dangling).toHaveLength(1);
    expect(dangling[0].componentId).toBe('a');
    expect(dangling[0].message).toContain('group-ghost--docs');
    expect(dangling[0].message).not.toContain('group-b--docs');
    // Structured targets drive the inline strikethrough — only the dead id.
    expect(dangling[0].targets).toEqual(['group-ghost--docs']);
  });

  it('honors per-rule overrides: off drops, severity remaps', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            props: { x: { description: '', required: false } },
          },
        },
      },
    });
    const diagnostics = lint(result, {
      rules: {
        'component-description-missing': 'off',
        'prop-descriptions-missing': 'error',
      },
    });
    expect(diagnostics.filter((d) => d.rule === 'component-description-missing')).toHaveLength(0);
    const remapped = diagnostics.find((d) => d.rule === 'prop-descriptions-missing');
    expect(remapped?.severity).toBe('error');
  });

  it('ignores unrecognized override values instead of leaking them', () => {
    const result = normalizeManifest({
      components: {
        a: { name: 'A', path: './a.stories.tsx', reactDocgenTypescript: { props: {} } },
      },
    });
    const diagnostics = lint(result, {
      // ESLint muscle memory — not a valid RuleSetting.
      rules: { 'component-description-missing': 'warn' as never },
    });
    const diagnostic = diagnostics.find((d) => d.rule === 'component-description-missing');
    expect(diagnostic?.severity).toBe('warning'); // default kept, not "warn"
  });
});
