import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

  const base = dirname(path);
  return resolveManifestRefs(raw, (target) => readFileSync(resolve(base, target), 'utf8'));
}
