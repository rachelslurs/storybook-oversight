import type { RawManifest } from './types';

/**
 * Which manifest shape arrived. `unsupported` carries the version it saw so the
 * message can name it.
 */
export type ManifestFormat = { kind: 'inline' } | { kind: 'ref' } | { kind: 'unsupported'; version: number };

/**
 * The manifest's shape, from `v` alone.
 *
 * `meta.docgen` cannot do this. `experimentalDocgenServer` and
 * `experimentalReactComponentMeta` both report `react-component-meta`, and they
 * produce different shapes: the first a ref index, the second inline payloads.
 * Two paths in Storybook's React generator reach that same string, so a consumer
 * that keys off it mis-parses one of the two.
 *
 * An unrecognized version returns `unsupported` rather than throwing. The old
 * failure was a TypeError from iterating a `{ $ref }` object as an array, which
 * the panel could only render as a blank error state (#11).
 */
export function detectManifestFormat(raw: RawManifest): ManifestFormat {
  const version = raw.v;
  // A manifest predating the `v` field is the inline shape. A ref index without
  // its `v` would fail on the first `{ $ref }` the normalizer reached anyway.
  if (version === undefined || version === null) return { kind: 'inline' };
  if (version === 0) return { kind: 'inline' };
  if (version === 1) return { kind: 'ref' };
  return { kind: 'unsupported', version };
}
