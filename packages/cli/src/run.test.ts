import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as mcp from '@storybook/mcp';
import type { RawManifest } from 'oversight-core';
import { filesFor, getDocumentation, listAllDocumentation } from 'oversight-agent-view';
import { DOCUMENTATION_HEADING, showAgentView } from './agentView';
import type { RunOptions } from './config';
import { run } from './run';
import { containedIn } from './manifest';

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
  return { lint: {}, maxWarnings: Infinity, format: 'text', quiet: false, color: false, ...over };
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

// A fully documented component carrying a multi-line @deprecated note: the only
// finding is the deprecated-tag info, so the step-summary table has one row.
const DEPRECATED_MULTILINE: RawManifest = {
  v: 0,
  meta: { docgen: 'react-docgen-typescript' },
  components: {
    'ui-old': {
      id: 'ui-old',
      name: 'Old',
      path: 'src/Old.stories.tsx',
      description: 'An old component.',
      jsDocTags: { deprecated: ['use Gadget instead', 'since 2.0'] },
      reactDocgenTypescript: {
        description: 'An old component.',
        props: { label: { description: 'The visible text.', required: true } },
      },
      stories: [],
    },
  },
};

// The experimentalDocgenServer ref-based shape: each entry defers its payload to
// a per-component file. Nothing writes those files here, so every ref dangles.
const REF_V1 = {
  v: 1,
  meta: { docgen: 'react-component-meta' },
  components: {
    x: {
      id: 'x',
      name: 'X',
      docgen: { $ref: '../services/core/docgen/x.json#/components/x' },
      stories: { $ref: '../services/core/story-docs/x.json#/components/x' },
    },
  },
};

