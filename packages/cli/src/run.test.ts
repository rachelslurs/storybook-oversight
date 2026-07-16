import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RawManifest } from 'oversight-core';
import type { RunOptions } from './config';
import { run } from './run';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'oversight-run-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fixture(manifest: unknown): string {
  const path = join(dir, 'components.json');
  writeFileSync(path, JSON.stringify(manifest));
  return path;
}

function options(over: Partial<RunOptions> & { manifestPath: string }): RunOptions {
  return { lint: {}, maxWarnings: Infinity, json: false, quiet: false, color: false, ...over };
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
      stories: [{ id: 'ui-button--default', name: 'Default' }],
    },
  },
};

// One missing component description + one undocumented optional prop: two warnings, no error.
const WARNINGS_ONLY: RawManifest = {
  v: 0,
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ui-card': {
      id: 'ui-card',
      name: 'Card',
      path: 'src/Card.stories.tsx',
      reactDocgenTypescript: { props: { title: { required: false } } },
      stories: [],
    },
  },
};

// An undocumented required prop is an error (plus the prop-descriptions warning).
const WITH_ERROR: RawManifest = {
  v: 0,
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ui-input': {
      id: 'ui-input',
      name: 'Input',
      path: 'src/Input.stories.tsx',
      description: 'A text input.',
      reactDocgenTypescript: { description: 'A text input.', props: { value: { required: true } } },
      stories: [],
    },
  },
};

// The experimentalDocgenServer ref-based shape: `stories` is an object, which the
// normalizer's `for..of` cannot iterate, so analysis throws.
const REF_V1 = {
  v: 1,
  meta: { docgen: 'react-component-meta' },
  components: { x: { id: 'x', name: 'X', stories: { 'x--a': { id: 'x--a' } } } },
};

describe('run — exit codes', () => {
  it('exits 0 on a clean manifest', () => {
    expect(run(options({ manifestPath: fixture(CLEAN) })).code).toBe(0);
  });

  it('exits 1 when an error-severity rule fires', () => {
    expect(run(options({ manifestPath: fixture(WITH_ERROR) })).code).toBe(1);
  });

  it('exits 0 for warnings under the default (no) limit, 1 once the limit is exceeded', () => {
    const path = fixture(WARNINGS_ONLY);
    expect(run(options({ manifestPath: path })).code).toBe(0);
    expect(run(options({ manifestPath: path, maxWarnings: 0 })).code).toBe(1);
    expect(run(options({ manifestPath: path, maxWarnings: 2 })).code).toBe(0);
  });

  it('exits 2 when the manifest is missing', () => {
    const result = run(options({ manifestPath: join(dir, 'absent.json') }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/No components manifest/);
  });

  it('exits 2 when the manifest is not valid JSON', () => {
    const path = join(dir, 'components.json');
    writeFileSync(path, '{ not json');
    const result = run(options({ manifestPath: path }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Could not parse/);
  });

  it('exits 2 on the unsupported ref-based (v:1) manifest', () => {
    const result = run(options({ manifestPath: fixture(REF_V1) }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/not supported yet/);
  });
});

describe('run — rule overrides and output', () => {
  it('escalates a warning to an error via a rule override, flipping the exit code', () => {
    const path = fixture(WARNINGS_ONLY);
    expect(run(options({ manifestPath: path })).code).toBe(0);
    const escalated = run(
      options({ manifestPath: path, lint: { rules: { 'component-description-missing': 'error' } } }),
    );
    expect(escalated.code).toBe(1);
  });

  it('suppresses a rule via an override', () => {
    const path = fixture(WITH_ERROR);
    const suppressed = run(options({ manifestPath: path, lint: { rules: { 'required-prop-undocumented': 'off' } } }));
    // Only the prop-descriptions warning survives; no error remains.
    expect(suppressed.code).toBe(0);
  });

  it('emits JSON keyed by component id with a summary', () => {
    const result = run(options({ manifestPath: fixture(WITH_ERROR), json: true }));
    const parsed = JSON.parse(result.stdout) as {
      summary: { errors: number; warnings: number; infos: number };
      components: Record<string, { rule: string; severity: string }[]>;
    };
    expect(parsed.summary).toEqual({ errors: 1, warnings: 1, infos: 0 });
    expect(parsed.components['ui-input'].map((d) => d.rule)).toContain('required-prop-undocumented');
  });

  it('always provides a step summary regardless of stdout format', () => {
    const result = run(options({ manifestPath: fixture(WITH_ERROR) }));
    expect(result.stepSummary).toMatch(/Oversight manifest lint/);
    expect(result.stepSummary).toMatch(/required-prop-undocumented/);
  });
});
