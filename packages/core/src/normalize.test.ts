import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectExtractorPrefix, detectRepoRoot, normalizeManifest } from './normalize';
import { resolveManifestRefs } from './resolveRefs';
import type { RawManifest, RawPayload } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../test/fixtures/components.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

describe('normalizeManifest (fixture: react-docgen-typescript flavor)', () => {
  const fixture = loadFixture();
  const result = normalizeManifest(fixture);

  it('splits entries into components and extraction failures', () => {
    expect(result.components).toHaveLength(5);
    expect(result.failures).toHaveLength(0);
    expect(result.storyFailures).toHaveLength(0);
    expect(result.extractor).toBe('react-docgen-typescript');
  });

  it('resolves a description for every docgen-backed component', () => {
    // Every fixture component is documented; "" → null is covered synthetically.
    const missing = result.components.filter((c) => c.description === null);
    expect(missing.map((c) => c.id)).toEqual([]);
    const button = result.components.find((c) => c.id === 'actions-button');
    expect(button?.description).toContain('Triggers an action when pressed');
  });

  it('keeps sourceFile repo-relative and storiesFile verbatim', () => {
    const button = result.components.find((c) => c.id === 'actions-button');
    expect(button?.sourceFile).toBe('src/Button/Button.tsx');
    expect(button?.storiesFile).toBe('./src/Button/Button.stories.tsx');
    const spinner = result.components.find((c) => c.id === 'feedback-spinner');
    expect(spinner?.sourceFile).toBe('src/Spinner/Spinner.tsx');
    expect(spinner?.storiesFile).toBe('./src/Spinner/Spinner.stories.tsx');
  });

  it('handles zero-prop components via the manifest-wide repo root', () => {
    const spinner = result.components.find((c) => c.id === 'feedback-spinner');
    expect(spinner?.props).toEqual({});
    expect(spinner?.sourceFile).toBe('src/Spinner/Spinner.tsx');
    const button = result.components.find((c) => c.id === 'actions-button');
    expect(button?.props.variant?.required).toBe(true);
  });

  it('matches the known documentation baseline', () => {
    const propsTotal = result.components.reduce((sum, c) => sum + Object.keys(c.props).length, 0);
    const undocumented = result.components.reduce(
      (sum, c) => sum + Object.values(c.props).filter((p) => p.description === null).length,
      0,
    );
    expect(propsTotal).toBe(10);
    expect(undocumented).toBe(0);
  });

  it('is idempotent on already-relative input', () => {
    expect(detectRepoRoot(fixture)).toBe('');
    const again = normalizeManifest(fixture);
    expect(again.components.map((c) => c.sourceFile)).toEqual(result.components.map((c) => c.sourceFile));
  });

  it('strips an absolute repo root (live-manifest branch)', () => {
    const absolute = JSON.parse(JSON.stringify(fixture)) as RawManifest;
    for (const entry of Object.values(absolute.components ?? {})) {
      const payload = entry.reactDocgenTypescript;
      if (payload?.filePath) payload.filePath = `/fake/root/${payload.filePath}`;
    }
    expect(detectRepoRoot(absolute)).toBe('/fake/root/');
    const normalized = normalizeManifest(absolute);
    expect(normalized.components.map((c) => c.sourceFile)).toEqual(result.components.map((c) => c.sourceFile));
  });
});

