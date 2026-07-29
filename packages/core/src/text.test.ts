import { describe, expect, it } from 'vitest';
import { firstNonEmptyLine } from './text';

describe('firstNonEmptyLine', () => {
  it('returns the first line with content, trimmed', () => {
    expect(firstNonEmptyLine('one\ntwo')).toBe('one');
    expect(firstNonEmptyLine('\n\n  two  \nthree')).toBe('two');
    expect(firstNonEmptyLine('one\r\ntwo')).toBe('one');
  });

  it('returns null when nothing has content', () => {
    expect(firstNonEmptyLine('')).toBeNull();
    expect(firstNonEmptyLine(' \n\t')).toBeNull();
    expect(firstNonEmptyLine(null)).toBeNull();
    expect(firstNonEmptyLine(undefined)).toBeNull();
  });
});
