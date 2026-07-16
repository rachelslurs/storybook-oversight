/**
 * A user-facing reason the components manifest didn't load, derived from the
 * failed fetch's response body.
 *
 * Oversight's whole value is telling the truth about why documentation is
 * missing, so when the server explains itself we surface its words instead of
 * guessing. In particular, Storybook's `experimentalDocgenServer` returns a dev
 * 404 whose body says exactly why ("…not available in dev when
 * experimentalDocgenServer is enabled"). That beats the default "enable
 * @storybook/addon-mcp" hint, which is simply wrong when addon-mcp is already on.
 *
 * Returns `undefined` when there's no usable explanation (empty body, an HTML
 * error page, an oversized body), so callers fall back to the generic hint.
 */
export function describeManifestUnavailable(body: string | undefined): string | undefined {
  const text = (body ?? '').trim();
  // No body, an HTML error page, or an oversized payload isn't a human-readable
  // reason; let the caller use its generic hint.
  if (!text || text.startsWith('<') || text.length > 300) return undefined;
  const reason = text.split('\n', 1)[0].trim();
  if (!reason) return undefined;
  // The docgen-server manifest is only written on `storybook build`; point there
  // so the message is actionable, not just diagnostic. (Plain-text output: the
  // panel renders it as-is, so no markdown or backticks in the string.)
  return /experimentalDocgenServer/i.test(reason)
    ? `${reason}. It is written on "storybook build", not served in dev.`
    : reason;
}
