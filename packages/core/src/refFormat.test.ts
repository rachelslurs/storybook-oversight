import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectManifestFormat } from './format';
import { lint } from './lint';
import { normalizeManifest } from './normalize';
import { resolveManifestRefs } from './resolveRefs';
import type { Diagnostic, RawManifest } from './types';

const V1 = 'v1/manifests/components.json';
const V1_DANGLING = 'v1-dangling/manifests/components.json';
const V0_RCM = 'v0-react-component-meta/components.json';

function fixturePath(name: string): string {
  return new URL(`../test/fixtures/${name}`, import.meta.url).pathname;
}

/** Read a fixture, resolving refs from disk when it is a ref index. */
async function load(name: string, mutate?: (leaf: unknown) => void): Promise<RawManifest> {
  const path = fixturePath(name);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawManifest;
  if (detectManifestFormat(raw).kind !== 'ref') return raw;
  const base = dirname(path);
  return resolveManifestRefs(raw, (target) => {
    const leaf = JSON.parse(readFileSync(resolve(base, target), 'utf8')) as unknown;
    mutate?.(leaf);
    return JSON.stringify(leaf);
  });
}

function propsOf(leaf: unknown): Record<string, Record<string, unknown>>[] {
  const components = (leaf as { components?: Record<string, { reactComponentMeta?: { props?: object } }> }).components;
  return Object.values(components ?? {})
    .map((c) => c.reactComponentMeta?.props)
    .filter(Boolean) as Record<string, Record<string, unknown>>[];
}

function comparable(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.rule} ${d.componentId ?? '(manifest)'} :: ${d.message}`).sort();
}

describe('ref manifests reach the same verdict as inline ones', () => {
  it('produces diagnostics identical to the v:0 react-component-meta build', async () => {
    // Both fixtures describe the same six components from the same build, one
    // inline and one behind refs, so any difference is a resolver defect. The
    // prop rules are included: holding them here would have made this assertion
    // weaker than the bug it exists to catch.
    const inline = normalizeManifest(await load(V0_RCM));
    const ref = normalizeManifest(await load(V1));

    expect(ref.format).toBe('ref');
    expect(inline.format).toBe('inline');
    expect(comparable(lint(ref))).toEqual(comparable(lint(inline)));
    expect(comparable(lint(ref))).not.toHaveLength(0);
  });

  it('recovers sourceFile and storiesFile through the refs', async () => {
    const result = normalizeManifest(await load(V1));
    // detectRepoRoot needs an absolute filePath and repo-relative declarations,
    // both of which live in the leaf rather than the index.
    expect(result.components.map((c) => c.sourceFile)).toEqual(
      result.components.map((c) => `stories/${c.name}/${c.name}.tsx`),
    );
    // `path` is absent from a v:1 index entry; CI annotations anchor on it.
    expect(result.components.every((c) => c.storiesFile.endsWith('.stories.tsx'))).toBe(true);
  });
});

describe('the prop shape guard', () => {
  it('runs both prop rules while the payload keeps its keys', async () => {
    const result = normalizeManifest(await load(V1));
    expect(result.propShape).toBe('known');
    expect(result.shapeIssues).toEqual([]);
    expect(lint(result).map((d) => d.rule)).toContain('prop-descriptions-missing');
  });

  it('holds both prop rules when no prop anywhere carries a description key', async () => {
    const result = normalizeManifest(
      await load(V1, (leaf) => {
        for (const props of propsOf(leaf)) for (const prop of Object.values(props)) delete prop.description;
      }),
    );
    expect(result.propShape).toBe('unrecognized');

    const rules = lint(result).map((d) => d.rule);
    expect(rules).not.toContain('prop-descriptions-missing');
    expect(rules).not.toContain('required-prop-undocumented');

    // The silence is stated rather than left to be noticed.
    const issue = lint(result).find((d) => d.rule === 'manifest-shape-unrecognized');
    expect(issue?.severity).toBe('warning');
    expect(issue?.componentId).toBeNull();
    expect(issue?.message).toMatch(/description/);
  });

  it('keeps reporting when only some props lack the key: that is undocumented, not renamed', async () => {
    // One prop anywhere carrying the key proves the field still exists, so a
    // prop missing it reads as undocumented rather than tripping the guard.
    const result = normalizeManifest(
      await load(V1, (leaf) => {
        for (const props of propsOf(leaf)) {
          const first = Object.values(props)[0];
          if (first) delete first.description;
        }
      }),
    );
    expect(result.propShape).toBe('known');
    expect(lint(result).map((d) => d.rule)).toContain('prop-descriptions-missing');
  });

  it('tolerates unknown extra keys, since additive changes are the common case', async () => {
    const result = normalizeManifest(
      await load(V1, (leaf) => {
        for (const props of propsOf(leaf)) for (const prop of Object.values(props)) prop.someNewUpstreamField = 1;
      }),
    );
    expect(result.propShape).toBe('known');
    expect(result.shapeIssues).toEqual([]);
  });

  it('stays inert on an inline manifest, where react-docgen may omit description', async () => {
    const result = normalizeManifest(await load(V0_RCM));
    expect(result.format).toBe('inline');
    expect(result.propShape).toBe('known');
  });
});

describe('unresolved refs', () => {
  it('reports a component whose docgen ref resolved but whose stories ref did not', async () => {
    // feedback-banner keeps only its story-docs leaf in this fixture, so the
    // reverse case is covered below. Here the entry survives with a payload,
    // which is why the failure needs its own channel: normalize only reads
    // entry.error on payload-less entries.
    const path = fixturePath(V1_DANGLING);
    const base = dirname(path);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RawManifest;
    const resolved = await resolveManifestRefs(raw, (target) => {
      if (target.includes('story-docs')) throw new Error('ENOENT');
      // Serve every docgen ref from the complete tree so the payload survives.
      return readFileSync(resolve(base, '../../v1/manifests', target), 'utf8');
    });
    const result = normalizeManifest(resolved);
    const issue = lint(result).find((d) => d.rule === 'manifest-shape-unrecognized');
    expect(issue?.componentId).not.toBeNull();
    expect(issue?.severity).toBe('warning');
  });

  it('keeps storiesFile when the docgen leaf is the missing one', async () => {
    const result = normalizeManifest(await load(V1_DANGLING));
    const banner = result.failures.find((f) => f.id === 'feedback-banner');
    // The story-docs leaf is the only survivor, and it carries the same `path`.
    expect(banner?.storiesFile).toBe('./stories/Banner/Banner.stories.tsx');

    const panel = result.failures.find((f) => f.id === 'layout-panel');
    expect(panel?.storiesFile).toBe('');
    expect(lint(result).filter((d) => d.rule === 'docgen-missing')).toHaveLength(2);
  });
});
