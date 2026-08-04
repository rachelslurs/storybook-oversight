import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RawManifest } from 'oversight-core';

// run.test.ts calls run() directly, one level below the entry point, so argv
// parsing, the exit codes the README documents as load-bearing, the shebang and
// the published bin all rested on nothing. This drives the built binary.
const BIN = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const PKG = fileURLToPath(new URL('../package.json', import.meta.url));

// dist/ is gitignored and this package's `test` script has no prebuild, so a
// bare `pnpm test` on a clean checkout finds nothing here. CI only passes today
// because build.yml happens to build first. Say so rather than failing on a
// module-not-found from inside spawnSync.
const built = existsSync(BIN);

type Result = { code: number; stdout: string; stderr: string };

// spawnSync rather than execFileSync: the latter returns stdout only and
// throws on a non-zero exit, and every assertion here needs both streams
// alongside the code.
function cli(args: string[]): Result {
  const r = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
  return { code: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oversight-cli-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fixture(manifest: unknown): string {
  const path = join(dir, 'components.json');
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}

const CLEAN: RawManifest = {
  v: 0,
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ui-button': {
      id: 'ui-button',
      name: 'Button',
      path: 'src/Button.stories.tsx',
      description: 'A button.',
      reactDocgenTypescript: {
        description: 'A button.',
        props: { label: { description: 'The visible text.', required: true } },
      },
      stories: [],
    },
  },
};

const WITH_ERROR: RawManifest = {
  v: 0,
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ui-input': {
      id: 'ui-input',
      name: 'Input',
      path: 'src/Input.stories.tsx',
      description: 'An input.',
      reactDocgenTypescript: {
        description: 'An input.',
        props: { value: { required: true } },
      },
      stories: [],
    },
  },
};

describe.skipIf(!built)('cli: the built binary', () => {
  it('ships a node shebang, so the published bin is executable', () => {
    expect(readFileSync(BIN, 'utf8').startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('exits 0 on a clean manifest', () => {
    expect(cli([fixture(CLEAN)]).code).toBe(0);
  });

  it('exits 1 on an error-severity finding', () => {
    expect(cli([fixture(WITH_ERROR)]).code).toBe(1);
  });

  it('exits 2 when the manifest is missing', () => {
    expect(cli([join(dir, 'nope.json')]).code).toBe(2);
  });

  it('exits 2 when the file is not a manifest', () => {
    const path = join(dir, 'not-a-manifest.json');
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const result = cli([path]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/is not a components manifest/);
  });

  it('exits 2 on a usage error', () => {
    expect(cli([fixture(CLEAN), '--no-such-flag']).code).toBe(2);
  });
});

// The banner exists so an audit can tell from a CI log which build ran, which
// is what made diagnosing a backwards dist-tag possible. It is also the one
// line whose whole job is making releases verifiable, so it is worth pinning
// down where it does and does not appear.
describe.skipIf(!built)('cli: the version banner', () => {
  const version = (JSON.parse(readFileSync(PKG, 'utf8')) as { version: string }).version;

  it('names the running version on stderr', () => {
    expect(cli([fixture(CLEAN)]).stderr).toContain(`oversight-lint ${version}`);
  });

  it('leaves stdout alone, so --format github stays parseable', () => {
    const result = cli([fixture(WITH_ERROR), '--format', 'github']);
    expect(result.stdout).not.toContain('oversight-lint ');
    for (const line of result.stdout.split('\n').filter(Boolean)) {
      expect(line).toMatch(/^::(error|warning|notice) /);
    }
  });

  it('survives on the exit-2 path that still runs a lint', () => {
    expect(cli([join(dir, 'nope.json')]).stderr).toContain(`oversight-lint ${version}`);
  });

  // --help, --version and usage errors all return before the banner is written.
  // Issue #75 read as though every exit carried one; asserting that via a bad
  // flag would have failed.
  it('stays out of the way of --help and --version', () => {
    expect(cli(['--help']).stderr).not.toContain('oversight-lint ');
    expect(cli(['--version']).stderr).not.toContain('oversight-lint ');
    expect(cli(['--version']).stdout.trim()).toBe(version);
  });

  it('stays out of the way of a usage error', () => {
    expect(cli([fixture(CLEAN), '--no-such-flag']).stderr).not.toContain(`oversight-lint ${version}`);
  });
});
