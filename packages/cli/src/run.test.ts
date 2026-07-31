import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RawManifest } from 'oversight-core';
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

describe('run — exit codes', () => {
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

describe('run — extractor expectation wiring', () => {
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

describe('run — rule overrides and output', () => {
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

  it('anchors every component finding to a stories file', async () => {
    const result = await run(options({ manifestPath: coreFixture('v1/manifests/components.json'), format: 'github' }));
    const anns = annotations(result.stdout);
    expect(anns.length).toBeGreaterThan(0);
    // Every finding this fixture produces is component-scoped, so an unanchored
    // one is a regression rather than a manifest-level finding.
    expect(anns.filter((a) => a.file === null)).toEqual([]);
    expect(anns.every((a) => a.file?.endsWith('.stories.tsx'))).toBe(true);
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
