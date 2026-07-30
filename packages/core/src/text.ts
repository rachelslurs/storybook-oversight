/**
 * Manifest errors can embed stack traces or whole source files, and every
 * surface that shows one (finding messages, the panel's failure sections, the
 * manifest-status reason) renders a single line. Splitting on `\r?\n|\r`
 * keeps a lone carriage return from riding into that line, where a terminal
 * renders it as an overprint. Skipping empty lines keeps a leading newline
 * from blanking the line. Returns null when no line has content, so callers
 * pick their own fallback.
 */
export function firstNonEmptyLine(text: string | null | undefined): string | null {
  for (const line of (text ?? '').split(/\r?\n|\r/)) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** A message line that locates or labels the error without diagnosing it. The
 *  react-docgen-typescript failures in the audited manifests open the message
 *  with `File: <path>`, and the react-docgen ones follow it with a bare
 *  `Error:` label, with the diagnosis on the line after. */
const PRELUDE_LINE = /^(File:\s*\S+|Error:)$/;

/** The message's first non-empty line that is not a location or label
 *  prelude. When every line is prelude, the first one beats returning
 *  nothing. */
function diagnosisLine(message: string | null | undefined): string | null {
  let prelude: string | null = null;
  for (const line of (message ?? '').split(/\r?\n|\r/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (PRELUDE_LINE.test(trimmed)) {
      prelude ??= trimmed;
      continue;
    }
    return trimmed;
  }
  return prelude;
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
 * docs") while the message opens with a `File: <path>` location, and
 * SyntaxError-style failures carry it in the message while `name` is the bare
 * class. Leading with the name and appending the message's first line past
 * any location or label prelude keeps the diagnosis visible in both shapes,
 * and keeps the summary identical across entries that share a diagnosis but
 * not a path (#44). The append is skipped when either side already contains
 * the other as a whole token.
 */
export function summarizeError(name: string | null | undefined, message: string | null | undefined): string | null {
  const line = diagnosisLine(message);
  const cleanName = firstNonEmptyLine(name);
  if (cleanName === null) return line;
  if (line === null || includesWord(cleanName, line)) return cleanName;
  if (includesWord(line, cleanName)) return line;
  return `${cleanName}: ${line}`;
}
