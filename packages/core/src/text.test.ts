import { describe, expect, it } from 'vitest';
import { firstNonEmptyLine, summarizeError } from './text';

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

describe('summarizeError', () => {
  it('leads with the name and appends the message first line', () => {
    expect(
      summarizeError('react-docgen-typescript found no component docs', 'File: /repo/src/index.js\nno docs here'),
    ).toBe('react-docgen-typescript found no component docs: File: /repo/src/index.js');
  });

  it('uses the message alone when there is no name', () => {
    expect(summarizeError(null, 'kaput\nat parse (/x:1:1)')).toBe('kaput');
    expect(summarizeError('', 'kaput')).toBe('kaput');
  });

  it('uses the name alone when there is no message', () => {
    expect(summarizeError('No component found', null)).toBe('No component found');
    expect(summarizeError('No component found', '\n \n')).toBe('No component found');
  });

  it('skips the append when the message line already carries the name', () => {
    expect(summarizeError('SyntaxError', 'SyntaxError: kaput\nstack')).toBe('SyntaxError: kaput');
  });

  it('skips the append when the name already carries the message line', () => {
    expect(summarizeError('Error: no docs', 'no docs')).toBe('Error: no docs');
  });

  it('matches on whole tokens, so a name embedded mid-word still leads', () => {
    expect(summarizeError('SyntaxError', 'Unexpected token in SyntaxErrorHandler.tsx')).toBe(
      'SyntaxError: Unexpected token in SyntaxErrorHandler.tsx',
    );
    expect(summarizeError('SyntaxErrorHandler failed', 'SyntaxError')).toBe('SyntaxErrorHandler failed: SyntaxError');
  });

  it('returns null when both sides are empty', () => {
    expect(summarizeError(null, null)).toBeNull();
    expect(summarizeError(undefined, '')).toBeNull();
  });
});