describe('normalizeManifest (synthetic: react-docgen flavor and edge cases)', () => {
  it('supports the react-docgen payload shape', () => {
    const raw: RawManifest = {
      v: 0,
      meta: { docgen: 'react-docgen' },
      components: {
        'data-display-widget': {
          id: 'data-display-widget',
          name: 'Widget',
          path: './src/Widget/Widget.stories.tsx',
          jsDocTags: { deprecated: ['use Gadget instead', 'since 2.0'] },
          reactDocgen: {
            description: 'A widget.',
            definedInFile: '/repo/storybook/src/Widget/Widget.tsx',
            props: {
              size: {
                description: '',
                required: true,
                declarations: [{ fileName: 'storybook/src/Widget/Widget.tsx' }],
              },
            },
          },
        },
      },
    };
    const result = normalizeManifest(raw);
    const [widget] = result.components;
    expect(result.extractor).toBe('react-docgen');
    expect(widget.sourceFile).toBe('src/Widget/Widget.tsx');
    expect(widget.props.size).toEqual({ description: null, required: true });
    expect(result.tags['data-display-widget'].deprecated).toBe('use Gadget instead\nsince 2.0');
  });

  it('reads the payload the MCP serves when an entry carries two', () => {
    // No manifest measured carries both keys, so this guards a build that starts
    // emitting them rather than describing one that does. `@storybook/mcp` picks
    // `reactDocgen` first; reading the other would lint a payload no agent sees.
    const raw: RawManifest = {
      v: 0,
      components: {
        'data-display-widget': {
          id: 'data-display-widget',
          name: 'Widget',
          path: './src/Widget/Widget.stories.tsx',
          reactDocgen: {
            description: 'The payload the MCP reads.',
            props: { size: { description: 'From react-docgen.', required: true } },
          },
          reactDocgenTypescript: {
            description: 'The payload the MCP ignores.',
            props: { tone: { description: 'From react-docgen-typescript.', required: false } },
          },
        },
      },
    };

    const [widget] = normalizeManifest(raw).components;

    expect(Object.keys(widget.props)).toEqual(['size']);
    // Props are what the choice decides. Neither payload's description is read
    // at all, so it cannot stand in for the props here.
    expect(widget.description).toBeNull();
  });

  it('supports the react-component-meta payload shape', () => {
    // `features.experimentalReactComponentMeta` emits a plain v:0 manifest whose
    // payload key is neither of the other two. Reading it as a missing payload
    // reported every component as an extraction failure.
    const raw: RawManifest = {
      v: 0,
      meta: { docgen: 'react-component-meta' },
      components: {
        'data-display-widget': {
          id: 'data-display-widget',
          name: 'Widget',
          path: './src/Widget/Widget.stories.tsx',
          description: 'A widget.',
          jsDocTags: { deprecated: ['from the entry'] },
          reactComponentMeta: {
            filePath: '/repo/src/Widget/Widget.tsx',
            props: {
              size: {
                description: '',
                required: true,
                declarations: [{ fileName: 'src/Widget/Widget.tsx' }],
              },
            },
            // Real manifests carry the entry's tags here too, under `jsDocTags`
            // rather than `tags`, with identical values. The values are made to
            // disagree here so the assertion below can prove which copy is read.
            // `RawPayload` omits the field on purpose, so nothing reads tags off
            // the payload; the cast keeps the fixture on the real wire shape
            // without widening the type to allow it.
            jsDocTags: { deprecated: ['from the payload'] },
          } as RawPayload,
        },
      },
    };
    const result = normalizeManifest(raw);
    expect(result.failures).toHaveLength(0);
    expect(result.components).toHaveLength(1);
    const [widget] = result.components;
    expect(widget.description).toBe('A widget.');
    expect(widget.sourceFile).toBe('src/Widget/Widget.tsx');
    expect(widget.props.size).toEqual({ description: null, required: true });
    // Proves the entry's copy is the one read. Tags reaching this flavor depend
    // on it: the payload's own `jsDocTags` is never consulted, so if upstream
    // stopped mirroring tags onto the entry they would be dropped silently and
    // `@oversightIgnore` exemptions would stop applying.
    expect(result.tags['data-display-widget'].deprecated).toBe('from the entry');
  });

  it('infers react-component-meta from payload keys when meta is unrecorded', () => {
    const result = normalizeManifest({
      v: 0,
      meta: null,
      components: {
        'ui-x': { name: 'X', path: './x.stories.tsx', reactComponentMeta: { props: {} } },
        'ui-y': { name: 'Y', path: './y.stories.tsx', reactComponentMeta: { props: {} } },
      },
    });
    expect(result.extractor).toBe('react-component-meta');
  });

  it('clamps a component name to its first non-empty line (#30)', () => {
    const result = normalizeManifest({
      components: {
        'ui-x': { name: 'Old\nLegacy', path: './x.stories.tsx', reactDocgenTypescript: { props: {} } },
      },
    });
    expect(result.components[0].name).toBe('Old');
  });

  it('falls back to the manifest key for an empty name (#30)', () => {
    const result = normalizeManifest({
      components: {
        'ui-x': { name: '', path: './x.stories.tsx', reactDocgenTypescript: { props: {} } },
      },
    });
    expect(result.components[0].name).toBe('ui-x');
  });

  it('carries an unrecorded extractor through as null (guards #32)', () => {
    expect(normalizeManifest({ components: {} }).extractor).toBeNull();
  });

  it('infers the extractor from unanimous payload keys when meta is null (guards #32)', () => {
    const result = normalizeManifest({
      meta: null,
      components: {
        'ui-x': { name: 'X', path: './x.stories.tsx', reactDocgenTypescript: { props: {} } },
        'ui-y': { name: 'Y', path: './y.stories.tsx', reactDocgenTypescript: { props: {} } },
      },
    });
    expect(result.extractor).toBe('react-docgen-typescript');
  });

  it('treats an empty meta.docgen as unrecorded', () => {
    expect(normalizeManifest({ meta: { docgen: '' }, components: {} }).extractor).toBeNull();
  });

  it('leaves the extractor null when payload keys disagree', () => {
    const result = normalizeManifest({
      components: {
        'ui-a': { name: 'A', path: './a.stories.tsx', reactDocgenTypescript: { props: {} } },
        'ui-b': { name: 'B', path: './b.stories.tsx', reactDocgen: { props: {} } },
        'ui-c': { name: 'C', path: './c.stories.tsx', reactComponentMeta: { props: {} } },
      },
    });
    expect(result.extractor).toBeNull();
  });

  it('reads the entry description and never the payload one', () => {
    // The entry's is the field the server renders. Storybook fills it from
    // `metaJsDoc || docgenDescription` with the JSDoc tags stripped out into
    // `jsDocTags`, so when the payload is the source the entry is that payload
    // minus its tags, and falling back restored them: on the primer-react
    // entries behind #110 the whole payload description was a bare `@deprecated`
    // or a block of `@param`, and the rule took it for prose.
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          description: 'from entry',
          reactDocgenTypescript: { description: 'from payload', props: {} },
        },
        b: {
          name: 'B',
          path: './b.stories.tsx',
          description: '',
          reactDocgenTypescript: { description: '@deprecated', props: {} },
        },
      },
    });
    expect(result.components.find((c) => c.id === 'a')?.description).toBe('from entry');
    expect(result.components.find((c) => c.id === 'b')?.description).toBeNull();
  });

  it('normalizes a missing entry description to null over a payload that has one', () => {
    // The other shape the field arrives in. An absent key and an empty string
    // both mean "no description", and which one a build writes tracks whether
    // `extractComponentDescription` had a JSDoc comment to read at all, not the
    // manifest version: the fixtures here carry a v:0 entry with `description:
    // ''` and a v:1 index row with the key absent. The payload carries prose
    // rather than a tag, so the assertion fails if anything reads it.
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { description: 'Real prose, in the payload only.', props: {} },
        },
      },
    });
    expect(result.components[0].description).toBeNull();
  });

  it('collects entry-level jsDocTags for payload-less entries', () => {
    const result = normalizeManifest({
      components: {
        broken: {
          name: 'Broken',
          path: './broken.stories.tsx',
          jsDocTags: { oversightIgnore: ['docgen-missing'] },
          error: { message: 'no component file' },
        },
      },
    });
    expect(result.failures).toHaveLength(1);
    expect(result.tags['broken'].oversightIgnore).toBe('docgen-missing');
  });

  it('carries storiesFile and a stringified error on failures', () => {
    const result = normalizeManifest({
      components: {
        broken: {
          name: 'Broken',
          path: './broken.stories.tsx',
          error: { message: 'No component file found' },
        },
      },
    });
    const [failure] = result.failures;
    expect(failure.id).toBe('broken');
    expect(failure.storiesFile).toBe('./broken.stories.tsx');
    expect(failure.error).toContain('No component file found');
  });

  it('captures story-level errors, including on payload-less entries', () => {
    const result = normalizeManifest({
      components: {
        broken: {
          name: 'Broken',
          path: './broken.stories.tsx',
          error: { message: 'no component file' },
          stories: [
            {
              id: 'broken--all',
              name: 'All',
              error: { message: 'Could not generate snippet' },
            },
          ],
        },
      },
    });
    expect(result.storyFailures).toHaveLength(1);
    const [storyFailure] = result.storyFailures;
    expect(storyFailure.componentId).toBe('broken');
    expect(storyFailure.storyName).toBe('All');
    expect(storyFailure.error).toContain('Could not generate snippet');
  });

  it('passes sourceFile through when the repo root is undetectable', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { filePath: '/somewhere/A.tsx', props: {} },
        },
      },
    });
    expect(result.components[0].sourceFile).toBe('/somewhere/A.tsx');
  });

  it('ignores declarations that are not path-boundary suffixes', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: {
            filePath: '/repo/my-storybook/src/A.tsx',
            props: {
              x: {
                description: 'doc',
                required: false,
                // Suffix of the path but not on a path boundary, so it must not match.
                declarations: [{ fileName: 'storybook/src/A.tsx' }],
              },
            },
          },
        },
      },
    });
    expect(detectRepoRoot({ components: {} })).toBeNull();
    expect(result.components[0].sourceFile).toBe('/repo/my-storybook/src/A.tsx');
  });

  it("requires a ref index to be resolved first: refs are not normalize's job (#13)", async () => {
    // `stories` arrives as a { $ref } object rather than an array, and normalize
    // iterates it. resolveManifestRefs is what turns a v:1 index into the inline
    // shape; calling normalize on a raw index skips that step. Covering the throw
    // keeps the two steps from being silently collapsed: a caller that forgets to
    // hydrate gets an error, never a manifest that reads as empty.
    const refIndex = {
      v: 1,
      meta: { docgen: 'react-component-meta' },
      components: {
        'example-button': {
          id: 'example-button',
          name: 'Button',
          description: 'Primary UI component for user interaction',
          docgen: { $ref: '../services/core/docgen/example-button.json#/components/example-button' },
          stories: { $ref: '../services/core/story-docs/example-button.json#/components/example-button' },
        },
      },
    } as unknown as RawManifest;
    expect(() => normalizeManifest(refIndex)).toThrow();

    const resolved = await resolveManifestRefs(refIndex, () =>
      JSON.stringify({
        components: {
          'example-button': {
            path: './Button.stories.tsx',
            reactComponentMeta: { props: { label: { description: 'The text.', required: true } } },
            stories: { 'example-button--primary': { id: 'example-button--primary', name: 'Primary' } },
          },
        },
      }),
    );
    const result = normalizeManifest(resolved);
    expect(result.format).toBe('ref');
    expect(result.components).toHaveLength(1);
    expect(result.components[0].storiesFile).toBe('./Button.stories.tsx');
  });
});

