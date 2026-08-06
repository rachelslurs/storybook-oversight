import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { warnOnDuplicateAddonDocs } from './preset';

/**
 * The check compares what this package resolves against what `process.cwd()`
 * resolves, so a duplicate is staged by giving it a different cwd carrying its
 * own `node_modules/@storybook/addon-docs`. Resolution reads the real
 * filesystem, which is why these write one instead of mocking `createRequire`:
 * a mock would only prove the assertions match the mock, and say nothing about
 * whether two vantage points actually resolve differently.
 */
const created: string[] = [];
const originalCwd = process.cwd();

function projectWithAddonDocs(version: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'oversight-preset-'));
  created.push(dir);

  if (version !== null) {
    const pkg = join(dir, 'node_modules/@storybook/addon-docs');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@storybook/addon-docs', version }));
  }

  return dir;
}

function warningsFrom(cwd: string): string[] {
  const messages: string[] = [];
  process.chdir(cwd);

  try {
    warnOnDuplicateAddonDocs((message) => messages.push(message));
  } finally {
    process.chdir(originalCwd);
  }

  return messages;
}

/** The copy this package itself resolves, which is the one to collide with. */
function ourInstalledVersion(): string {
  const path = createRequire(import.meta.url).resolve('@storybook/addon-docs/package.json');
  return JSON.parse(readFileSync(path, 'utf8')).version;
}

afterEach(() => {
  process.chdir(originalCwd);
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('warnOnDuplicateAddonDocs', () => {
  it('warns when the project resolves a different copy than the addon does', () => {
    const [warning, ...rest] = warningsFrom(projectWithAddonDocs('10.5.0'));

    expect(rest).toEqual([]);
    expect(warning).toContain('two different copies');
    // Both sides named and labelled. "There are two" without saying where leaves
    // the reader exactly where the raw TypeError does.
    expect(warning).toContain('(your project)');
    expect(warning).toContain('(this addon)');
    expect(warning).toContain('10.5.0');
    // The symptom, so someone searching the error they actually saw lands here.
    expect(warning).toContain('Cannot read properties of undefined');
    expect(warning).toContain('issues/93');
  });

  it('catches two installs of the same version, which fail the same way', () => {
    const [warning] = warningsFrom(projectWithAddonDocs(ourInstalledVersion()));

    expect(warning).toContain('two different copies');
  });

  it('stays silent when both resolve the same copy', () => {
    // This package's own directory resolves the workspace's single install,
    // which is what a correctly installed consumer looks like.
    expect(warningsFrom(originalCwd)).toEqual([]);
  });

  it('stays silent, rather than throwing, where addon-docs resolves to nothing', () => {
    // A peer this addon declares can legitimately be absent while some tool
    // loads the preset, and a diagnostic must never be the reason that fails.
    const orphan = mkdtempSync(join(tmpdir(), 'oversight-orphan-'));
    created.push(orphan);

    expect(() => warningsFrom(orphan)).not.toThrow();
    expect(warningsFrom(orphan)).toEqual([]);
  });
});
