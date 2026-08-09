import { describe, expect, it } from 'vitest';
import { fenceFor } from './agentView';

describe('fenceFor', () => {
  it('uses four tildes when nothing in the text competes with them', () => {
    expect(fenceFor('# Button', 'plain text')).toBe('~~~~');
  });

  it('outgrows a tilde fence the text carries, on either section', () => {
    // `formatDocsManifest` interpolates a docs page's own content, so the text
    // can hold a fence of its own. A four-tilde wrapper would close there.
    expect(fenceFor('~~~~', 'text')).toBe('~~~~~');
    expect(fenceFor('text', 'before\n~~~~~~\nafter')).toBe('~~~~~~~');
  });

  it('ignores tildes that are not a fence line', () => {
    expect(fenceFor('a ~~~~ mid-line', '~~~ three')).toBe('~~~~');
  });

  it('counts a fence indented up to three spaces, which still closes a block', () => {
    expect(fenceFor('- item:\n  ~~~~\n  code\n  ~~~~', 'text')).toBe('~~~~~');
  });

  it('ignores a tilde run indented four spaces, which is a code block, not a fence', () => {
    expect(fenceFor('    ~~~~', 'text')).toBe('~~~~');
  });
});
