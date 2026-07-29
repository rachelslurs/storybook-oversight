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
