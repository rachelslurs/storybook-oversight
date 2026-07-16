import { describe, expect, it } from 'vitest';
import { describeManifestUnavailable } from './manifestStatus';

describe('describeManifestUnavailable', () => {
  it('surfaces the experimentalDocgenServer dev-404 reason and points at storybook build', () => {
    const body = 'Manifest "components" is not available in dev when experimentalDocgenServer is enabled';
    const reason = describeManifestUnavailable(body);
    expect(reason).toContain('experimentalDocgenServer');
    expect(reason).toContain('storybook build');
    // Must NOT be the wrong "enable addon-mcp" hint.
    expect(reason).not.toMatch(/addon-mcp/i);
  });

  it('echoes a generic short body as the reason (first line only)', () => {
    expect(describeManifestUnavailable('Not Found\n<stack trace…>')).toBe('Not Found');
  });

  it('returns undefined for no usable explanation (falls back to the generic hint)', () => {
    expect(describeManifestUnavailable('')).toBeUndefined();
    expect(describeManifestUnavailable('   ')).toBeUndefined();
    expect(describeManifestUnavailable(undefined)).toBeUndefined();
    expect(describeManifestUnavailable('<!doctype html><html>…</html>')).toBeUndefined();
    expect(describeManifestUnavailable('x'.repeat(301))).toBeUndefined();
  });
});
