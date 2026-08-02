import { describeManifestUnavailable } from 'oversight-core';
import type { RawManifest } from 'oversight-core';

/**
 * How the panel and the Docs block both read the components manifest.
 *
 * The two run in different bundles, so each calls this once and gets its own
 * cache. What they share is the behaviour, which was written twice and has to
 * stay identical: one fetch per page, a failed fetch never cached so a later
 * mount retries instead of being wedged in `unavailable` for the session, and
 * the server's own explanation kept for the state that reports it.
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
   * Why the load failed, when the server said. Read at render, and meaningful
   * only in the `unavailable` state: by then the fetch that set it has settled.
   */
  unavailableReason: () => string | undefined;
};

export function createManifestSource(resolveUrl: (name: string) => string): ManifestSource {
  let manifestPromise: Promise<RawManifest | null> | undefined;
  let unavailableReason: string | undefined;

  async function fetchManifest(): Promise<RawManifest | null> {
    try {
      const response = await fetch(resolveUrl('components.json'));
      if (!response.ok) {
        unavailableReason = describeManifestUnavailable(await response.text().catch(() => ''));
        return null;
      }
      unavailableReason = undefined;
      return (await response.json()) as RawManifest;
    } catch {
      unavailableReason = undefined;
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

  return { load, urlFor: resolveUrl, unavailableReason: () => unavailableReason };
}
