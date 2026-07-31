import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { detectManifestFormat, resolveManifestRefs } from 'oversight-core';
import type { RawManifest } from 'oversight-core';

/** A manifest that could not be read or parsed. Maps to CLI exit code 2. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function readManifest(path: string): RawManifest {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      throw new ManifestError(
        `No components manifest at ${path}.\n` +
          `Storybook 10.3 and later emit one when \`features.componentsManifest\` is enabled in .storybook/main.ts. @storybook/addon-mcp enables it for you.\n` +
          `Storybook 10.1 and 10.2 emit one only behind \`features.experimentalComponentsManifest\`, renamed at 10.3.0 with no alias; those manifests lint but are unsupported.\n` +
          `Below Storybook 10.1 no configuration produces a components manifest.\n` +
          `If the manifest is built and this path is wrong, pass an explicit path.\n` +
          `(experimentalDocgenServer writes its manifest only on \`storybook build\`, not in dev.)`,
      );
    }
    throw new ManifestError(`Could not read ${path}: ${e.message}`);
  }
  try {
    return JSON.parse(raw) as RawManifest;
  } catch (err) {
    throw new ManifestError(`Could not parse ${path} as JSON: ${(err as Error).message}`);
  }
}

/**
 * Resolve a ref-based (`v: 1`) index into the inline shape the normalizer reads.
 * Inline manifests pass through untouched.
 *
 * Refs are relative to the index's own directory: a build puts the index at
 * `<out>/manifests/components.json` and the payloads at `<out>/services/...`,
 * so `../services/...` is what the index carries.
 */
export async function hydrateManifest(raw: RawManifest, path: string): Promise<RawManifest> {
  const format = detectManifestFormat(raw);
  if (format.kind === 'unsupported') {
    throw new ManifestError(
      `${path} is a components manifest at version ${format.version}, which this oversight-lint cannot read.\n` +
        `Upgrade oversight-lint, or build with the Storybook version this one supports.`,
    );
  }
  if (format.kind === 'inline') return raw;

  const base = realpathSync(dirname(path));
  // A ref may climb one level only because a build puts the index in
  // `<out>/manifests/`. Granting that level unconditionally would widen the
  // boundary by a directory for any other layout, and `parseRef` allows exactly
  // the one `..` needed to walk through it. Without the directory the build
  // output is the index's own, and a climbing ref is reaching outside it.
  // Resolving `base` first keeps the root and the targets on the same side of
  // any symlink, so a build output staged through links still resolves.
  const root = basename(base) === 'manifests' ? dirname(base) : base;
  return resolveManifestRefs(raw, (target) => readLeafFile(resolve(base, target), root));
}

/** Refs may not name a payload larger than this. Real leaves run to a few KB. */
const MAX_LEAF_BYTES = 8 * 1024 * 1024;

/**
 * Read one ref target, confined to the build output.
 *
 * `resolveManifestRefs` checks the ref string, which cannot see the filesystem.
 * `readFileSync` follows symlinks on every path component, so a link placed
 * anywhere along a textually legal path would read whatever it points at, and a
 * link to a device or FIFO would hang the run until CI timed it out. Resolving
 * the real path and requiring a regular file inside the root closes both.
 */
/**
 * Whether a resolved path sits under `root`.
 *
 * `relative` rather than a prefix compare: `root + sep` doubles the separator
 * when root is a filesystem or drive root, and every legitimate ref is then
 * refused. Exported for the test that covers that case, which needs a root no
 * temporary directory can produce.
 */
export function containedIn(root: string, real: string): boolean {
  const rel = relative(root, real);
  return rel !== '' && !isAbsolute(rel) && rel.split(sep)[0] !== '..';
}

function readLeafFile(target: string, root: string): string {
  const real = realpathSync(target);
  if (!containedIn(root, real)) {
    throw new Error('resolves outside the build output');
  }
  const stat = lstatSync(real);
  if (!stat.isFile()) throw new Error('not a regular file');
  if (stat.size > MAX_LEAF_BYTES) throw new Error(`larger than ${MAX_LEAF_BYTES} bytes`);
  return readFileSync(real, 'utf8');
}
