import { readFileSync } from 'node:fs';
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
          `(experimentalDocgenServer emits a ref-based manifest that is not supported yet.)`,
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
