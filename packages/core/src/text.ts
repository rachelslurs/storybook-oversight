/**
 * Manifest errors can embed stack traces or whole source files, and every
 * surface that shows one (finding messages, the panel's failure sections, the
 * manifest-status reason) renders a single line. Skipping empty lines keeps a
 * leading newline from blanking that line, and trimming keeps CRLF input from
 * leaving a stray carriage return. Returns null when no line has content, so
 * callers pick their own fallback.
 */
export function firstNonEmptyLine(text: string | null | undefined): string | null {
  for (const line of (text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Whole-token containment. "SyntaxError" inside "SyntaxErrorHandler" is a
 *  different token, so plain substring matching would treat an unrelated
 *  identifier as a duplicate and drop text that still adds information. */
function includesWord(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(haystack);
}

/**
 * One-line summary of a manifest error, from its `name` and message text.
 * Manifests put the diagnosis in either field: react-docgen-typescript
 * failures carry it in `name` ("react-docgen-typescript found no component
 * docs") while the message opens with a file path, and SyntaxError-style
 * failures carry it in the message while `name` is the bare class. Leading
 * with the name and appending the message's first line keeps the diagnosis
 * visible in both shapes; the append is skipped when either side already
 * contains the other as a whole token.
 */
export function summarizeError(name: string | null | undefined, message: string | null | undefined): string | null {
  const line = firstNonEmptyLine(message);
  const cleanName = firstNonEmptyLine(name);
  if (cleanName === null) return line;
  if (line === null || includesWord(cleanName, line)) return cleanName;
  if (includesWord(line, cleanName)) return line;
  return `${cleanName}: ${line}`;
}
