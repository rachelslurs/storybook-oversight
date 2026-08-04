#!/usr/bin/env node

import chalk from 'chalk';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { globalPackages as globalManagerPackages } from 'storybook/internal/manager/globals';
import { globalPackages as globalPreviewPackages } from 'storybook/internal/preview/globals';
import { dedent } from 'ts-dedent';
import { findPublishedPackages, report, requirePackages } from './published-packages.js';

// Paths resolve from the script's own location, never from cwd. The release
// workflow runs `pnpm run release` from the repo root, and reading `./package.json`
// relative to cwd is why this only ever worked from the addon directory.

const globalPackages = [...globalManagerPackages, ...globalPreviewPackages];

/**
 * Whether a package ships inside Storybook's manager or preview bundle.
 *
 * Read from two independent fields, because the `storybook` block is also what
 * `checkMetadata` validates. Keying only on that block would mean a package that
 * lost it read as "not an addon" and skipped the very check that would have
 * caught the loss, turning a missing block into a passing run.
 */
function isAddon({ manifest }) {
  return Boolean(manifest.storybook) || (manifest.keywords ?? []).includes('storybook-addon');
}

/**
 * Check that Addon Kit metadata has been replaced.
 *
 * The addon gallery filters out every addon still carrying the template's name or
 * displayName.
 */
function checkMetadata({ manifest }) {
  const name = manifest.name ?? '';
  const displayName = manifest.storybook?.displayName;

  // An absent block or displayName fails rather than skipping. The gallery reads
  // both, and the old version of this script threw here for the same reason.
  if (!displayName) {
    report(
      'Missing metadata',
      dedent`${name} publishes as an addon but has no storybook.displayName in its package.json.
      The addon gallery reads that block, and an addon without one does not appear.

      For more info, see:
      https://storybook.js.org/docs/react/addons/addon-catalog#addon-metadata`,
    );

    return false;
  }

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

    // Only claim the `files` promise when the manifest actually makes it.
    const promisesReadme = (manifest.files ?? []).some((pattern) => pattern.includes('README.md'));

    report(
      'README missing',
      promisesReadme
        ? dedent`${manifest.name} lists README.md in "files" but does not have one.
          npm renders a package README frozen at publish time, so this cannot be
          corrected after the release.`
        : dedent`${manifest.name} publishes without a README.md.
          npm renders a package README frozen at publish time, so a package that
          ships without one shows an empty page until the next release.`,
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

const packages = requirePackages(await findPublishedPackages());

let exitCode = 0;
const summary = [];

for (const pkg of packages) {
  const checks = ['README'];
  if (!(await checkReadme(pkg))) exitCode = 1;

  // The metadata and globalized-peer checks only mean something for code that
  // runs inside Storybook's manager or preview bundle. The CLI runs in node in
  // CI, so it gets the README check and nothing else.
  if (isAddon(pkg)) {
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