describe('run: exit codes', () => {
  it('exits 0 on a clean manifest', async () => {
    expect((await run(options({ manifestPath: fixture(CLEAN) }))).code).toBe(0);
  });

  it('exits 1 when an error-severity rule fires', async () => {
    expect((await run(options({ manifestPath: fixture(WITH_ERROR) }))).code).toBe(1);
  });

  it('exits 0 for warnings under the default (no) limit, 1 once the limit is exceeded', async () => {
    const path = fixture(WARNINGS_ONLY);
    expect((await run(options({ manifestPath: path }))).code).toBe(0);
    expect((await run(options({ manifestPath: path, maxWarnings: 0 }))).code).toBe(1);
    expect((await run(options({ manifestPath: path, maxWarnings: 2 }))).code).toBe(0);
  });

  it('says the warning ceiling was crossed, naming both numbers', async () => {
    // the one way to fail with output identical to a passing run, so a CI job
    // stopped on it said nowhere what had stopped it
    const path = fixture(WARNINGS_ONLY);
    const passing = await run(options({ manifestPath: path }));
    const failing = await run(options({ manifestPath: path, maxWarnings: 0 }));
    expect(passing.stderr).toBe('');
    expect(failing.stderr).toBe('2 warnings exceeds the maximum of 0.');
    expect(failing.stdout).toBe(passing.stdout);
  });

  it('exits 2 on a valid JSON file that is not a manifest, rather than passing green', async () => {
    // parses, reads as zero entries, and used to report "no findings" at exit 0,
    // so a job pointed at a stale path passed forever while linting nothing
    const path = join(dir, 'wrong-shape.json');
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    const result = await run(options({ manifestPath: path }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/records no `components`/);
  });

  it('still exits 0 on a manifest that records no entries', async () => {
    const path = join(dir, 'empty.json');
    writeFileSync(path, JSON.stringify({ components: {} }));
    expect((await run(options({ manifestPath: path }))).code).toBe(0);
  });

  it('exits 2 when the manifest is missing', async () => {
    const result = await run(options({ manifestPath: join(dir, 'absent.json') }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/No components manifest/);
  });

  it('states the manifest version floor when no manifest exists (#36)', async () => {
    const result = await run(options({ manifestPath: join(dir, 'missing/components.json') }));
    expect(result.code).toBe(2);
    // One distinctive fragment per message line, so dropping any line fails.
    expect(result.stderr).toMatch(/features\.componentsManifest/);
    expect(result.stderr).toMatch(/features\.experimentalComponentsManifest/);
    expect(result.stderr).toMatch(/unsupported/);
    expect(result.stderr).toMatch(/Below Storybook 10\.1/);
    expect(result.stderr).toMatch(/explicit path/);
  });

  it('exits 2 when the manifest is not valid JSON', async () => {
    const path = join(dir, 'components.json');
    writeFileSync(path, '{ not json');
    const result = await run(options({ manifestPath: path }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Could not parse/);
  });

  it('reads the ref-based (v:1) manifest, reporting unresolved refs as findings (#13)', async () => {
    // Every ref dangles here, so the run reaches a verdict about the manifest
    // rather than refusing to read it. Exit 1 is a lint result; exit 2 would
    // mean the CLI could not run at all.
    const result = await run(options({ manifestPath: fixture(REF_V1) }));
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/docgen-missing/);
    // The raw normalizer error used to lead this output; a recognized format
    // states its diagnosis without one.
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toMatch(/not iterable/);
  });

  it('exits 2 on a manifest version it does not know, naming the version', async () => {
    const result = await run(options({ manifestPath: fixture({ v: 99, components: {} }) }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/version 99/);
    // No raw TypeError text: the condition is recognized, so it is stated.
    expect(result.stderr).not.toMatch(/not iterable/);
  });

  it('exits 2 on a malformed v:0 manifest without blaming the ref-based format', async () => {
    // A v:0 entry whose `stories` is an object (not an array) trips the normalizer.
    const malformed = {
      v: 0,
      meta: { docgen: 'react-docgen-typescript' },
      components: { x: { id: 'x', name: 'X', stories: { a: {} } } },
    };
    const result = await run(options({ manifestPath: fixture(malformed) }));
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/malformed/);
    expect(result.stderr).not.toMatch(/v:1/);
  });
});

describe('run: extractor expectation wiring', () => {
  // Guards #32 at the CLI layer: reintroducing a default expectation anywhere
  // in the wiring would make the first assertion fail.
  it('runs extractor-drift only when the options carry an expectation', async () => {
    const drifted: RawManifest = {
      v: 0,
      meta: { docgen: 'react-docgen' },
      components: {
        'ui-plain': {
          id: 'ui-plain',
          name: 'Plain',
          path: 'src/Plain.stories.tsx',
          description: 'A plain component.',
          reactDocgen: { description: 'A plain component.', props: {} },
        },
      },
    };
    const path = fixture(drifted);

    const silent = await run(options({ manifestPath: path }));
    expect(silent.code).toBe(0);
    expect(silent.stdout).not.toContain('extractor-drift');

    const flagged = await run(options({ manifestPath: path, lint: { expectedExtractor: 'react-docgen-typescript' } }));
    expect(flagged.stdout).toContain('extractor-drift');
  });
});

describe('run: rule overrides and output', () => {
  it('escalates a warning to an error via a rule override, flipping the exit code', async () => {
    const path = fixture(WARNINGS_ONLY);
    expect((await run(options({ manifestPath: path }))).code).toBe(0);
    const escalated = await run(
      options({ manifestPath: path, lint: { rules: { 'component-description-missing': 'error' } } }),
    );
    expect(escalated.code).toBe(1);
  });

  it('suppresses a rule via an override', async () => {
    const path = fixture(WITH_ERROR);
    const suppressed = await run(
      options({ manifestPath: path, lint: { rules: { 'required-prop-undocumented': 'off' } } }),
    );
    // Only the prop-descriptions warning survives; no error remains.
    expect(suppressed.code).toBe(0);
  });

  it('emits JSON keyed by component id with a summary', async () => {
    const path = fixture(WITH_ERROR);
    const result = await run(options({ manifestPath: path, format: 'json' }));
    const parsed = JSON.parse(result.stdout) as {
      summary: { errors: number; warnings: number; infos: number };
      components: Record<string, { rule: string; severity: string }[]>;
    };
    expect(parsed.summary).toEqual({
      errors: 1,
      warnings: 1,
      infos: 0,
      manifest: { path, docgen: 'react-docgen-typescript', entries: 1 },
    });
    expect(parsed.components['ui-input'].map((d) => d.rule)).toContain('required-prop-undocumented');
  });

  it('emits GitHub annotations anchored to the stories file under format: github', async () => {
    const result = await run(options({ manifestPath: fixture(WITH_ERROR), format: 'github' }));
    expect(result.stdout).toMatch(/^::error .*file=src\/Input\.stories\.tsx::/m);
    expect(result.stdout).toContain('title=oversight/required-prop-undocumented');
    // The readable table still reaches the job summary.
    expect(result.stepSummary).toMatch(/Oversight manifest lint/);
  });

  it('keeps a multi-line @deprecated note to one step-summary table row (#30)', async () => {
    const result = await run(options({ manifestPath: fixture(DEPRECATED_MULTILINE) }));
    const stepSummary = result.stepSummary ?? '';
    const lines = stepSummary.split('\n');
    const table = lines.slice(lines.findIndex((line) => line.startsWith('| Component |')));
    // Header, separator, one finding, every line a closed row. A newline in the
    // message used to spill the rest of the note onto a fourth, unclosed line.
    expect(table).toHaveLength(3);
    for (const row of table) expect(row).toMatch(/^\|.*\|$/);
    expect(table[2]).toContain('use Gadget instead');
    expect(stepSummary).not.toContain('since 2.0');
  });

  it('always provides a step summary regardless of stdout format', async () => {
    const result = await run(options({ manifestPath: fixture(WITH_ERROR) }));
    expect(result.stepSummary).toMatch(/Oversight manifest lint/);
    expect(result.stepSummary).toMatch(/required-prop-undocumented/);
  });
});

describe('run: manifest provenance in the output (#35)', () => {
  it('names the linted manifest and its recorded extractor in text output', async () => {
    const path = fixture(CLEAN);
    const result = await run(options({ manifestPath: path }));
    expect(result.stdout).toContain(path);
    expect(result.stdout).toContain('react-docgen-typescript');
  });

  it('carries the manifest path in json output', async () => {
    const path = fixture(CLEAN);
    const parsed = JSON.parse((await run(options({ manifestPath: path, format: 'json' }))).stdout) as {
      summary: unknown;
    };
    expect(JSON.stringify(parsed.summary)).toContain(path);
  });

  it('labels the tally as entries', async () => {
    const result = await run(options({ manifestPath: fixture(WARNINGS_ONLY) }));
    expect(result.stdout.toLowerCase()).toMatch(/entr(y|ies)/);
  });

  it('labels the step summary counts as entries', async () => {
    const result = await run(options({ manifestPath: fixture(WARNINGS_ONLY) }));
    expect(result.stepSummary?.toLowerCase()).toMatch(/entr(y|ies)/);
  });
});

describe('run: shared component names in text output (#44)', () => {
  it('distinguishes headings for entries that share a component name (#44)', async () => {
    const shared = {
      v: 0,
      components: {
        'ui-widget': { name: 'Widget', path: './Widget.stories.tsx', reactDocgenTypescript: { props: {} } },
        'ui-widget-features': {
          name: 'Widget',
          path: './Widget.features.stories.tsx',
          reactDocgenTypescript: { props: {} },
        },
      },
    };
    const stdout = (await run(options({ manifestPath: fixture(shared) }))).stdout;
    const headings = stdout.split('\n').filter((l) => l.startsWith('Widget'));
    expect(headings).toHaveLength(2);
    expect(headings[0]).not.toBe(headings[1]);
  });

  it('survives a non-string path on an entry whose name is shared (#44)', async () => {
    const shared = {
      v: 0,
      components: {
        // Nothing validates the manifest, so `path` arrives as whatever JSON held.
        'ui-widget': { name: 'Widget', path: 42, reactDocgenTypescript: { props: {} } },
        'ui-widget-features': {
          name: 'Widget',
          path: './Widget.features.stories.tsx',
          reactDocgenTypescript: { props: {} },
        },
      },
    };
    const lint = () => run(options({ manifestPath: fixture(shared) }));
    await expect(lint()).resolves.toBeDefined();
    const result = await lint();
    // The entry with no usable path is labelled by its id; its sibling keeps the file.
    expect(result.stdout).toContain('Widget (ui-widget)');
    expect(result.stdout).toContain('Widget (Widget.features.stories.tsx)');
  });
});

describe('run: mass-failure collapse in text output (#34)', () => {
  it('collapses a manifest-wide docgen failure to one line naming share and signature', async () => {
    const entries = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        `ui-c${i}`,
        {
          name: `C${i}`,
          path: `./c${i}.stories.js`,
          error: {
            name: 'react-docgen-typescript found no component docs',
            message:
              'File: /repo/src/index.js\nreact-docgen-typescript did not return any component docs for this file.',
          },
        },
      ]),
    );
    const path = fixture({ v: 0, meta: { docgen: 'react-docgen-typescript' }, components: entries });
    const result = await run(options({ manifestPath: path }));
    expect(result.stdout).toMatch(/20 of 20/);
    expect(result.stdout).toMatch(/found no component docs/);
    // No per-entry component groups, and the reader is pointed at the full
    // list. The marker includes the message prefix because the header prints
    // the mkdtemp fixture path, whose random characters could contain "C7".
    expect(result.stdout).not.toContain('Docgen extraction failed for C7');
    expect(result.stdout).toContain('--json');

    const json = await run(options({ manifestPath: path, format: 'json' }));
    expect(Object.keys(JSON.parse(json.stdout).components)).toHaveLength(20);
  });

  it('groups a collapsed rule by error name, not by per-entry message text (#44)', async () => {
    const components = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `ui-c${i}`,
        {
          name: `C${i}`,
          path: `./c${i}.stories.tsx`,
          // One diagnosis, a different file path per entry: the grommet shape.
          error: {
            name: 'react-docgen-typescript found no component docs',
            message: `File: /repo/src/c${i}.tsx\nreact-docgen-typescript did not return any component docs for this file.`,
          },
        },
      ]),
    );
    const result = await run(options({ manifestPath: fixture({ v: 0, components }) }));
    expect(result.stdout).toContain('12 of 12 entries');
    expect(result.stdout).toContain('react-docgen-typescript found no component docs');
    expect(result.stdout).not.toMatch(/distinct errors|other errors/);
  });
});

