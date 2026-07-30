import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectManifestFormat } from './format';
import { lint } from './lint';
import { normalizeManifest } from './normalize';
import { resolveManifestRefs } from './resolveRefs';
import type { Diagnostic, RawManifest, RawPayload, RawProp } from './types';

const V1 = 'v1/manifests/components.json';
const V1_DANGLING = 'v1-dangling/manifests/components.json';
const V0_RCM = 'v0-react-component-meta/components.json';

function fixturePath(name: string): string {
  return new URL(`../test/fixtures/${name}`, import.meta.url).pathname;
}

/** Read a fixture, resolving refs from disk when it is a ref index. */
async function load(name: string): Promise<RawManifest> {
  const path = fixturePath(name);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawManifest;
  if (detectManifestFormat(raw).kind !== 'ref') return raw;
  const base = dirname(path);
  return resolveManifestRefs(raw, (target) => readFileSync(resolve(base, target), 'utf8'));
}

function payloadOf(entry: {
  reactDocgenTypescript?: RawPayload;
  reactDocgen?: RawPayload;
  reactComponentMeta?: RawPayload;
}) {
  return entry.reactDocgenTypescript ?? entry.reactDocgen ?? entry.reactComponentMeta;
}

/**
 * Mutate every payload of an already-resolved manifest. Applied after
 * resolution so the same mutation can be aimed at either format, which is what
 * lets the inline-scoping test below actually constrain the format gate.
 */
function mutatePayloads(manifest: RawManifest, fn: (payload: RawPayload) => void): RawManifest {
  for (const entry of Object.values(manifest.components ?? {})) {
    const payload = payloadOf(entry);
    if (payload) fn(payload);
  }
  return manifest;
}

const eachProp = (fn: (prop: RawProp) => void) => (payload: RawPayload) => {
  for (const prop of Object.values(payload.props ?? {})) fn(prop);
};

function comparable(diagnostics: Diagnostic[]): string[] {
  return diagnostics.map((d) => `${d.severity} ${d.rule} ${d.componentId ?? '(manifest)'} :: ${d.message}`).sort();
}

