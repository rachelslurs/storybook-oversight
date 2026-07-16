import { describe, expect, it } from 'vitest';
import { parsePathTargetId, pathLinkPattern } from './pathLinks';

describe('parsePathTargetId', () => {
  it('extracts the id from docs and story targets', () => {
    expect(parsePathTargetId('?path=/docs/forms-toggle--docs')).toBe('forms-toggle--docs');
    expect(parsePathTargetId('?path=/story/forms-toggle--primary')).toBe('forms-toggle--primary');
  });

  it("returns null for anything that isn't a docs/story path target", () => {
    expect(parsePathTargetId('https://example.com')).toBeNull();
    expect(parsePathTargetId('?path=/settings/about')).toBeNull();
    expect(parsePathTargetId('forms-toggle--docs')).toBeNull();
    // Anchored: a trailing segment must not match.
    expect(parsePathTargetId('?path=/docs/a/b')).toBeNull();
  });

  it("shares its grammar with the prose-scan pattern (they can't drift)", () => {
    const prose = 'See [Toggle](?path=/docs/forms-toggle--docs) and [Badge](?path=/docs/data-display-badge--docs).';
    const ids = [...prose.matchAll(pathLinkPattern())].map((m) => m[1]);
    expect(ids).toEqual(['forms-toggle--docs', 'data-display-badge--docs']);
    // Every scanned target round-trips through the single-target parser.
    for (const id of ids) {
      expect(parsePathTargetId(`?path=/docs/${id}`)).toBe(id);
    }
  });
});