describe('run: ref targets are confined to the build output', () => {
  // The ref grammar is checked as a string, which cannot see symlinks.
  // readFileSync follows them on every path component, so the boundary has to
  // be enforced after the path resolves.
  const REF_INDEX = {
    v: 1,
    meta: { docgen: 'react-component-meta' },
    components: {
      x: { id: 'x', name: 'X', docgen: { $ref: '../services/core/docgen/x.json#/components/x' } },
    },
  };

  /** Write a well-formed index into `<out>/manifests/`, leaving the target alone. */
  function refIndex(out: string): string {
    mkdirSync(join(out, 'manifests'), { recursive: true });
    writeFileSync(join(out, 'manifests/components.json'), JSON.stringify(REF_INDEX));
    return join(out, 'manifests/components.json');
  }

  function refTree(target: string): string {
    const out = join(dir, 'out');
    mkdirSync(join(out, 'manifests'), { recursive: true });
    mkdirSync(join(out, 'services/core/docgen'), { recursive: true });
    writeFileSync(
      join(out, 'manifests/components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          x: { id: 'x', name: 'X', docgen: { $ref: '../services/core/docgen/x.json#/components/x' } },
        },
      }),
    );
    symlinkSync(target, join(out, 'services/core/docgen/x.json'));
    return join(out, 'manifests/components.json');
  }

  it('refuses a symlink pointing outside the build output', async () => {
    const secret = join(dir, 'secret.json');
    writeFileSync(secret, JSON.stringify({ components: { x: { reactComponentMeta: { props: {} } } } }));
    const result = await run(options({ manifestPath: refTree(secret) }));
    // Degrades to a finding about that entry, never the file's contents.
    expect(result.stdout).toMatch(/docgen-missing/);
    expect(result.stdout).toMatch(/outside the build output/);
    expect(result.code).toBe(1);
  });

  it('refuses a ref that does not name a regular file', async () => {
    // A device or FIFO would otherwise hang the run until CI timed the job out.
    // The target sits inside the build output, so containment passes and the
    // file-type guard is the one under test.
    const out = join(dir, 'out');
    mkdirSync(join(out, 'services/core/docgen'), { recursive: true });
    mkdirSync(join(out, 'services/core/docgen/x.json'));
    const result = await run(options({ manifestPath: refIndex(out) }));
    expect(result.stdout).toMatch(/not a regular file/);
    expect(result.code).toBe(1);
  });

  it('refuses a ref target larger than the cap', async () => {
    const out = join(dir, 'out');
    mkdirSync(join(out, 'services/core/docgen'), { recursive: true });
    writeFileSync(join(out, 'services/core/docgen/x.json'), 'a'.repeat(8 * 1024 * 1024 + 1));
    const result = await run(options({ manifestPath: refIndex(out) }));
    expect(result.stdout).toMatch(/larger than/);
    expect(result.code).toBe(1);
  });

  it('reads a ref when the index has no manifests/ directory above it', async () => {
    // The build output is then the index's own directory, so a climbing ref is
    // reaching outside it even though `parseRef` allows one level.
    const out = join(dir, 'flat');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(dir, 'secret.json'), JSON.stringify({ components: { x: { reactComponentMeta: {} } } }));
    writeFileSync(
      join(out, 'components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: { x: { id: 'x', name: 'X', docgen: { $ref: '../secret.json#/components/x' } } },
      }),
    );
    const result = await run(options({ manifestPath: join(out, 'components.json') }));
    expect(result.stdout).toMatch(/outside the build output/);
    expect(result.stdout).not.toMatch(/reactComponentMeta/);
  });

  it('accepts a target under a filesystem-root build output', () => {
    // `root + sep` would be `//` here, which no legitimate target is prefixed
    // by, so a prefix compare refuses every ref. Not reachable through `run`:
    // it needs the index's directory to be a direct child of the root.
    expect(containedIn(sep, join(sep, 'out', 'services', 'core', 'x.json'))).toBe(true);
    expect(containedIn(join(sep, 'out'), join(sep, 'etc', 'passwd'))).toBe(false);
    expect(containedIn(join(sep, 'out'), join(sep, 'out'))).toBe(false);
  });

  it('reads a build output staged through symlinked directories', async () => {
    const real = join(dir, 'real-out');
    mkdirSync(join(real, 'manifests'), { recursive: true });
    mkdirSync(join(real, 'services/core/docgen'), { recursive: true });
    writeFileSync(
      join(real, 'services/core/docgen/x.json'),
      JSON.stringify({ components: { x: { path: './x.stories.tsx', reactComponentMeta: { props: {} } } } }),
    );
    writeFileSync(join(real, 'manifests/components.json'), JSON.stringify(REF_INDEX));
    const staged = join(dir, 'staged');
    mkdirSync(staged);
    symlinkSync(join(real, 'manifests'), join(staged, 'manifests'));
    symlinkSync(join(real, 'services'), join(staged, 'services'));
    const result = await run(options({ manifestPath: join(staged, 'manifests/components.json') }));
    expect(result.stdout).not.toMatch(/outside the build output/);
  });
});

