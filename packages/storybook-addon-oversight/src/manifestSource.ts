import type { RawManifest } from 'oversight-core';

/**
 * How the panel and the Docs block both read the components manifest.
 *
 * The two run in different bundles, so each calls this once and gets its own
 * cache. What they share is the behavior, which was written twice and has to
 * stay identical: one load per page, a failed load never cached so a later
 * mount retries instead of being wedged in `unavailable` for the session, and
 * the real diagnosis kept for the state that reports it.
 *
 * The load itself is the seam. The runtimes differ in more than the URL they
 * resolve against: under `experimentalDocgenServer` the dev server refuses the
 * manifest route and the data lives behind each runtime's own service API, so
 * the whole transport is injected (`createManifestLoad` builds it) and this
 * module keeps only the cache policy and the failure accounting.
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
   * then the load that set it has settled.
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

/**
 * One load attempt's result. `manifest: null` is the failure signal; the other
 * fields carry what KIND of failure it was, so renders can tell a missing
 * manifest from a corrupt one.
 */
export type ManifestLoadOutcome = {
  manifest: RawManifest | null;
  unavailableReason?: string;
  parseFailed?: boolean;
};

/** A runtime's whole manifest transport. Resolves, never rejects, by contract;
 *  the source still catches a throw and reads it as an unavailable manifest. */
export type ManifestLoad = () => Promise<ManifestLoadOutcome>;

export function createManifestSource(io: { load: ManifestLoad; urlFor: (name: string) => string }): ManifestSource {
  let manifestPromise: Promise<RawManifest | null> | undefined;
  let unavailableReason: string | undefined;
  let parseFailed = false;

  async function attempt(): Promise<RawManifest | null> {
    // Reset per attempt, so a retry that fails differently (or succeeds)
    // reports the new outcome rather than the previous one.
    unavailableReason = undefined;
    parseFailed = false;
    const outcome = await io.load();
    unavailableReason = outcome.unavailableReason;
    parseFailed = outcome.parseFailed ?? false;
    return outcome.manifest;
  }

  function load(): Promise<RawManifest | null> {
    manifestPromise ??= attempt().then(
      (manifest) => {
        if (manifest === null) manifestPromise = undefined;
        return manifest;
      },
      (err) => {
        // The consumers fire load() at bundle eval with no rejection path, so
        // a loader that breaks its no-reject contract degrades to the
        // unavailable state instead of an unhandled rejection, and this log is
        // the only evidence of the real cause.
        manifestPromise = undefined;
        console.error('[storybook-addon-oversight] the components manifest load threw', err);
        return null;
      },
    );
    return manifestPromise;
  }

  return {
    load,
    urlFor: io.urlFor,
    unavailableReason: () => unavailableReason,
    parseFailed: () => parseFailed,
  };
}
