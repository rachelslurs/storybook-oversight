import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeManifest } from './normalize';
import { resolveManifestRefs } from './resolveRefs';
import type { RefLoader } from './resolveRefs';
import type { RawEntry, RawIndexEntry, RawManifest } from './types';

function loadIndex(fixture: string): RawManifest {
  const url = new URL(`../test/fixtures/${fixture}/manifests/components.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

/** The CLI's loader shape: leaf paths resolve against the index file's directory. */
function fsLoader(fixture: string): RefLoader {
  const indexUrl = new URL(`../test/fixtures/${fixture}/manifests/components.json`, import.meta.url);
  const indexDir = dirname(fileURLToPath(indexUrl));
  return (p) => readFileSync(resolve(indexDir, p), 'utf8');
}

/** The v1 index entry shape does not fit `RawEntry.stories`, hence the cast. */
function v1Manifest(entries: Record<string, RawIndexEntry>): RawManifest {
  return {
    v: 1,
    meta: { docgen: 'react-component-meta' },
    components: entries as unknown as Record<string, RawEntry>,
  };
}

function withDocgenRef(ref: string): Record<string, RawIndexEntry> {
  return { 'x-widget': { id: 'x-widget', name: 'Widget', docgen: { $ref: ref } } };
}

describe('resolveManifestRefs (fixture: v1 ref index)', () => {
  const raw = loadIndex('v1');

  it('resolves every ref into the inline entry shape', async () => {
    const resolved = await resolveManifestRefs(raw, fsLoader('v1'));
    const entries = Object.values(resolved.components ?? {});
    expect(entries).toHaveLength(6);
    for (const entry of entries) {
      expect(entry.reactComponentMeta).toBeDefined();
      expect(typeof entry.path).toBe('string');
      expect(entry.jsDocTags).toBeDefined();
      expect(Array.isArray(entry.stories)).toBe(true);
      expect(entry.refErrors).toBeUndefined();
    }
    const button = resolved.components?.['actions-button'];
    expect(button?.path).toBe('./stories/Button/Button.stories.tsx');
    expect(button?.reactComponentMeta?.props?.variant?.required).toBe(true);
    expect(button?.stories?.map((s) => s.id)).toEqual(['actions-button--primary', 'actions-button--secondary']);
  });

  it('keeps v and meta as-is', async () => {
    const resolved = await resolveManifestRefs(raw, fsLoader('v1'));
    expect(resolved.v).toBe(1);
    expect(resolved.meta).toBe(raw.meta);
  });

  it('feeds normalizeManifest without changes to it', async () => {
    const result = normalizeManifest(await resolveManifestRefs(raw, fsLoader('v1')));
    expect(result.components).toHaveLength(6);
    expect(result.failures).toHaveLength(0);
    expect(result.storyFailures).toHaveLength(0);
    expect(result.extractor).toBe('react-component-meta');
    expect(result.tags['layout-panel']?.oversightIgnore).toBe('prop-descriptions-missing');
    const button = result.components.find((c) => c.id === 'actions-button');
    expect(button?.storiesFile).toBe('./stories/Button/Button.stories.tsx');
  });

  it('loads each leaf file once', async () => {
    const calls: string[] = [];
    const inner = fsLoader('v1');
    await resolveManifestRefs(raw, (p) => {
      calls.push(p);
      return inner(p);
    });
    expect(calls).toHaveLength(12);
    expect(new Set(calls).size).toBe(12);
  });
});

describe('resolveManifestRefs (fixture: v1-dangling)', () => {
  const raw = loadIndex('v1-dangling');

  it('keeps path from the story-docs leaf when the docgen leaf is missing', async () => {
    const resolved = await resolveManifestRefs(raw, fsLoader('v1-dangling'));
    const banner = resolved.components?.['feedback-banner'];
    expect(banner?.reactComponentMeta).toBeUndefined();
    expect(banner?.path).toBe('./stories/Banner/Banner.stories.tsx');
    expect(Array.isArray(banner?.stories)).toBe(true);
    expect(banner?.refErrors).toBeDefined();
  });

  it('carries an error and no path when both leaves are missing', async () => {
    const resolved = await resolveManifestRefs(raw, fsLoader('v1-dangling'));
    const panel = resolved.components?.['layout-panel'];
    expect(panel?.reactComponentMeta).toBeUndefined();
    expect(panel?.path).toBeUndefined();
    expect(panel?.stories).toBeUndefined();
    expect(Array.isArray(panel?.refErrors)).toBe(true);
  });

  it('normalizes to two extraction failures, anchored where a path is known', async () => {
    const result = normalizeManifest(await resolveManifestRefs(raw, fsLoader('v1-dangling')));
    expect(result.components).toHaveLength(0);
    expect(result.failures).toHaveLength(2);
    // The entry carried no error of its own, so the ref failure becomes the
    // reason the extraction is reported as failed.
    const banner = result.failures.find((f) => f.id === 'feedback-banner');
    expect(banner?.storiesFile).toBe('./stories/Banner/Banner.stories.tsx');
    expect(banner?.error).toMatch(/failed to load/);
    const panel = result.failures.find((f) => f.id === 'layout-panel');
    expect(panel?.storiesFile).toBe('');
    expect(panel?.error).toMatch(/failed to load/);
  });
});

describe('resolveManifestRefs (synthetic: ref validation)', () => {
  it('refuses traversal and absolute refs without calling the loader', async () => {
    const refs = [
      '../../etc/passwd#/components/x',
      '../../../etc/passwd#/components/x',
      '/etc/passwd#/components/x',
      '../a/../../etc/passwd#/components/x',
    ];
    for (const ref of refs) {
      const calls: string[] = [];
      const resolved = await resolveManifestRefs(v1Manifest(withDocgenRef(ref)), (p) => {
        calls.push(p);
        return '{}';
      });
      expect(calls).toEqual([]);
      const entry = resolved.components?.['x-widget'];
      expect(entry?.reactComponentMeta).toBeUndefined();
      expect(String(entry?.refErrors)).toContain('refused');
    }
  });

  it('refuses URL refs and fragment-less refs', async () => {
    const refs = [
      'https://example.com/x.json#/components/x',
      'file:///x.json#/components/x',
      '//example.com/x.json#/components/x',
      '../services/core/docgen/x.json',
      '../services/core/docgen/x.json#',
    ];
    for (const ref of refs) {
      const calls: string[] = [];
      const resolved = await resolveManifestRefs(v1Manifest(withDocgenRef(ref)), (p) => {
        calls.push(p);
        return '{}';
      });
      expect(calls).toEqual([]);
      expect(String(resolved.components?.['x-widget']?.refErrors)).toContain('refused');
    }
  });

  it('allows one level above the index directory', async () => {
    const calls: string[] = [];
    const body = JSON.stringify({
      components: { 'x-widget': { path: './x.stories.tsx', reactComponentMeta: {} } },
    });
    const resolved = await resolveManifestRefs(
      v1Manifest(withDocgenRef('../services/core/docgen/x.json#/components/x-widget')),
      (p) => {
        calls.push(p);
        return body;
      },
    );
    expect(calls).toEqual(['../services/core/docgen/x.json']);
    expect(resolved.components?.['x-widget']?.reactComponentMeta).toBeDefined();
    expect(resolved.components?.['x-widget']?.refErrors).toBeUndefined();
  });

  it('isolates a refused ref to its own entry', async () => {
    const body = JSON.stringify({
      components: { good: { path: './good.stories.tsx', reactComponentMeta: {} } },
    });
    const resolved = await resolveManifestRefs(
      v1Manifest({
        bad: { id: 'bad', docgen: { $ref: '../../etc/passwd#/components/bad' } },
        good: { id: 'good', docgen: { $ref: '../services/core/docgen/good.json#/components/good' } },
      }),
      () => body,
    );
    expect(resolved.components?.bad?.refErrors).toBeDefined();
    expect(resolved.components?.good?.reactComponentMeta).toBeDefined();
    expect(resolved.components?.good?.refErrors).toBeUndefined();
  });
});

describe('resolveManifestRefs (synthetic: loading and pointers)', () => {
  it('loads a shared leaf file once and applies each pointer separately', async () => {
    const body = JSON.stringify({
      components: {
        one: { path: './one.stories.tsx', reactComponentMeta: { description: 'first' } },
        two: { path: './two.stories.tsx', reactComponentMeta: { description: 'second' } },
      },
    });
    let calls = 0;
    const resolved = await resolveManifestRefs(
      v1Manifest({
        one: { id: 'one', docgen: { $ref: '../services/core/docgen/shared.json#/components/one' } },
        two: { id: 'two', docgen: { $ref: '../services/./core/docgen/shared.json#/components/two' } },
      }),
      () => {
        calls += 1;
        return body;
      },
    );
    expect(calls).toBe(1);
    expect(resolved.components?.one?.reactComponentMeta?.description).toBe('first');
    expect(resolved.components?.two?.reactComponentMeta?.description).toBe('second');
  });

  it('degrades a throwing loader to an entry error', async () => {
    const resolved = await resolveManifestRefs(
      v1Manifest(withDocgenRef('../services/core/docgen/x.json#/components/x')),
      () => {
        throw new Error('boom: leaf unreachable');
      },
    );
    const error = String(resolved.components?.['x-widget']?.refErrors);
    expect(error).toContain('failed to load');
    expect(error).toContain('boom: leaf unreachable');
  });

  it('degrades invalid JSON to an entry error', async () => {
    const resolved = await resolveManifestRefs(
      v1Manifest(withDocgenRef('../services/core/docgen/x.json#/components/x')),
      () => 'not json',
    );
    expect(String(resolved.components?.['x-widget']?.refErrors)).toContain('failed to load');
  });

  it('keeps an HTML 404 body out of the error text', async () => {
    const html = '<!DOCTYPE html><html><body><h1>404 Not Found</h1></body></html>';
    const loaders: RefLoader[] = [
      () => {
        throw new Error(html);
      },
      () => html,
    ];
    for (const load of loaders) {
      const resolved = await resolveManifestRefs(
        v1Manifest(withDocgenRef('../services/core/docgen/x.json#/components/x')),
        load,
      );
      const error = String(resolved.components?.['x-widget']?.refErrors);
      expect(error).not.toContain('<');
      expect(error).not.toContain('404');
      expect(error).toContain('../services/core/docgen/x.json');
    }
  });

  it('treats an unresolved pointer as dangling', async () => {
    const resolved = await resolveManifestRefs(
      v1Manifest(withDocgenRef('../services/core/docgen/x.json#/components/ghost')),
      () => JSON.stringify({ components: {} }),
    );
    const entry = resolved.components?.['x-widget'];
    expect(entry?.reactComponentMeta).toBeUndefined();
    expect(String(entry?.refErrors)).toContain('does not resolve');
  });

  it('unescapes ~1 before ~0 in pointer tokens', async () => {
    const body = JSON.stringify({
      components: {
        'a/b': { reactComponentMeta: { description: 'slash' } },
        'x~1y': { reactComponentMeta: { description: 'tilde-one' } },
      },
    });
    const resolved = await resolveManifestRefs(
      v1Manifest({
        slash: { id: 'slash', docgen: { $ref: '../services/core/docgen/k.json#/components/a~1b' } },
        tilde: { id: 'tilde', docgen: { $ref: '../services/core/docgen/k.json#/components/x~01y' } },
      }),
      () => body,
    );
    expect(resolved.components?.slash?.reactComponentMeta?.description).toBe('slash');
    expect(resolved.components?.tilde?.reactComponentMeta?.description).toBe('tilde-one');
  });

  it('passes inline entries through untouched', async () => {
    const entry: RawEntry = {
      id: 'inline-one',
      name: 'Inline',
      path: './x.stories.tsx',
      reactComponentMeta: {},
      stories: [{ id: 'inline-one--default' }],
    };
    const calls: string[] = [];
    const resolved = await resolveManifestRefs({ v: 0, components: { 'inline-one': entry } }, (p) => {
      calls.push(p);
      return '{}';
    });
    expect(calls).toEqual([]);
    expect(resolved.components?.['inline-one']).toEqual(entry);
  });

  it('resolves a stories-only entry without fabricating a docgen error', async () => {
    const body = JSON.stringify({
      components: {
        solo: {
          path: './solo.stories.tsx',
          stories: { 'solo--default': { id: 'solo--default', name: 'Default', snippet: 'x' } },
        },
      },
    });
    const resolved = await resolveManifestRefs(
      v1Manifest({ solo: { id: 'solo', stories: { $ref: '../services/core/story-docs/solo.json#/components/solo' } } }),
      () => body,
    );
    const entry = resolved.components?.solo;
    expect(entry?.refErrors).toBeUndefined();
    expect(entry?.reactComponentMeta).toBeUndefined();
    expect(entry?.path).toBe('./solo.stories.tsx');
    expect(entry?.stories?.map((s) => s.id)).toEqual(['solo--default']);
  });
});