describe('run: annotations survive the ref format (#51)', () => {
  // The v:1 index carries no `path`, so every anchor here comes from a resolved
  // payload. #51 exists because losing that is silent: annotations stop landing
  // on files rather than erroring. These fixtures are core's, because the point
  // is comparing the two formats of the same six components.
  const coreFixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

  /**
   * One entry per annotation, carrying its anchor or null. Keeping the
   * unanchored ones is the point: filtering them out would hide the regression
   * this block exists to catch, since a finding that loses its anchor would
   * leave the survivors looking correct.
   */
  function annotations(stdout: string): { rule: string; file: string | null }[] {
    return stdout
      .split('\n')
      .filter((line) => line.startsWith('::'))
      .map((line) => {
        // `::<command> <properties>::<message>`. `encodeData` leaves `=` and `,`
        // in the message, so only the properties may be searched for `file=`.
        const properties = /^::\w+ (.*?)::/.exec(line)?.[1] ?? '';
        return {
          rule: /title=oversight\/([^,]+)/.exec(properties)?.[1] ?? '',
          file: /file=([^,]+)/.exec(properties)?.[1] ?? null,
        };
      });
  }

  const anchorsOf = (stdout: string) =>
    annotations(stdout)
      .map((a) => a.file)
      .sort();

  it('anchors every component finding to a file it is about', async () => {
    const result = await run(options({ manifestPath: coreFixture('v1/manifests/components.json'), format: 'github' }));
    const anns = annotations(result.stdout);
    expect(anns.length).toBeGreaterThan(0);
    // Every finding this fixture produces is component-scoped, so an unanchored
    // one is a regression rather than a manifest-level finding.
    expect(anns.filter((a) => a.file === null)).toEqual([]);
    // every rule here is about the component's own source, not its stories
    expect(anns.every((a) => a.file?.endsWith('.tsx'))).toBe(true);
    expect(anns.some((a) => a.file?.endsWith('.stories.tsx'))).toBe(false);
    // Never the `./` the manifest stores, which GitHub would not match.
    expect(anns.some((a) => a.file?.startsWith('./'))).toBe(false);
  });

  it('anchors them to the same files the inline manifest does', async () => {
    // Comparing the two formats rather than hardcoding paths means this follows
    // the fixtures when they change. It proves the formats agree; the test above
    // is what proves the anchors are there at all.
    const ref = await run(options({ manifestPath: coreFixture('v1/manifests/components.json'), format: 'github' }));
    const inline = await run(
      options({ manifestPath: coreFixture('v0-react-component-meta/components.json'), format: 'github' }),
    );
    // Both runs have to have found something, or this compares two empty lists.
    // A missing fixture exits 2 with no output rather than throwing.
    expect(ref.code).toBe(1);
    expect(inline.code).toBe(1);
    expect(anchorsOf(ref.stdout)).toEqual(anchorsOf(inline.stdout));
    expect(anchorsOf(ref.stdout).length).toBeGreaterThan(0);
  });

  it('anchors from the docgen payload when the stories ref is the missing one', async () => {
    // Both payloads carry the same `path`, so either recovers the anchor alone.
    // Covering only one direction would leave the other copy free to delete.
    const out = join(dir, 'docgen-only');
    mkdirSync(join(out, 'manifests'), { recursive: true });
    mkdirSync(join(out, 'services/core/docgen'), { recursive: true });
    writeFileSync(
      join(out, 'services/core/docgen/x.json'),
      JSON.stringify({
        components: { x: { path: './src/Widget.stories.tsx', reactComponentMeta: { props: {} } } },
      }),
    );
    writeFileSync(
      join(out, 'manifests/components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          x: {
            id: 'x',
            name: 'Widget',
            docgen: { $ref: '../services/core/docgen/x.json#/components/x' },
            stories: { $ref: '../services/core/story-docs/x.json#/components/x' },
          },
        },
      }),
    );
    const result = await run(options({ manifestPath: join(out, 'manifests/components.json'), format: 'github' }));
    expect(annotations(result.stdout).map((a) => a.file)).toContain('src/Widget.stories.tsx');
  });

  it('keeps the anchor a component can still recover, and drops the one it cannot', async () => {
    // feedback-banner keeps its story-docs payload, which carries the same
    // `path`; layout-panel lost both, so nothing anchors it. Neither throws.
    const result = await run(
      options({ manifestPath: coreFixture('v1-dangling/manifests/components.json'), format: 'github' }),
    );
    const anns = annotations(result.stdout);
    expect(anns).toHaveLength(2);
    expect(anns.find((a) => a.file !== null)?.file).toBe('stories/Banner/Banner.stories.tsx');
    expect(anns.filter((a) => a.file === null)).toHaveLength(1);
    expect(result.code).toBe(1);
  });
});

