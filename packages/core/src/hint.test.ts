import { describe, expect, it } from 'vitest';
import { ALL_RULES, hintFor, buildReport } from './index';
import type { RawManifest } from './index';

/**
 * docs/rules.md tells the reader a rule dictates the finding's severity, its
 * message and its one-line hint, and names `deprecated-tag` as the one rule
 * that reports a fact and so has no hint. These lock that sentence to the code.
 */
describe('what a rule dictates', () => {
  it('gives every rule a hint except deprecated-tag', () => {
    const without = ALL_RULES.filter((rule) => hintFor(rule) === undefined);
    expect(without).toEqual(['deprecated-tag']);
  });

  it('gives each hint as one line', () => {
    for (const rule of ALL_RULES) {
      const hint = hintFor(rule);
      if (hint === undefined) continue;
      expect(hint).not.toContain('\n');
      expect(hint.trim()).toBe(hint);
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  // The map could be right while nothing read it, so this checks the wiring:
  // a real finding off a real manifest carries the hint, and a deprecated-tag
  // finding carries none.
  it('carries the hint onto the findings a manifest produces', () => {
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
    const { findings } = buildReport(manifest, 'ex-a');

    const byRule = new Map(findings.map((d) => [d.rule, d]));
    expect([...byRule.keys()].sort()).toContain('deprecated-tag');
    expect(byRule.get('deprecated-tag')?.hint).toBeUndefined();

    const required = byRule.get('required-prop-undocumented');
    expect(required?.hint).toBe(hintFor('required-prop-undocumented'));
    expect(required?.hint).toBeTruthy();

    // severity and message are required fields, so every finding has both
    for (const d of findings) {
      expect(d.severity).toBeTruthy();
      expect(d.message.length).toBeGreaterThan(0);
    }
  });
});
