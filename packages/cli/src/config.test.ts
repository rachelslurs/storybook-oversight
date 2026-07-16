import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildConfig, DEFAULT_MANIFEST_PATH } from './config';
import type { Context } from './config';

const ctx = (over: Partial<Context> = {}): Context => ({
  cwd: '/nowhere',
  env: {},
  isTTY: false,
  ...over,
});

/** Narrow to the `run` branch or fail loudly, so option assertions read cleanly. */
function runConfig(argv: string[], context: Context = ctx()) {
  const result = buildConfig(argv, context);
  if (result.kind !== 'run') throw new Error(`expected a run config, got "${result.kind}"`);
  return result.options;
}

describe('buildConfig', () => {
  it('defaults the manifest path to the static build output', () => {
    expect(runConfig([]).manifestPath).toBe(DEFAULT_MANIFEST_PATH);
  });

  it('takes the manifest path from the first positional', () => {
    expect(runConfig(['some/other.json']).manifestPath).toBe('some/other.json');
  });

  it('has no warning limit unless one is given', () => {
    expect(runConfig([]).maxWarnings).toBe(Infinity);
    expect(runConfig(['--max-warnings', '0']).maxWarnings).toBe(0);
  });

  it('rejects a non-integer --max-warnings', () => {
    const result = buildConfig(['--max-warnings', 'lots'], ctx());
    expect(result).toMatchObject({ kind: 'error' });
  });

  it('parses repeatable --rule name=severity into lint rules', () => {
    const options = runConfig(['--rule', 'deprecated-tag=off', '--rule', 'prop-descriptions-missing=error']);
    expect(options.lint.rules).toEqual({
      'deprecated-tag': 'off',
      'prop-descriptions-missing': 'error',
    });
  });

  it('rejects a --rule with a bad severity', () => {
    expect(buildConfig(['--rule', 'deprecated-tag=warn'], ctx())).toMatchObject({ kind: 'error' });
  });

  it('rejects a --rule missing the = separator', () => {
    expect(buildConfig(['--rule', 'deprecated-tag'], ctx())).toMatchObject({ kind: 'error' });
  });

  it('carries --expected-extractor into lint options', () => {
    expect(runConfig(['--expected-extractor', 'react-docgen']).lint.expectedExtractor).toBe('react-docgen');
  });

  it('reports help and version as their own kinds', () => {
    expect(buildConfig(['--help'], ctx()).kind).toBe('help');
    expect(buildConfig(['-h'], ctx()).kind).toBe('help');
    expect(buildConfig(['--version'], ctx()).kind).toBe('version');
  });

  it('treats an unknown flag as a usage error', () => {
    expect(buildConfig(['--nope'], ctx()).kind).toBe('error');
  });

  it('enables color from FORCE_COLOR or a TTY, and NO_COLOR wins over the TTY', () => {
    expect(runConfig([], ctx({ isTTY: true })).color).toBe(true);
    expect(runConfig([], ctx({ isTTY: false, env: { FORCE_COLOR: '1' } })).color).toBe(true);
    expect(runConfig([], ctx({ isTTY: true, env: { NO_COLOR: '1' } })).color).toBe(false);
  });

  describe('config file', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'oversight-cfg-'));
    });
    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('reads oversight.config.json from cwd and lets flags win', () => {
      writeFileSync(
        join(dir, 'oversight.config.json'),
        JSON.stringify({ manifest: 'from-file.json', expectedExtractor: 'react-docgen', maxWarnings: 3 }),
      );
      const fromFile = runConfig([], ctx({ cwd: dir }));
      expect(fromFile.manifestPath).toBe('from-file.json');
      expect(fromFile.lint.expectedExtractor).toBe('react-docgen');
      expect(fromFile.maxWarnings).toBe(3);

      const overridden = runConfig(['override.json', '--max-warnings', '0'], ctx({ cwd: dir }));
      expect(overridden.manifestPath).toBe('override.json');
      expect(overridden.maxWarnings).toBe(0);
    });

    it('errors when an explicit --config path is missing', () => {
      expect(buildConfig(['--config', join(dir, 'absent.json')], ctx({ cwd: dir })).kind).toBe('error');
    });
  });
});
