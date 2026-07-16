import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectRepoRoot, normalizeManifest } from './normalize';
import type { RawManifest } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../../test/fixtures/components.json', import.meta.url);
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
    expect(button?.sourceFile).toBe('storybook/src/Button/Button.tsx');
    expect(button?.storiesFile).toBe('./src/Button/Button.stories.tsx');
    const spinner = result.components.find((c) => c.id === 'feedback-spinner');
    expect(spinner?.sourceFile).toBe('storybook/src/Spinner/Spinner.tsx');
    expect(spinner?.storiesFile).toBe('./src/Spinner/Spinner.stories.tsx');
  });

  it('handles zero-prop components via the manifest-wide repo root', () => {
    const spinner = result.components.find((c) => c.id === 'feedback-spinner');
    expect(spinner?.props).toEqual({});
    expect(spinner?.sourceFile).toBe('storybook/src/Spinner/Spinner.tsx');
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
    expect(widget.extractor).toBe('react-docgen');
    expect(widget.sourceFile).toBe('storybook/src/Widget/Widget.tsx');
    expect(widget.props.size).toEqual({ description: null, required: true });
    expect(result.tags['data-display-widget'].deprecated).toBe('use Gadget instead\nsince 2.0');
  });

  it('prefers entry.description over payload.description', () => {
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
          reactDocgenTypescript: { description: 'from payload', props: {} },
        },
      },
    });
    expect(result.components.find((c) => c.id === 'a')?.description).toBe('from entry');
    expect(result.components.find((c) => c.id === 'b')?.description).toBe('from payload');
  });

  it('normalizes an empty payload-level description to null', () => {
    const result = normalizeManifest({
      components: {
        a: {
          name: 'A',
          path: './a.stories.tsx',
          reactDocgenTypescript: { description: '', props: {} },
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
                // Suffix of the path but not on a path boundary — must not match.
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

  it('throws on the ref-based index shape (experimentalDocgenServer, not yet supported)', () => {
    // Storybook's experimentalDocgenServer emits a lightweight index whose entries
    // point at per-component files via $ref, and `stories` is a { $ref } object
    // rather than an array. normalize iterates `stories`, so it throws on this
    // shape. The manager panel and docs block catch this and show an error state
    // (#11); teaching normalize to read the ref format is tracked in #13, which
    // will replace this expectation.
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
  });
});
