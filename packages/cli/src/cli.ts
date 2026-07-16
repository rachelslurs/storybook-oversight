#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, HELP } from './config';
import { run } from './run';

function readVersion(): string {
  // dist/cli.js sits one directory below the package root; package.json is always
  // in the published tarball even though it is not under dist/.
  const here = dirname(fileURLToPath(import.meta.url));
  try {
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function main(): number {
  const config = buildConfig(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    isTTY: process.stdout.isTTY === true,
  });

  if (config.kind === 'help') {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  if (config.kind === 'version') {
    process.stdout.write(`${readVersion()}\n`);
    return 0;
  }
  if (config.kind === 'error') {
    process.stderr.write(`oversight: ${config.message}\n`);
    return 2;
  }

  const result = run(config.options);
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${result.stderr}\n`);

  // GitHub Actions job summary, appended when running under Actions.
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (process.env.GITHUB_ACTIONS && summaryPath && result.stepSummary) {
    try {
      appendFileSync(summaryPath, `${result.stepSummary}\n`);
    } catch {
      // A summary-write failure must not change the lint outcome.
    }
  }
  return result.code;
}

// Set the exit code and let Node exit once stdout has drained. `process.exit()`
// would truncate output written to a pipe or file, where writes are async.
process.exitCode = main();
