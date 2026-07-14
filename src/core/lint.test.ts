import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lint } from './lint';
import { normalizeManifest } from './normalize';
import type { RawManifest } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../../test/fixtures/components.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

describe('lint (fixture baseline)', () => {
  const result = normalizeManifest(loadFixture());
  const diagnostics = lint(result);

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

  it('flags extractor drift at manifest level', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-docgen' },
      components: {},
    });
    const drift = lint(result).find((d) => d.rule === 'extractor-drift');
    expect(drift?.componentId).toBeNull();
    expect(drift?.severity).toBe('warning');
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
