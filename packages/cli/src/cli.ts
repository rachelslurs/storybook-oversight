#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfig, HELP } from './config';
import { wrapMessage } from './format';
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

/** The width to wrap stderr guidance to. Read off stderr rather than stdout:
 *  the two streams are redirected independently, and a run whose report goes
 *  to a file still shows its diagnostics in the terminal. */
function errorWidth(): number {
  const { columns } = process.stderr;
  if (process.stderr.isTTY !== true || typeof columns !== 'number' || !Number.isFinite(columns)) return 0;
  return columns;
}

async function main(): Promise<number> {
  const config = buildConfig(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    isTTY: process.stdout.isTTY === true,
    columns: process.stdout.columns,
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
    process.stderr.write(`${wrapMessage(`oversight: ${config.message}`, errorWidth())}\n`);
    return 2;
  }

  // Every format prints something different and `--format github` prints only
  // workflow commands, so a CI log had no way to say which version ran. stderr
  // is the one stream every format leaves alone.
  process.stderr.write(`oversight-lint ${readVersion()}\n`);

  const result = await run(config.options);
  if (result.stdout) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr) process.stderr.write(`${wrapMessage(result.stderr, errorWidth())}\n`);

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
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    // Node's default for an unhandled rejection is also a non-zero exit, but
    // saying so here keeps the exit-code matrix readable from one place.
    const message = `oversight: ${err instanceof Error ? err.message : String(err)}`;
    process.stderr.write(`${wrapMessage(message, errorWidth())}\n`);
    process.exitCode = 2;
  });
