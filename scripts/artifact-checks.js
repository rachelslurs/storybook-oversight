#!/usr/bin/env node

// Gates the tarball, not the repo. Runs AFTER `pnpm -r build`, because
// everything here reads dist/. Its sibling, prepublish-checks.js, reads the
// manifests and runs before the build. Keep them separate: moving these checks
// ahead of the build would pass by finding nothing.
//
// npm renders a package README frozen at publish time and a published tarball
// cannot be amended, so a repo-correct package is not a published-correct one.

import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { findPublishedPackages, repoRoot, report, requirePackages } from './published-packages.js';

const packages = requirePackages(await findPublishedPackages());

const bin = (name) => join(repoRoot, 'node_modules', '.bin', name);

/**
 * The files `npm publish` would actually ship, straight from npm's own packer
 * rather than from a reimplementation of its `files` semantics.
 */
function packedFiles(dir, name) {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: dir, encoding: 'utf8' });

  if (result.status !== 0) {
    report('npm pack failed', `${name} could not be packed.\n\n${result.stderr?.trim() ?? ''}`);
    return null;
  }

  try {
    return JSON.parse(result.stdout)[0].files.map((file) => file.path);
  } catch (error) {
    report('Unreadable pack output', `Could not read \`npm pack --json\` for ${name}.\n\n${error.message}`);
    return null;
  }
}

/**
 * Every path the manifest points consumers at has to be inside the tarball.
 *
 * Exact paths, so this needs no glob semantics and cannot fail on a pattern it
 * matched differently than npm-packlist would. `exports` targets and `bin`
 * targets are the two ways a manifest promises a file to a consumer.
 */
function promisedPaths(manifest) {
  const promised = new Set();

  const collect = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('./')) promised.add(value.slice(2));
      return;
    }
    if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };

  collect(manifest.exports);
  collect(manifest.bin);
  promised.delete('package.json');

  return [...promised].sort();
}

let exitCode = 0;
const summary = [];

for (const { dir, manifest } of packages) {
  const name = manifest.name;
  const files = packedFiles(dir, name);

  if (files === null) {
    exitCode = 1;
    continue;
  }

  const packed = new Set(files);

  // No README assertion here on purpose. npm force-ships package.json, README
  // and the `bin` target whatever `files` says, so a check for one in the
  // tarball cannot fail and would only read like coverage. A README missing
  // from disk is caught before the build, in prepublish-checks.js.
  const missing = promisedPaths(manifest).filter((path) => !packed.has(path));

  if (missing.length > 0) {
    report(
      'Promised file not in the tarball',
      `${name} points consumers at ${missing.length === 1 ? 'a path' : 'paths'} it does not ship:\n\n` +
        missing.map((path) => `  ${path}`).join('\n') +
        '\n\nEither the "files" filter excludes it or the manifest names a path the\nbuild no longer emits.',
    );
    exitCode = 1;
  }

  for (const [tool, args] of [
    ['publint', [dir]],
    // The packages are ESM only ("type": "module"), so the CJS and node10 rows
    // are noise rather than findings.
    ['attw', ['--pack', dir, '--profile', 'esm-only']],
  ]) {
    const result = spawnSync(bin(tool), args, { cwd: repoRoot, stdio: 'inherit' });

    if (result.status !== 0) {
      report(`${tool} failed for ${name}`, `See the ${tool} output above.`);
      exitCode = 1;
    }
  }

  summary.push(`${name} (${files.length} files)`);
}

if (exitCode === 0) {
  console.log(`${chalk.green('✔')} artifact checks passed: ${summary.join(', ')}`);
}

process.exit(exitCode);
