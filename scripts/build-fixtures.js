#!/usr/bin/env node

// Rebuilds three of the committed manifest fixtures from real demo builds.
//
// A fixture has to be a shape something emits. `v0-react-component-meta`, `v1`
// and `v1-dangling` were derived from demo builds once and then hand-edited,
// which is how the `layout-panel` description in them drifted from the JSDoc it
// claims to be an extraction of. Regenerating keeps the entry and payload copies
// of a field in whatever relationship a build writes them, which is the property
// a hand-edit cannot preserve.
//
// `packages/core/test/fixtures/components.json` is the fourth fixture in that
// directory and this script does not touch it. It records components that do not
// exist in `stories/` (`forms-textfield`, `layout-stack`, `feedback-spinner`), so
// no build of this demo can emit it, and it is the only fixture covering
// react-docgen-typescript. A clean diff here says nothing about that one.
//
// Two builds, because the fixtures record two extractors:
//   v0-react-component-meta  STORYBOOK_REACT_COMPONENT_META=1, inline entries
//   v1                       STORYBOOK_DOCGEN_SERVER=1, `$ref`s into services/
//
// v1-dangling is derived from v1 rather than built: it is v1 trimmed to two
// components with the leaves deliberately withheld, so a `$ref` that fails to
// resolve has something to be tested against.
//
// Two edits are applied to every build output, both so the fixture is stable
// across machines and runs: absolute paths are rewritten to `/repo`, and
// `meta.durationMs` is zeroed.
//
// Usage: pnpm build:fixtures

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = join(repoRoot, 'packages', 'core', 'test', 'fixtures');

/** Components kept in v1-dangling, and the one leaf it keeps for them. */
const DANGLING_KEEP = ['feedback-banner', 'layout-panel'];
const DANGLING_LEAF = join('services', 'core', 'story-docs', 'feedback-banner.json');

function log(message) {
  process.stdout.write(`${message}\n`);
}

/**
 * A build output's absolute paths name the machine that ran it, and its timings
 * differ every run. Both would land in the diff of an unrelated change.
 *
 * The substitution is textual, so it misses whenever a build records a path that
 * is not spelled the way `repoRoot` is: a checkout reached through a symlink, or
 * macOS resolving `/var` to `/private/var`. Asserting the property this function
 * exists for is what turns that into a stopped run rather than a committed
 * fixture with someone's home directory in it.
 */
function sanitize(text) {
  const parsed = JSON.parse(text.split(repoRoot).join('/repo'));
  if (parsed.meta?.durationMs !== undefined) parsed.meta.durationMs = 0;
  const out = `${JSON.stringify(parsed, null, 2)}\n`;
  const leaked = [homedir(), '/Users/', '/home/', '/private/'].find((path) => out.includes(path));
  if (leaked) {
    throw new Error(
      `a machine path survived sanitizing (${leaked}). The build recorded a path spelled differently from ${repoRoot}.`,
    );
  }
  return out;
}

function copyJson(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  writeFileSync(to, sanitize(readFileSync(from, 'utf8')));
}

/** Extractor selectors this script owns. An inherited one would choose for it. */
const EXTRACTOR_VARS = ['STORYBOOK_DOCGEN_SERVER', 'STORYBOOK_REACT_COMPONENT_META'];

function build(output, env) {
  log(`building ${output} (${Object.keys(env).join(', ') || 'defaults'})`);
  // Cleared, not merged over. `.storybook/main.ts` documents exporting
  // STORYBOOK_DOCGEN_SERVER as the way to run the demo under the docgen server,
  // so a maintainer who has it set would otherwise build a ref index and this
  // script would write it over the inline fixture while logging the other name.
  const inherited = { ...process.env };
  for (const name of EXTRACTOR_VARS) delete inherited[name];
  execFileSync('pnpm', ['exec', 'storybook', 'build', '-o', output, '--quiet'], {
    cwd: repoRoot,
    env: { ...inherited, ...env },
    stdio: 'inherit',
  });
}

function writeInline(output) {
  const target = join(fixtures, 'v0-react-component-meta', 'components.json');
  copyJson(join(output, 'manifests', 'components.json'), target);
  log(`wrote ${target}`);
}

function writeRef(output) {
  const target = join(fixtures, 'v1');
  rmSync(target, { recursive: true, force: true });
  copyJson(join(output, 'manifests', 'components.json'), join(target, 'manifests', 'components.json'));

  const services = join(output, 'services', 'core');
  for (const service of readdirSync(services)) {
    for (const leaf of readdirSync(join(services, service))) {
      copyJson(join(services, service, leaf), join(target, 'services', 'core', service, leaf));
    }
  }
  log(`wrote ${target}`);
}

/**
 * v1 with four of its six components dropped and three of its four remaining
 * leaves withheld: `feedback-banner` loses its docgen leaf and keeps its stories
 * one, `layout-panel` loses both. The two shapes are different failures, and the
 * resolver reports them differently.
 */
function writeDangling(output) {
  const target = join(fixtures, 'v1-dangling');
  rmSync(target, { recursive: true, force: true });

  const index = JSON.parse(sanitize(readFileSync(join(output, 'manifests', 'components.json'), 'utf8')));
  const kept = {};
  for (const id of DANGLING_KEEP) {
    if (!index.components[id]) throw new Error(`the demo build has no "${id}" to trim v1-dangling down to`);
    kept[id] = index.components[id];
  }
  index.components = kept;
  mkdirSync(join(target, 'manifests'), { recursive: true });
  writeFileSync(join(target, 'manifests', 'components.json'), `${JSON.stringify(index, null, 2)}\n`);

  copyJson(join(output, DANGLING_LEAF), join(target, DANGLING_LEAF));
  log(`wrote ${target}`);
}

const staging = mkdtempSync(join(tmpdir(), 'oversight-fixtures-'));
try {
  // The demo loads the workspace addon's built manager, so a stale build would
  // be the one measured.
  log('building the addon');
  execFileSync('pnpm', ['run', 'build:addon'], { cwd: repoRoot, stdio: 'inherit' });

  const inline = join(staging, 'react-component-meta');
  build(inline, { STORYBOOK_REACT_COMPONENT_META: '1' });
  writeInline(inline);

  const ref = join(staging, 'docgen-server');
  build(ref, { STORYBOOK_DOCGEN_SERVER: '1' });
  writeRef(ref);
  writeDangling(ref);

  // These files are under `pnpm lint`, and `JSON.stringify` and Prettier
  // disagree about short arrays. Formatting here keeps a regeneration from
  // failing the lint job for a reason that has nothing to do with the build.
  log('formatting');
  execFileSync('pnpm', ['exec', 'prettier', '--write', '--log-level', 'warn', `${fixtures}/**/*.json`], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