describe('detectExtractorPrefix', () => {
  const evidence = (source: string, stories: string) => [{ source, stories }];

  it('strips the single segment react-docgen-typescript prepends', () => {
    expect(
      detectExtractorPrefix(evidence('my-project/stories/Badge/Badge.tsx', './stories/Badge/Badge.stories.tsx')),
    ).toBe('my-project/');
  });

  it('leaves a genuinely nested source alone, which the docstring promises', () => {
    // dropping one segment leaves "ui/src/Button", not "src/Button", so nothing vouches for a prefix
    expect(
      detectExtractorPrefix(evidence('packages/ui/src/Button/Button.tsx', './src/Button/Button.stories.tsx')),
    ).toBeNull();
  });

  it('does not match inside a path segment', () => {
    expect(
      detectExtractorPrefix(evidence('app/websrc/Button/Button.tsx', './src/Button/Button.stories.tsx')),
    ).toBeNull();
  });

  it('finds nothing to strip when the source is already repo-relative', () => {
    expect(detectExtractorPrefix(evidence('stories/Badge/Badge.tsx', './stories/Badge/Badge.stories.tsx'))).toBeNull();
  });

  it('leaves a source that does not sit beside its stories file alone', () => {
    expect(detectExtractorPrefix(evidence('myproj/src/Button.tsx', './stories/Button.stories.tsx'))).toBeNull();
  });

  it('strips nothing when entries disagree, rather than trimming some and not others', () => {
    expect(
      detectExtractorPrefix([
        { source: 'a/src/X/X.tsx', stories: './src/X/X.stories.tsx' },
        { source: 'b/src/Y/Y.tsx', stories: './src/Y/Y.stories.tsx' },
      ]),
    ).toBeNull();
  });

  it('agrees across entries that vouch for the same prefix', () => {
    expect(
      detectExtractorPrefix([
        { source: 'proj/src/X/X.tsx', stories: './src/X/X.stories.tsx' },
        { source: 'proj/src/Y/Y.tsx', stories: './src/Y/Y.stories.tsx' },
      ]),
    ).toBe('proj/');
  });
});
