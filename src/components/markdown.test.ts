import { describe, expect, it } from 'vitest';
import { parseInline, splitParagraphs, storybookPathId } from './markdown';

describe('parseInline', () => {
  it('passes plain text through', () => {
    expect(parseInline('just text')).toEqual([{ type: 'text', text: 'just text' }]);
  });

  it('parses bold, italic, and code', () => {
    expect(parseInline('**When to use:** a *filter* set with `isIndeterminate`.')).toEqual([
      { type: 'bold', text: 'When to use:' },
      { type: 'text', text: ' a ' },
      { type: 'italic', text: 'filter' },
      { type: 'text', text: ' set with ' },
      { type: 'code', text: 'isIndeterminate' },
      { type: 'text', text: '.' },
    ]);
  });

  it('parses ?path= links and leaves non-link brackets as text', () => {
    const segs = parseInline('use [Toggle](?path=/docs/forms-toggle--docs) not columns[0](x)');
    expect(segs[0]).toEqual({ type: 'text', text: 'use ' });
    expect(segs[1]).toEqual({
      type: 'link',
      label: 'Toggle',
      target: '?path=/docs/forms-toggle--docs',
    });
    expect(segs[2]).toEqual({ type: 'text', text: ' not columns[0](x)' });
  });

  it('prefers bold over italic for double asterisks', () => {
    expect(parseInline('**x**')).toEqual([{ type: 'bold', text: 'x' }]);
  });
});

describe('splitParagraphs', () => {
  it('splits on blank lines and trims', () => {
    expect(splitParagraphs('one\n\ntwo\n\n\nthree')).toEqual(['one', 'two', 'three']);
  });
});

describe('storybookPathId', () => {
  it('extracts docs/story ids and rejects other targets', () => {
    expect(storybookPathId('?path=/docs/forms-toggle--docs')).toBe('forms-toggle--docs');
    expect(storybookPathId('https://example.com')).toBeNull();
  });
});
