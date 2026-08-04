#!/usr/bin/env node

import boxen from 'boxen';
import chalk from 'chalk';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globalPackages as globalManagerPackages } from 'storybook/internal/manager/globals';
import { globalPackages as globalPreviewPackages } from 'storybook/internal/preview/globals';
import { dedent } from 'ts-dedent';

// Everything resolves from this file's own location, never from cwd. The release
// workflow runs `pnpm run release` from the repo root, and reading `./package.json`
// relative to cwd is why this only ever worked from the addon directory.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(repoRoot, 'packages');

const globalPackages = [...globalManagerPackages, ...globalPreviewPackages];

function report(title, body) {
  console.error(boxen(`${chalk.red.bold(title)}\n\n${chalk.red(body)}`, { padding: 1, borderColor: 'red' }));
}

/**
 * Every package under `packages/` that publishes.
 *
 * Derived rather than listed, so a package added later is covered by default
 * instead of being silently skipped. A directory without a `package.json` is not
 * a package and is skipped; one with an unreadable or malformed `package.json` is
 * worth stopping the release for, so that throws rather than skipping.
 */
async function findPublishedPackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  directories.sort((a, b) => a.name.localeCompare(b.name));

  const packages = [];

  for (const entry of directories) {
    const dir = join(packagesDir, entry.name);
    let raw;

    try {
      raw = await readFile(join(dir, 'package.json'), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }

    const manifest = JSON.parse(raw);
    if (manifest.private) continue;
    packages.push({ dir, manifest });
  }

  return packages;
}

/**
 * Check that Addon Kit metadata has been replaced.
 *
 * The addon gallery filters out every addon still carrying the template's name or
 * displayName.
 */
function checkMetadata({ manifest }) {
  const name = manifest.name ?? '';
  const displayName = manifest.storybook?.displayName ?? '';

  if (!name.includes('addon-kit') && !displayName.includes('Addon Kit')) return true;

  report(
    'Missing metadata',
    dedent`Your package name and/or displayName includes default values from the Addon Kit.
    The addon gallery filters out all such addons.

    Please configure appropriate metadata before publishing your addon. For more info, see:
    https://storybook.js.org/docs/react/addons/addon-catalog#addon-metadata`,
  );

  return false;
}

const README_BOILERPLATE = [
  '# Storybook Addon Kit',
  'Click the **Use this template** button to get started.',
  'https://user-images.githubusercontent.com/42671/106809879-35b32000-663a-11eb-9cdc-89f178b5273f.gif',
];

const boilerplatePattern = new RegExp(
  README_BOILERPLATE.map((string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
);

/**
 * Check that the README has been written.
 *
 * A missing README fails rather than passes. Both published packages list
 * `README.md` in `files`, and npm renders a package README frozen at publish time,
 * so shipping without one is not correctable after the fact. The shell version
 * this replaced piped `cat` into `grep`, which reported a missing file as a pass.
 */
async function checkReadme({ dir, manifest }) {
  let readme;

  try {
    readme = await readFile(join(dir, 'README.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;

    report(
      'README missing',
      dedent`${manifest.name} lists README.md in "files" but does not have one.
      npm renders a package README frozen at publish time, so this cannot be
      corrected after the release.`,
    );

    return false;
  }

  if (!boilerplatePattern.test(readme)) return true;

  report(
    'README not updated',
    dedent`${manifest.name} is still using the default README.md that comes with the addon kit.
    Please update it to provide info on what your addon does and how to use it.`,
  );

  return false;
}

/**
 * Check that packages Storybook globalizes are not listed as peer dependencies.
 *
 * Storybook provides these to the manager and preview bundles at runtime, so
 * declaring one as a peer bundles it twice.
 */
function checkPeerDependencies({ manifest }) {
  const offenders = Object.keys(manifest.peerDependencies ?? {}).filter((dependency) =>
    globalPackages.includes(dependency),
  );

  for (const dependency of offenders) {
    report(
      'Unnecessary peer dependency',
      dedent`${manifest.name} has a peer dependency on ${chalk.bold(dependency)} which is most
      likely unnecessary, as Storybook provides it directly.
      Check the "bundling" section in README.md for more information.
      If you are certain this is correct, remove this check from scripts/prepublish-checks.js.`,
    );
  }

  return offenders.length === 0;
}

const packages = await findPublishedPackages();

// Refuse rather than report a green run over nothing. A moved workspace or a
// filter that excluded everything would otherwise print a passing summary having
// checked no packages at all, which is the shape this script exists to remove.
if (packages.length === 0) {
  report(
    'No packages to check',
    dedent`Found no publishable packages under ${packagesDir}.
    Either the workspace layout moved or every package is marked private, and
    passing without having checked anything is not a result worth trusting.`,
  );
  process.exit(1);
}

let exitCode = 0;
const summary = [];

for (const pkg of packages) {
  const checks = ['README'];
  if (!(await checkReadme(pkg))) exitCode = 1;

  // The metadata and globalized-peer checks only mean something for code that
  // runs inside Storybook's manager or preview bundle. The CLI runs in node in
  // CI, so it gets the README check and nothing else.
  if (pkg.manifest.storybook) {
    checks.push('metadata', 'peers');
    if (!checkMetadata(pkg)) exitCode = 1;
    if (!checkPeerDependencies(pkg)) exitCode = 1;
  }

  summary.push(`${pkg.manifest.name} (${checks.join(', ')})`);
}

// A safeguard that prints nothing on success is indistinguishable from one that
// did not run, which is how this script sat dormant since the Addon Kit template.
if (exitCode === 0) {
  console.log(`${chalk.green('✔')} prepublish checks passed: ${summary.join(', ')}`);
}

process.exit(exitCode);
