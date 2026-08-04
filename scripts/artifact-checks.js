#!/usr/bin/env node

// Gates the tarball, not the repo. Runs AFTER `pnpm -r build`, because
// everything here reads dist/. Its sibling, prepublish-checks.js, reads the
// manifests and runs before the build. Keep them separate: moving these checks
// ahead of the build would pass by finding nothing.
//
// npm renders a package README frozen at publish time and a published tarball
// cannot be amended, so a repo-correct package is not a published-correct one.
//
// Both tools pack the package for real rather than reading the working tree,
// and publint packs with `pnpm pack`, which is what `changeset publish` uses.

import chalk from 'chalk';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { findPublishedPackages, repoRoot, report, requirePackages } from './published-packages.js';

const packages = requirePackages(await findPublishedPackages());

/**
 * Run one of the packaging tools and hand back what it said.
 *
 * A tool that never started is reported as that, rather than as a failure of
 * the package it was pointed at. `spawnSync` returns `status: null` when the
 * binary cannot be spawned, and a bare `status !== 0` test would blame the
 * package and refer the reader to output that was never printed.
 */
function run(tool, args) {
  const command = join(repoRoot, 'node_modules', '.bin', tool);
  const result = spawnSync(command, args, { cwd: repoRoot, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

  if (result.error) {
    return { started: false, output, error: result.error, command };
  }

  return { started: true, ok: result.status === 0, output };
}

let exitCode = 0;
const summary = [];

for (const { dir, manifest } of packages) {
  const name = manifest.name;
  const checks = [];

  // publint reads the packed tarball and already asserts that every `exports`
  // and `bin` target exists and survives the `files` filter, naming the
  // condition key that broke. Re-deriving those paths here would be a weaker
  // copy of a check running three lines away.
  const publint = run('publint', [dir]);

  if (!publint.started) {
    report(
      'publint did not run',
      `Could not start ${publint.command}.\n\n${publint.error.message}\n\nThis says nothing about ${name}; the tool never inspected it.`,
    );
    exitCode = 1;
  } else {
    if (publint.output.trim()) console.log(publint.output.trimEnd());
    if (!publint.ok) exitCode = 1;
    checks.push('publint');
  }

  // A package with no `exports`, `main` or `types` publishes no importable
  // surface, and attw exits 0 on it having checked nothing. Saying "attw" in
  // the summary for such a package would claim a check that did not happen, so
  // the expectation is derived from the manifest instead of assumed.
  const importable = Boolean(manifest.exports ?? manifest.main ?? manifest.types);

  if (!importable) {
    checks.push('no importable surface');
  } else {
    // The packages are ESM only ("type": "module"), so the CJS and node10 rows
    // describe a contract they do not offer.
    const attw = run('attw', ['--pack', dir, '--profile', 'esm-only']);

    if (!attw.started) {
      report(
        'attw did not run',
        `Could not start ${attw.command}.\n\n${attw.error.message}\n\nThis says nothing about ${name}; the tool never inspected it.`,
      );
      exitCode = 1;
    } else {
      if (attw.output.trim()) console.log(attw.output.trimEnd());

      // attw exits 0 on a package it found no types in at all. For a package
      // that publishes an importable surface, that is the finding, not a pass.
      if (/does not contain types/i.test(attw.output)) {
        report(
          'No types in an importable package',
          `${name} publishes an importable entry, but attw found no type\n` +
            'declarations in the tarball at all.\n\n' +
            'attw exits 0 on a package with no types, so without this the run\n' +
            'would read as a passing type check.',
        );
        exitCode = 1;
      } else if (!attw.ok) {
        exitCode = 1;
      }

      checks.push('attw');
    }
  }

  summary.push(`${name} (${checks.join(', ')})`);
}

if (exitCode === 0) {
  console.log(`${chalk.green('✔')} artifact checks passed: ${summary.join(', ')}`);
}

process.exit(exitCode);
