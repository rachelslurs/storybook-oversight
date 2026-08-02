import { describeManifestUnavailable } from 'oversight-core';
import type { RawManifest } from 'oversight-core';

/**
 * How the panel and the Docs block both read the components manifest.
 *
 * The two run in different bundles, so each calls this once and gets its own
 * cache. What they share is the behavior, which was written twice and has to
 * stay identical: one fetch per page, a failed fetch never cached so a later
 * mount retries instead of being wedged in `unavailable` for the session, and
 * the real diagnosis kept for the state that reports it.
 *
 * `load()` resolves null for every failure rather than rejecting, because the
 * consumers fire it at bundle eval with no rejection path; the accessors below
 * carry what KIND of failure it was, so renders can tell a missing manifest
 * from a corrupt one.
 *
 * `resolveUrl` is the one thing that genuinely differs between them. The
 * manager resolves against the page it is on; the block resolves against the
 * iframe document it renders in.
 */
export type ManifestSource = {
  /** The manifest, or null when it could not be loaded. */
  load: () => Promise<RawManifest | null>;
  /** A sibling manifest URL, e.g. the debugger page. */
  urlFor: (name: string) => string;
  /**
   * Why the load failed, when we know better than the generic "enable the
   * manifest feature" hint: the server's own explanation, or the parse
   * diagnosis. Read at render, and meaningful only after a failed load: by
   * then the fetch that set it has settled.
   */
  unavailableReason: () => string | undefined;
  /**
   * True when the server answered 200 but the body would not parse. That is
   * the opposite diagnosis from `unavailable`, since a server that answers
   * evidently has the manifest feature enabled, so consumers with a
   * parse-error state route here instead. Same read-after-settle timing as
   * `unavailableReason`.
   */
  parseFailed: () => boolean;
};

export function createManifestSource(resolveUrl: (name: string) => string): ManifestSource {
  let manifestPromise: Promise<RawManifest | null> | undefined;
  let unavailableReason: string | undefined;
  let parseFailed = false;

  async function fetchManifest(): Promise<RawManifest | null> {
    // Reset per attempt, so a retry that fails differently (or succeeds)
    // reports the new outcome rather than the previous one.
    unavailableReason = undefined;
    parseFailed = false;
    let response: Response;
    try {
      response = await fetch(resolveUrl('components.json'));
    } catch {
      // The request never completed (server down, offline), so "unavailable"
      // is literally true and the browser has already logged the network
      // failure on its own; nothing truer to add.
      return null;
    }
    if (!response.ok) {
      unavailableReason = describeManifestUnavailable(await response.text().catch(() => ''));
      return null;
    }
    try {
      return (await response.json()) as RawManifest;
    } catch (err) {
      // A 200 whose body will not parse (a proxy's HTML error page, a
      // truncated write) is not a missing manifest: the feature answered, its
      // body was the problem, so the "enable addon-mcp" guess would be wrong.
      // The network tab shows this request as a success, which makes this log
      // the only evidence of the real cause; same convention as the analyze
      // step in useOversightReport.
      console.error('[storybook-addon-oversight] the components manifest was served but could not be parsed', err);
      parseFailed = true;
      unavailableReason =
        'The components manifest was served but could not be parsed. See the browser console for details.';
      return null;
    }
  }

  function load(): Promise<RawManifest | null> {
    manifestPromise ??= fetchManifest().then((manifest) => {
      if (manifest === null) manifestPromise = undefined;
      return manifest;
    });
    return manifestPromise;
  }

  return {
    load,
    urlFor: resolveUrl,
    unavailableReason: () => unavailableReason,
    parseFailed: () => parseFailed,
  };
}
