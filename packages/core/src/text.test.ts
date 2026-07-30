import { describe, expect, it } from 'vitest';
import { firstNonEmptyLine, summarizeError } from './text';

describe('firstNonEmptyLine', () => {
  it('returns the first line with content, trimmed', () => {
    expect(firstNonEmptyLine('one\ntwo')).toBe('one');
    expect(firstNonEmptyLine('\n\n  two  \nthree')).toBe('two');
    expect(firstNonEmptyLine('one\r\ntwo')).toBe('one');
  });

  it('treats a lone carriage return as a line break', () => {
    expect(firstNonEmptyLine('one\rtwo')).toBe('one');
    expect(firstNonEmptyLine('\rtwo')).toBe('two');
  });

  it('returns null when nothing has content', () => {
    expect(firstNonEmptyLine('')).toBeNull();
    expect(firstNonEmptyLine(' \n\t')).toBeNull();
    expect(firstNonEmptyLine(null)).toBeNull();
    expect(firstNonEmptyLine(undefined)).toBeNull();
  });
});

describe('summarizeError', () => {
  it('leads with the name and appends the message diagnosis line', () => {
    expect(
      summarizeError('react-docgen-typescript found no component docs', 'File: /repo/src/index.js\nno docs here'),
    ).toBe('react-docgen-typescript found no component docs: no docs here');
  });

  it('skips a leading file-location line when picking the message line (#44)', () => {
    expect(summarizeError(null, 'File: /repo/src/index.js\nno docs here')).toBe('no docs here');
  });

  it('skips a bare Error: label line, the react-docgen shape (#44)', () => {
    expect(
      summarizeError(
        'No component definition found',
        'File: /a/index.ts\nError:\nNo suitable component definition found.',
      ),
    ).toBe('No component definition found: No suitable component definition found.');
  });

  it('keeps the location when the message holds nothing else', () => {
    expect(summarizeError(null, 'File: /repo/src/index.js')).toBe('File: /repo/src/index.js');
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
