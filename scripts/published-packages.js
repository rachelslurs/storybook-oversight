// Shared by the two release gates: prepublish-checks.js reads the manifests
// before the build, artifact-checks.js reads the tarballs after it. One
// definition of "what this repo publishes" so the two cannot drift.

import boxen from 'boxen';
import chalk from 'chalk';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const packagesDir = join(repoRoot, 'packages');

export function report(title, body) {
  console.error(boxen(`${chalk.red.bold(title)}\n\n${chalk.red(body)}`, { padding: 1, borderColor: 'red' }));
}

/**
 * Every package under `packages/` that publishes.
 *
 * Derived rather than listed, so a package added later is covered by default
 * instead of being silently skipped. Returns null when `packages/` is absent,
 * which callers report rather than letting an ENOENT escape as a stack trace.
 *
 * A directory without a `package.json` is not a package and is skipped. One
 * whose `package.json` will not parse is worth stopping the release for, and is
 * reported against the file that would not parse.
 */
export async function findPublishedPackages() {
  let entries;

  try {
    entries = await readdir(packagesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }

  const directories = entries.filter((entry) => entry.isDirectory());
  directories.sort((a, b) => a.name.localeCompare(b.name));

  const packages = [];

  for (const entry of directories) {
    const dir = join(packagesDir, entry.name);
    const manifestPath = join(dir, 'package.json');
    let raw;

    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    let manifest;

    try {
      manifest = JSON.parse(raw);
    } catch (error) {
      report('Unreadable package manifest', `${manifestPath} is not valid JSON.\n\n${error.message}`);
      process.exit(1);
    }

    if (manifest.private) continue;
    packages.push({ dir, manifest });
  }

  return packages;
}

/**
 * Refuse rather than report a green run over nothing.
 *
 * A missing directory and an empty result are different mistakes and say so.
 * Either way, passing without having checked a single package is the shape both
 * of these gates exist to remove.
 */
export function requirePackages(packages) {
  if (packages === null) {
    report(
      'No packages directory',
      `Nothing at ${packagesDir}.\nThe workspace layout moved and this script did not move with it.`,
    );
    process.exit(1);
  }

  if (packages.length === 0) {
    report(
      'No packages to check',
      `Found no publishable packages under ${packagesDir}.\n` +
        'Either the workspace layout moved or every package is marked private, and\n' +
        'passing without having checked anything is not a result worth trusting.',
    );
    process.exit(1);
  }

  return packages;
}
