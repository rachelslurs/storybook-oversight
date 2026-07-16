/**
 * A deliberately small inline-markdown parser — just what component
 * descriptions use: `**bold**`, `*italic*`, `` `code` ``, and
 * `[label](?path=…)` links. Pure string logic (no React), so it runs under the
 * node test environment. Not a general markdown implementation.
 */
import { parsePathTargetId } from 'oversight-core';

export type InlineSegment =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; target: string };

// Order matters: `**` before `*` so bold wins over italic.
const TOKEN = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;

/** Only these target shapes are treated as links; other `[x](y)` stays text. */
function isLinkTarget(target: string): boolean {
  return target.startsWith('?path=/') || /^https?:\/\//.test(target);
}

export function parseInline(value: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let lastIndex = 0;
  const push = (text: string) => {
    if (text) segments.push({ type: 'text', text });
  };
  for (const match of value.matchAll(TOKEN)) {
    const [whole, bold, code, italic, linkLabel, linkTarget] = match;
    if (linkLabel !== undefined && !isLinkTarget(linkTarget)) continue; // literal text
    push(value.slice(lastIndex, match.index));
    if (bold !== undefined) segments.push({ type: 'bold', text: bold });
    else if (code !== undefined) segments.push({ type: 'code', text: code });
    else if (italic !== undefined) segments.push({ type: 'italic', text: italic });
    else segments.push({ type: 'link', label: linkLabel, target: linkTarget });
    lastIndex = match.index + whole.length;
  }
  push(value.slice(lastIndex));
  return segments;
}

/** Split markdown into paragraphs on blank lines. */
export function splitParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Extract the story/docs id from a Storybook path target like
 * `?path=/docs/forms-toggle--docs`. Returns null for anything else. Thin
 * re-export of the shared `core/pathLinks` grammar the linter also uses.
 */
export const storybookPathId = parsePathTargetId;
