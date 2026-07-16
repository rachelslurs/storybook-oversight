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
          `Run \`storybook build\` with @storybook/addon-mcp enabled to emit it, or pass an explicit path.\n` +
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
