import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_RULES, lint } from './lint';
import { normalizeManifest } from './normalize';
import { resolveManifestRefs } from './resolveRefs';
import type { RefLoader } from './resolveRefs';
import type { RawManifest } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../test/fixtures/components.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

/** A ref index, whose entries defer their payloads to files under `services/`. */
function loadIndex(fixture: string): RawManifest {
  const url = new URL(`../test/fixtures/${fixture}/manifests/components.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

/** An inline manifest, which carries its payloads in the one file. */
function loadInline(fixture: string): RawManifest {
  const url = new URL(`../test/fixtures/${fixture}/components.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

/** The CLI's loader shape: leaf paths resolve against the index file's directory. */
function fsLoader(fixture: string): RefLoader {
  const indexUrl = new URL(`../test/fixtures/${fixture}/manifests/components.json`, import.meta.url);
  const indexDir = dirname(fileURLToPath(indexUrl));
  return (p) => readFileSync(resolve(indexDir, p), 'utf8');
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

  it('matches an expectation carrying surrounding whitespace', () => {
    // A config value read from a file, or an unquoted shell variable, arrives
    // with a trailing newline. Comparing it raw fired a warning that named the
    // same extractor on both sides and failed CI under --max-warnings 0.
    const result = normalizeManifest({ meta: { docgen: 'react-docgen-typescript' }, components: {} });
    expect(lint(result, { expectedExtractor: 'react-docgen-typescript\n' })).toHaveLength(0);
    expect(lint(result, { expectedExtractor: '  react-docgen-typescript  ' })).toHaveLength(0);
  });

  it('matches a recorded extractor carrying surrounding whitespace', () => {
    // The same defect on the manifest side, where a newline also reached the
    // finding message and broke the CLI's one-line row.
    const result = normalizeManifest({ meta: { docgen: 'react-docgen-typescript\n' }, components: {} });
    expect(result.extractor).toBe('react-docgen-typescript');
    expect(lint(result, { expectedExtractor: 'react-docgen-typescript' })).toHaveLength(0);
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

  it('states the mismatch without predicting an outcome for prop docs', () => {
    const result = normalizeManifest({
      meta: { docgen: 'react-component-meta' },
      components: {
        'ui-a': { name: 'A', path: './a.stories.tsx', reactComponentMeta: { description: 'A.', props: {} } },
      },
    });
    const drift = lint(result, { expectedExtractor: 'react-docgen-typescript' }).find(
      (d) => d.rule === 'extractor-drift',
    );
    // The claim this asserts against named an outcome the rule cannot know:
    // the same message serves every pairing in both directions (#52).
    expect(drift?.message).not.toContain('prop docs');
    expect(drift?.message).toBe(
      'Manifest was extracted with "react-component-meta" but this project expects "react-docgen-typescript".',
    );
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

describe('the shape rules are wired like every other rule', () => {
  const shapeIssue = {
    extractor: null,
    format: 'ref' as const,
    propShape: 'known' as const,
    components: [],
    failures: [],
    storyFailures: [],
    shapeIssues: [{ componentId: null, expected: 'a resolved payload', got: 'nothing' }],
    tags: {},
  };

  it('is in ALL_RULES, so --rule and @oversightIgnore accept it', () => {
    expect(ALL_RULES).toContain('prop-shape-unrecognized');
    expect(ALL_RULES).toContain('ref-unresolved');
  });

  it('honours a severity override', () => {
    const escalated = lint(shapeIssue, { rules: { 'prop-shape-unrecognized': 'warning' } });
    expect(escalated[0].severity).toBe('warning');
  });

  it('honours being turned off', () => {
    expect(lint(shapeIssue, { rules: { 'prop-shape-unrecognized': 'off' } })).toEqual([]);
  });
});

describe('extractor-drift under the react-component-meta extractors', () => {
  // Both `experimentalDocgenServer` and `experimentalReactComponentMeta` record
  // `react-component-meta`, and they produce different shapes: a ref index and
  // an inline manifest. The rule reads the label, so it behaves the same on
  // both, and these two fixtures are the same six components either way (#52).
  const driftOn = async (fixture: 'v1' | 'v0-react-component-meta', expectedExtractor: string) => {
    const result = normalizeManifest(
      fixture === 'v1' ? await resolveManifestRefs(loadIndex('v1'), fsLoader('v1')) : loadInline(fixture),
    );
    return lint(result, { expectedExtractor }).filter((d) => d.rule === 'extractor-drift');
  };

  for (const fixture of ['v1', 'v0-react-component-meta'] as const) {
    it(`stays silent on ${fixture} when the project expects react-component-meta`, async () => {
      expect(await driftOn(fixture, 'react-component-meta')).toHaveLength(0);
    });

    it(`flags ${fixture} against a react-docgen-typescript pin, and names no outcome`, async () => {
      const [drift] = await driftOn(fixture, 'react-docgen-typescript');
      expect(drift?.message).toBe(
        'Manifest was extracted with "react-component-meta" but this project expects "react-docgen-typescript".',
      );
    });
  }

  it('reports an unrecorded extractor on a ref index that records nothing (guards #32)', async () => {
    // Suppressing drift on the ref format would drop this row. `meta` is absent
    // because the v:1 index writer passes the generator's through rather than
    // recomputing it, and every ref fails, so no payload key survives for
    // `recordedExtractor` to infer from. A v:1 index shipped without its
    // `services/` tree reaches exactly this state.
    const index = {
      v: 1,
      components: {
        'x-widget': { id: 'x-widget', name: 'Widget', docgen: { $ref: '../services/core/docgen/x-widget.json#/c/x' } },
      },
    } as unknown as RawManifest;
    const result = normalizeManifest(
      await resolveManifestRefs(index, () => {
        throw new Error('ENOENT');
      }),
    );

    expect(result.extractor).toBeNull();
    const diagnostics = lint(result, { expectedExtractor: 'react-component-meta' });
    expect(diagnostics.find((d) => d.rule === 'extractor-drift')?.message).toContain('does not record');
    // The per-component row is not a substitute: it says nothing about the
    // expectation the project configured.
    expect(diagnostics.filter((d) => d.rule === 'docgen-missing')).toHaveLength(1);
  });
});