const rulesOf = (m: RawManifest) => lint(normalizeManifest(m)).map((d) => d.rule);
const shapeIssueOf = (m: RawManifest) =>
  lint(normalizeManifest(m)).find((d) => d.rule === 'manifest-shape-unrecognized');

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
  it('runs both prop rules while the payload keeps its fields', async () => {
    const result = normalizeManifest(await load(V1));
    expect(result.propShape).toBe('known');
    expect(result.shapeIssues).toEqual([]);
    expect(rulesOf(await load(V1))).toContain('prop-descriptions-missing');
  });

  it('holds both rules when no prop carries a string description', async () => {
    const m = mutatePayloads(
      await load(V1),
      eachProp((p) => delete p.description),
    );
    expect(normalizeManifest(m).propShape).toBe('unrecognized');
    expect(rulesOf(m)).not.toContain('prop-descriptions-missing');
    expect(rulesOf(m)).not.toContain('required-prop-undocumented');

    const issue = shapeIssueOf(m);
    expect(issue?.severity).toBe('warning');
    expect(issue?.componentId).toBeNull();
    expect(issue?.message).toMatch(/description/);
    // The skip is named, so the silence is not left to be noticed.
    expect(issue?.message).toMatch(/prop-descriptions-missing and required-prop-undocumented did not run/);
  });

  it('holds both rules when description is present but retyped', async () => {
    // Presence alone would pass this. `text()` would then read the object as
    // truthy, marking every prop documented and killing both rules in silence.
    const m = mutatePayloads(
      await load(V1),
      eachProp((p) => {
        (p as { description?: unknown }).description = { text: 'moved' };
      }),
    );
    expect(normalizeManifest(m).propShape).toBe('unrecognized');
    expect(rulesOf(m)).not.toContain('prop-descriptions-missing');
    expect(shapeIssueOf(m)?.message).toMatch(/description/);
  });

  it('holds both rules when required is present but retyped', async () => {
    // The half that guards the error-severity, CI-gating rule. A string
    // "required" fails `=== true`, so every prop would read as optional.
    const m = mutatePayloads(
      await load(V1),
      eachProp((p) => {
        (p as { required?: unknown }).required = 'true';
      }),
    );
    expect(normalizeManifest(m).propShape).toBe('unrecognized');
    expect(rulesOf(m)).not.toContain('required-prop-undocumented');
    expect(shapeIssueOf(m)?.message).toMatch(/required/);
  });

  it('holds both rules when the props container itself is renamed', async () => {
    // Zero props read as a library that takes none, which passes. The container
    // gets the same key check as the fields inside it.
    const m = mutatePayloads(await load(V1), (payload) => {
      (payload as { properties?: unknown }).properties = payload.props;
      delete payload.props;
    });
    expect(normalizeManifest(m).propShape).toBe('unrecognized');
    expect(rulesOf(m)).not.toContain('prop-descriptions-missing');
    expect(shapeIssueOf(m)?.message).toMatch(/props/);
  });

  it('keeps reporting when only some props lack the field: that is undocumented, not renamed', async () => {
    // One prop anywhere carrying the field proves it still exists, so a prop
    // missing it reads as undocumented.
    const m = mutatePayloads(await load(V1), (payload) => {
      const first = Object.values(payload.props ?? {})[0];
      if (first) delete first.description;
    });
    expect(normalizeManifest(m).propShape).toBe('known');
    expect(rulesOf(m)).toContain('prop-descriptions-missing');
  });

  it('tolerates unknown extra keys, since additive changes are the common case', async () => {
    const m = mutatePayloads(
      await load(V1),
      eachProp((p) => {
        (p as { someNewUpstreamField?: number }).someNewUpstreamField = 1;
      }),
    );
    expect(normalizeManifest(m).propShape).toBe('known');
    expect(normalizeManifest(m).shapeIssues).toEqual([]);
  });

  it('passes a library that genuinely takes no props', async () => {
    const m = mutatePayloads(await load(V1), (payload) => {
      payload.props = {};
    });
    expect(normalizeManifest(m).propShape).toBe('known');
    expect(normalizeManifest(m).shapeIssues).toEqual([]);
  });

  it('stays off on an inline manifest, where react-docgen may omit description', async () => {
    // The same mutation that trips the guard on a ref manifest must not trip it
    // here: react-docgen declares `description` optional on its own descriptor.
    const m = mutatePayloads(
      await load(V0_RCM),
      eachProp((p) => delete p.description),
    );
    const result = normalizeManifest(m);
    expect(result.format).toBe('inline');
    expect(result.propShape).toBe('known');
    expect(rulesOf(m)).toContain('prop-descriptions-missing');
  });

  it('survives a malformed prop instead of losing every diagnostic', async () => {
    // Dereferencing a null prop threw out of the whole normalizer, so one bad
    // entry cost the entire manifest's findings.
    const m = mutatePayloads(await load(V1), (payload) => {
      (payload.props as Record<string, unknown>).busted = null;
    });
    expect(() => normalizeManifest(m)).not.toThrow();
    expect(normalizeManifest(m).components).toHaveLength(6);
  });
});

describe('unresolved refs', () => {
  it('reports a component whose docgen ref resolved but whose stories ref did not', async () => {
    // The entry survives with a payload, which is why this needs its own
    // channel: normalize reads entry.error only on payload-less entries.
    const path = fixturePath(V1_DANGLING);
    const base = dirname(path);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as RawManifest;
    const resolved = await resolveManifestRefs(raw, (target) => {
      if (target.includes('story-docs')) throw new Error('ENOENT: no such file');
      return readFileSync(resolve(base, '../../v1/manifests', target), 'utf8');
    });
    const issue = shapeIssueOf(resolved);
    expect(issue?.componentId).toBe('feedback-banner');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toMatch(/\$ref/);
    // One line only: this message reaches a step-summary table row (#30).
    expect(issue?.message).not.toMatch(/\n/);
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

  it('does not blame refs for an inline entry that carries an error', async () => {
    // A v:0 manifest has no refs to fail, so the ref-worded finding must not
    // appear on one.
    const inline = await load(V0_RCM);
    const entry = Object.values(inline.components ?? {})[0];
    entry.error = { message: 'story indexer warning' };
    expect(shapeIssueOf(inline)).toBeUndefined();
  });
});
