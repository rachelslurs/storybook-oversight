import { describe, expect, it } from 'vitest';
import { ALL_RULES, fixFor, buildReport } from './index';
import type { RawManifest } from './index';

/**
 * docs/rules.md tells the reader a rule dictates the finding's severity, its
 * message and its one-line fix, and names `deprecated-tag` as the one rule
 * that reports a fact and so has no fix. These lock that sentence to the code.
 */
describe('what a rule dictates', () => {
  it('gives every rule a fix except deprecated-tag', () => {
    const without = ALL_RULES.filter((rule) => fixFor(rule) === undefined);
    expect(without).toEqual(['deprecated-tag']);
  });

  it('gives each fix as one line', () => {
    for (const rule of ALL_RULES) {
      const fix = fixFor(rule);
      if (fix === undefined) continue;
      expect(fix).not.toContain('\n');
      expect(fix.trim()).toBe(fix);
      expect(fix.length).toBeGreaterThan(0);
    }
  });

  // The map could be right while nothing read it, so this checks the wiring:
  // a real finding off a real manifest carries the fix, and a deprecated-tag
  // finding carries none.
  it('carries the fix onto the findings a manifest produces', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-a': {
          name: 'A',
          path: './A.stories.tsx',
          jsDocTags: { deprecated: 'Use B instead.' },
          reactDocgenTypescript: {
            description: 'A component.',
            props: { label: { description: '', required: true, declarations: [] } },
          },
        },
      },
    } as unknown as RawManifest;
    const { diagnostics } = buildReport(manifest, 'ex-a');

    const byRule = new Map(diagnostics.map((d) => [d.rule, d]));
    expect([...byRule.keys()].sort()).toContain('deprecated-tag');
    expect(byRule.get('deprecated-tag')?.fix).toBeUndefined();

    const required = byRule.get('required-prop-undocumented');
    expect(required?.fix).toBe(fixFor('required-prop-undocumented'));
    expect(required?.fix).toBeTruthy();

    // severity and message are required fields, so every finding has both
    for (const d of diagnostics) {
      expect(d.severity).toBeTruthy();
      expect(d.message.length).toBeGreaterThan(0);
    }
  });
});