describe('agent-view (#105)', () => {
  const coreFixture = (name: string) => fileURLToPath(new URL(`../../core/test/fixtures/${name}`, import.meta.url));

  const view = (manifestPath: string, id: string) => showAgentView({ manifestPath, id });

  /** A manifest an error-severity rule fires on, so "findings do not move the exit code" has something to be about. */
  const HAS_AN_ERROR: RawManifest = {
    v: 0,
    meta: { docgen: 'react-docgen-typescript' },
    components: {
      'ui-button': {
        id: 'ui-button',
        name: 'Button',
        path: 'src/Button.stories.tsx',
        description: 'A button.',
        reactDocgenTypescript: { description: 'A button.', props: { label: { required: true } } },
        stories: [{ id: 'ui-button--default', name: 'Default' }],
      },
    },
  };

  it('prints the text the server returns for the entry', async () => {
    const result = await view(fixture(CLEAN), 'ui-button');

    const lines = result.stdout.split('\n');
    expect(lines).toContain('# Button');
    expect(lines).toContain('ID: ui-button');
    // The selection surface renders the same entry, on its own unindented line.
    expect(lines).toContain('- Button (ui-button): A button.');
    expect(result.code).toBe(0);
  });

  it('exits 0 on a manifest a lint run fails, since it inspects rather than lints', async () => {
    const path = fixture(HAS_AN_ERROR);

    // The control: under lint this manifest fails, so the 0 below is the
    // command ignoring findings rather than a manifest that has none.
    expect((await run(options({ manifestPath: path }))).code).toBe(1);
    expect((await view(path, 'ui-button')).code).toBe(0);
  });

  it('fails with the answer the server itself gives for an id the manifest does not hold', async () => {
    const result = await view(fixture(CLEAN), 'ui-nothing');

    expect(result.stdout).toMatch(/The get-documentation call failed\./);
    expect(result.stdout).toMatch(/Component or Docs Entry not found: "ui-nothing"/);
    // The list is where an agent would have found a real id, and the output says so.
    expect(result.stdout).toMatch(/list-all-documentation/);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/ui-nothing/);
  });

  it('renders a v:1 entry through its refs', async () => {
    const result = await view(coreFixture('v1/manifests/components.json'), 'layout-panel');

    expect(result.stdout.split('\n')).toContain('# Panel');
    expect(result.code).toBe(0);
  });

  it('reports a ref that failed, by ref rather than by absolute path', async () => {
    const result = await view(coreFixture('v1-dangling/manifests/components.json'), 'layout-panel');

    // A failed call still returns text, so the report says which it is rather
    // than presenting the error as the documentation an agent receives.
    expect(result.stdout).toMatch(/The get-documentation call failed\./);

    const served = documentationSection(result.stdout);
    expect(served).toMatch(/failed to load: no such file/);
    // Quoted as the manifest writes it, fragment included, which is the string
    // the lint path's own error carries and the one a reader can grep for.
    expect(served).toMatch(/"\.\.\/services\/core\/docgen\/layout-panel\.json#\/components\/layout-panel"/);
    // The ref names itself; `realpathSync` would have named the absolute path it
    // tried, and this text is pasted into pull requests. The header line above
    // still echoes whatever path was passed, which is the operator's own.
    expect(served).not.toMatch(/\/Users\/|\/home\/|\/tmp\//);
    expect(result.code).toBe(2);
  });

  /** A fence line of the report's own wrapper: at least four tildes, alone on the line. */
  const isFence = (line: string) => /^~{4,}$/.test(line);

  /**
   * The fenced block under a heading.
   *
   * Sliced on whole lines rather than searched for: `ID: actions-button` is a
   * substring of every `Story ID: actions-button--primary` line in the same
   * output, and a substring search lands on whichever comes first. The closer is
   * the opener's own line repeated: `fenceFor` sizes the wrapper past every
   * tilde run the served text carries, so no interior line equals it.
   */
  function fencedRegionAfter(stdout: string, heading: string): string {
    const lines = stdout.split('\n');
    const at = lines.indexOf(heading);
    expect(at).toBeGreaterThan(-1);
    const open = lines.findIndex((line, i) => i > at && isFence(line));
    expect(open).toBeGreaterThan(at);
    const close = lines.indexOf(lines[open] as string, open + 1);
    expect(close).toBeGreaterThan(open);
    return lines.slice(open + 1, close).join('\n');
  }

  /** The section between the `get-documentation` heading and the closing line. */
  const documentationSection = (stdout: string) => fencedRegionAfter(stdout, DOCUMENTATION_HEADING);

  /** The v:1 leaves, keyed the way the server asks for them: relative to the build output. */
  function leavesOf(buildRoot: string): Record<string, unknown> {
    const files: Record<string, unknown> = {};
    for (const service of readdirSync(join(buildRoot, 'services', 'core'))) {
      const dir = join(buildRoot, 'services', 'core', service);
      for (const leaf of readdirSync(dir)) {
        files[`./services/core/${service}/${leaf}`] = JSON.parse(readFileSync(join(dir, leaf), 'utf8'));
      }
    }
    return files;
  }

  it('renders a docs entry, which the command and its help both say it takes', async () => {
    // `get-documentation` falls back to the docs manifest when no component
    // holds the id, so `<id>` means either. Nothing covered the docs half, and
    // neither core fixture has a docs.json to cover it with.
    const path = fixture(CLEAN);
    writeFileSync(
      join(dir, 'docs.json'),
      JSON.stringify({
        v: 0,
        docs: {
          'guides--install': { id: 'guides--install', name: 'Docs', title: 'Install', content: '# Install\n\nRun it.' },
        },
      }),
    );

    const result = await showAgentView({ manifestPath: path, id: 'guides--install' });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Run it.');
  });

  it('finds a docs entry whose title carries a parenthesized segment before a colon', async () => {
    // `- Getting started (v2): the basics (guides--start): ...` is one legal
    // bullet. A grammar match took the first `(...)` followed by `:` as the id
    // slot and read "v2", so the entry's own id never matched and the report
    // claimed the list does not offer an entry that sits right in it.
    const path = fixture(CLEAN);
    writeFileSync(
      join(dir, 'docs.json'),
      JSON.stringify({
        v: 0,
        docs: {
          'guides--start': {
            id: 'guides--start',
            name: 'Docs',
            title: 'Getting started (v2): the basics',
            content: '# Start\n\nHere.',
          },
        },
      }),
    );

    const result = await showAgentView({ manifestPath: path, id: 'guides--start' });

    expect(result.code).toBe(0);
    const printed = selectionSection(result.stdout);
    expect(printed.startsWith('- Getting started (v2): the basics (guides--start)')).toBe(true);
    expect(result.stdout).not.toContain('It is not offered by list-all-documentation');
  });

  it('renders the components when a foreign docs.json sits beside the manifest', async () => {
    // `docs.json` is also what TypeDoc and Docusaurus write. Served as though it
    // were Storybook's, it parses and then fails the schema inside the server,
    // which fails the whole call and leaves a good components manifest showing
    // nothing at all.
    const path = fixture(CLEAN);
    writeFileSync(join(dir, 'docs.json'), JSON.stringify({ name: 'my-typedoc', entries: [] }));

    const result = await showAgentView({ manifestPath: path, id: 'ui-button' });

    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toContain('# Button');
  });

  const withDescriptions = (entries: Record<string, string>): RawManifest => ({
    v: 0,
    meta: { docgen: 'react-docgen-typescript' },
    components: Object.fromEntries(
      Object.entries(entries).map(([id, description]) => [
        id,
        {
          id,
          name: id.replace(/^ui-/, '').replace(/^./, (c) => c.toUpperCase()),
          path: `src/${id}.stories.tsx`,
          description,
          reactDocgenTypescript: { description, props: {} },
          stories: [],
        },
      ]),
    ),
  });

  it('picks the bullet whose own id matches, not one that mentions it', async () => {
    // The id appears in Button's description text and in Card's id slot. A
    // substring match returns Button's line under a heading that says ui-card.
    const path = fixture(
      withDescriptions({
        'ui-button': 'A button. See the card wrapper (ui-card) for layout.',
        'ui-card': 'A card.',
      }),
    );

    const printed = selectionSection((await view(path, 'ui-card')).stdout);

    expect(printed.startsWith('- Card (ui-card)')).toBe(true);
    expect(printed).not.toContain('ui-button');
  });

  it('skips a description line shaped like an entry and naming a sibling id', async () => {
    // Alpha precedes Card in the list, and its description carries a line
    // shaped exactly like a list entry with Card's real id in the id slot.
    // Anchoring on line shape picked it and printed a fragment of Alpha's
    // description under Card's heading; the anchor is Card's own
    // `- Card (ui-card)` prefix, which the decoy does not carry.
    const path = fixture(
      withDescriptions({
        'ui-alpha': 'Legacy.\n- prefer the newer wrapper (ui-card): lighter',
        'ui-card': 'A card.',
      }),
    );

    const printed = selectionSection((await view(path, 'ui-card')).stdout);

    expect(printed.startsWith('- Card (ui-card)')).toBe(true);
    expect(printed).not.toContain('prefer the newer wrapper');
  });

  it('keeps a wrapped entry whose description contains markdown of its own', async () => {
    // The terminator used to stop at any line starting with `- `, whitespace or
    // `#`, all of which a description can contain, so the rest of the bullet and
    // the ellipsis marking the server's cut were dropped.
    const path = fixture(
      withDescriptions({
        'ui-panel':
          'Panels group related controls together and can be collapsed.\nUse them for:\n- sidebars\n- toolbars',
      }),
    );

    const printed = selectionSection((await view(path, 'ui-panel')).stdout);

    expect(printed.split('\n').length).toBeGreaterThan(2);
    expect(printed).toContain('- sidebars');
    expect(printed.endsWith('...')).toBe(true);
  });

  it('keeps a wrapped entry across the blank line its description carries', async () => {
    // The 90-character cut preserves interior newlines, blank ones included, so
    // a description opening with a short paragraph arrives as bullet, blank
    // line, remainder, ellipsis. Ending the bullet at the blank line dropped
    // the remainder and the ellipsis, and the prefix that survived still passed
    // a verbatim containment check.
    const path = fixture(
      withDescriptions({
        'ui-panel':
          'Groups controls.\n\nCollapse it to save space when a sidebar gets crowded, then expand it on demand.',
      }),
    );

    const printed = selectionSection((await view(path, 'ui-panel')).stdout);

    expect(printed).toContain('\n\n');
    expect(printed).toContain('Collapse it to save space');
    expect(printed.endsWith('...')).toBe(true);
    expect(printed).not.toContain('# Docs');
  });

  it('says the docs manifest was refused, rather than reporting the entry as absent', async () => {
    // Upstream drops a rejected docs request and carries on, so a docs entry
    // then reads as one the server does not offer. A file this run declined to
    // open is a different thing from a file that is not there.
    const path = fixture(CLEAN);
    const away = mkdtempSync(join(tmpdir(), 'oversight-docs-'));
    const outside = join(away, 'docs.json');
    writeFileSync(
      outside,
      JSON.stringify({ v: 0, docs: { 'guides--install': { id: 'guides--install', name: 'Docs' } } }),
    );
    symlinkSync(outside, join(dir, 'docs.json'));

    const result = await showAgentView({ manifestPath: path, id: 'guides--install' });

    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/docs manifest was not read/);
    rmSync(away, { recursive: true, force: true });
  });

  it('refuses a climbing ref the lint path refuses, from a manifest outside a manifests/ directory', async () => {
    // Every other v:1 case here puts the index in `<out>/manifests/`, where the
    // build root and the ref base are the same directory, so nothing separates
    // them. Flat, they differ: agent-view used to resolve the server's already
    // normalized `./services/x` against the build root and print a payload the
    // lint path had refused and reported `docgen-missing` on.
    const flat = join(dir, 'flat');
    mkdirSync(join(flat, 'services', 'core', 'docgen'), { recursive: true });
    writeFileSync(
      join(flat, 'components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            docgen: { $ref: '../services/core/docgen/ui-badge.json#/components/ui-badge' },
          },
        },
      }),
    );
    writeFileSync(
      join(flat, 'services', 'core', 'docgen', 'ui-badge.json'),
      JSON.stringify({
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            path: './b.stories.tsx',
            reactComponentMeta: { description: 'A badge.', props: {} },
          },
        },
      }),
    );
    const manifestPath = join(flat, 'components.json');

    const linted = await run(options({ manifestPath }));
    const viewed = await showAgentView({ manifestPath, id: 'ui-badge' });

    // The lint path refuses the climb out of the build output.
    expect(linted.stdout).toMatch(/docgen-missing/);
    // agent-view has to agree rather than find the file and print it.
    expect(viewed.code).toBe(2);
    expect(documentationSection(viewed.stdout)).not.toContain('A badge.');
  });

  it('reads a same-directory ref where the lint path reads it, from a manifest outside a manifests/ directory', async () => {
    // The inverse direction of the climb above. Upstream reports this ref as
    // `./manifests/leaf.json`, and resolving that against the parent invented a
    // manifests/ directory the layout does not have, so the call failed on a
    // payload the lint path had read.
    const flat = join(dir, 'flat-same-dir');
    mkdirSync(flat, { recursive: true });
    writeFileSync(
      join(flat, 'components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            docgen: { $ref: './leaf.json#/components/ui-badge' },
          },
        },
      }),
    );
    writeFileSync(
      join(flat, 'leaf.json'),
      JSON.stringify({
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            path: './b.stories.tsx',
            reactComponentMeta: {
              description: 'A same-directory badge.',
              props: { tone: { description: 'Its tone.', required: true } },
            },
          },
        },
      }),
    );
    const manifestPath = join(flat, 'components.json');

    const linted = await run(options({ manifestPath }));
    const viewed = await showAgentView({ manifestPath, id: 'ui-badge' });

    // The lint path resolves this ref, so agreement means rendering it.
    expect(linted.stdout).not.toMatch(/docgen-missing/);
    expect(viewed.code).toBe(0);
    const served = documentationSection(viewed.stdout);
    // The prop and its JSDoc, since the payload is what the ref reaches; the
    // description would not show either way, coming from the entry alone.
    expect(served).toContain('## Props');
    expect(served).toContain('Its tone.');
  });

  it('refuses a ref that climbs twice, instead of reading the file the server clamps it to', async () => {
    // The server's URL join clamps `../../shared/x` to the same request as
    // `../shared/x`, so inverting the join resolved the clamped form inside the
    // build output. With `<out>/shared/ui-badge.json` present, agent-view
    // rendered a payload from a file the ref never named, while lint refused
    // the ref for escaping the build output.
    const out = join(dir, 'clamped');
    mkdirSync(join(out, 'manifests'), { recursive: true });
    mkdirSync(join(out, 'shared'), { recursive: true });
    writeFileSync(
      join(out, 'manifests', 'components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            docgen: { $ref: '../../shared/ui-badge.json#/components/ui-badge' },
          },
        },
      }),
    );
    writeFileSync(
      join(out, 'shared', 'ui-badge.json'),
      JSON.stringify({
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            reactComponentMeta: { description: 'A clamped badge.', props: {} },
          },
        },
      }),
    );
    const manifestPath = join(out, 'manifests', 'components.json');

    const linted = await run(options({ manifestPath }));
    const viewed = await showAgentView({ manifestPath, id: 'ui-badge' });

    expect(linted.stdout).toMatch(/docgen-missing/);
    expect(viewed.code).toBe(2);
    expect(documentationSection(viewed.stdout)).not.toContain('A clamped badge.');
  });

  it('reads a ref with a space in its path, which the server requests percent-encoded', async () => {
    // The server's URL join percent-encodes the path, so `My Components`
    // arrives as `My%20Components`. Resolving the request literally hit ENOENT
    // on a `%20` directory and reported a broken ref for a build whose ref the
    // lint path reads.
    const out = join(dir, 'spaced');
    mkdirSync(join(out, 'manifests'), { recursive: true });
    mkdirSync(join(out, 'services', 'My Components'), { recursive: true });
    writeFileSync(
      join(out, 'manifests', 'components.json'),
      JSON.stringify({
        v: 1,
        meta: { docgen: 'react-component-meta' },
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            docgen: { $ref: '../services/My Components/ui-badge.json#/components/ui-badge' },
          },
        },
      }),
    );
    writeFileSync(
      join(out, 'services', 'My Components', 'ui-badge.json'),
      JSON.stringify({
        components: {
          'ui-badge': {
            id: 'ui-badge',
            name: 'Badge',
            reactComponentMeta: {
              description: 'A spaced badge.',
              props: { tone: { description: 'Its tone.', required: true } },
            },
          },
        },
      }),
    );
    const manifestPath = join(out, 'manifests', 'components.json');

    const linted = await run(options({ manifestPath }));
    const viewed = await showAgentView({ manifestPath, id: 'ui-badge' });

    expect(linted.stdout).not.toMatch(/docgen-missing/);
    expect(viewed.code).toBe(0);
    expect(documentationSection(viewed.stdout)).toContain('Its tone.');
  });

  it('outgrows a tilde fence a docs entry carries, driven end to end', async () => {
    // `formatDocsManifest` interpolates the entry's `content` verbatim, so a
    // page demonstrating a backtick block inside a tilde fence puts a `~~~~`
    // line in the served text. A fixed four-tilde wrapper would close on it and
    // spill the rest of the entry into the surrounding document.
    const path = fixture(CLEAN);
    writeFileSync(
      join(dir, 'docs.json'),
      JSON.stringify({
        v: 0,
        docs: {
          'guides--fences': {
            id: 'guides--fences',
            name: 'Docs',
            title: 'Fences',
            content: 'To hold a backtick block, use tildes:\n\n~~~~\n```js\ncode\n```\n~~~~\n\nDone.',
          },
        },
      }),
    );

    const result = await showAgentView({ manifestPath: path, id: 'guides--fences' });
    expect(result.code).toBe(0);

    const lines = result.stdout.split('\n');
    const heading = lines.indexOf(DOCUMENTATION_HEADING);
    const open = lines.findIndex((line, i) => i > heading && /^~{4,}$/.test(line));
    const close = lines.findIndex((line, i) => i > open && line === lines[open]);
    // Wider than the fence the served text carries, so the wrapper is the line
    // that closes the section.
    expect(lines[open].length).toBeGreaterThan(4);
    const region = lines.slice(open + 1, close);
    expect(region).toContain('~~~~');
    expect(region.join('\n')).toContain('Done.');
  });

  it('outgrows a tilde fence indented inside a list item, driven end to end', async () => {
    // A closing fence may be indented up to three spaces (CommonMark 4.5), so
    // an indented `~~~~` inside a served list item still closes a four-tilde
    // wrapper when the report is pasted. A column-zero scan missed it and the
    // minimum wrapper spilled the rest of the entry.
    const path = fixture(CLEAN);
    writeFileSync(
      join(dir, 'docs.json'),
      JSON.stringify({
        v: 0,
        docs: {
          'guides--nested': {
            id: 'guides--nested',
            name: 'Docs',
            title: 'Nested fences',
            content: 'Hold a block inside a list:\n\n- like this:\n  ~~~~\n  code\n  ~~~~\n\nDone.',
          },
        },
      }),
    );

    const result = await showAgentView({ manifestPath: path, id: 'guides--nested' });
    expect(result.code).toBe(0);

    const lines = result.stdout.split('\n');
    const heading = lines.indexOf(DOCUMENTATION_HEADING);
    const open = lines.findIndex((line, i) => i > heading && isFence(line));
    expect((lines[open] as string).length).toBeGreaterThan(4);
    const served = documentationSection(result.stdout);
    expect(served).toContain('  ~~~~');
    expect(served).toContain('Done.');
  });

  /** Every fenced region in the report, whatever width the fence was sized to. */
  function fencedRegions(stdout: string): string[] {
    const lines = stdout.split('\n');
    const regions: string[] = [];
    let open: number | undefined;
    lines.forEach((line, i) => {
      if (open === undefined) {
        if (isFence(line)) open = i;
      } else if (line === lines[open]) {
        regions.push(lines.slice(open + 1, i).join('\n'));
        open = undefined;
      }
    });
    return regions;
  }

  it("keeps this tool's own sentences outside every fence", async () => {
    // The closing line claims everything fenced under those headings is what the
    // server returned. Both notes the report can add are ours, so a fence that
    // contains one makes the report lie about its own contents. Asserting the
    // note merely appears somewhere cannot catch that.
    const path = fixture(CLEAN);
    const result = await showAgentView({ manifestPath: path, id: 'ui-nothing' });

    const fenced = fencedRegions(result.stdout);
    expect(fenced.length).toBeGreaterThan(0);
    for (const region of fenced) {
      expect(region).not.toContain('The get-documentation call failed.');
      expect(region).not.toContain('It is not offered by list-all-documentation');
    }
    // The control: both notes are in the report, just not inside a fence.
    expect(result.stdout).toContain('The get-documentation call failed.');
    expect(result.stdout).toContain('It is not offered by list-all-documentation');
  });

  /** The fenced block under the selection heading. */
  const selectionSection = (stdout: string) => fencedRegionAfter(stdout, '## list-all-documentation');

  it('prints the whole selection entry, including what the server wrapped onto a second line', async () => {
    const root = coreFixture('v1');
    const raw: unknown = JSON.parse(readFileSync(join(root, 'manifests', 'components.json'), 'utf8'));
    const list = await listAllDocumentation(mcp, filesFor(mcp, raw, leavesOf(root)));
    const printed = selectionSection(
      await view(join(root, 'manifests', 'components.json'), 'actions-button').then((r) => r.stdout),
    );

    // The server cuts a description at 90 characters without touching the
    // newlines inside it, so this entry arrives as two physical lines and the
    // ellipsis that marks the cut is on the second. Reading one line dropped
    // both, and the entry read as though the server had ended it mid-sentence.
    expect(printed.split('\n').length).toBeGreaterThan(1);
    expect(printed.endsWith('...')).toBe(true);
    // Verbatim from the list rather than reassembled, so any mangling fails.
    expect(list.text).toContain(printed);
    expect(list.isError).toBe(false);
  });

  it('prints what the driver returns for the same manifest, resolved from disk instead of memory', async () => {
    const root = coreFixture('v1');
    const raw: unknown = JSON.parse(readFileSync(join(root, 'manifests', 'components.json'), 'utf8'));

    // Two providers over one manifest: the driver answers from a map held in
    // memory, the CLI from the filesystem, through realpath, a containment
    // check and the root it computes from the manifest's own path. A wrong root
    // or a mismatched `..` would diverge the two texts, which is the difference
    // this compares. The formatter is the same on both sides by construction.
    const direct = await getDocumentation(mcp, filesFor(mcp, raw, leavesOf(root)), 'actions-button');
    const result = await view(join(root, 'manifests', 'components.json'), 'actions-button');

    expect(direct.isError).toBe(false);
    // Non-empty and distinctive, so the comparison is not two empty strings.
    expect(direct.text.split('\n')).toContain('# Button');
    expect(direct.text.split('\n')).toContain('## Props');
    expect(documentationSection(result.stdout)).toBe(direct.text);
  });
});
