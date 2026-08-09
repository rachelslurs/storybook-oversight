/**
 * Finds the copy of `@storybook/mcp` whose output `oversight agent-view` prints.
 *
 * The command's only claim is that the text is what the MCP serves, so it renders
 * with the copy the inspected project installs where there is one. That is not
 * the same copy this CLI declares: `@storybook/addon-mcp` pins `@storybook/mcp`
 * exactly (storybookjs/storybook, `code/addons/mcp/package.json`), and both
 * packages moved to Storybook's version line at 10.6 while this CLI's pin sits
 * on the old one, so a project's copy and ours can differ by a whole numbering
 * scheme. Resolution runs from the manifest's own directory rather than the
 * working directory, because auditing another project's build by path must not
 * answer with this project's copy.
 *
 * The declared dependency is the fallback, for a manifest with no Storybook
 * install beside it: a design system audited from its published build output,
 * which is one of the uses the command exists for.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertDrivable } from 'oversight-agent-view';
import type { McpModule } from 'oversight-agent-view';

/** Where `@storybook/mcp` was found. Named in the output header. */
export type McpOrigin = 'project' | 'declared';

export type LoadedMcp = {
  mcp: McpModule;
  version: string;
  origin: McpOrigin;
};

/** Resolves a specifier from a file path, as `require.resolve` does. */
export type Resolver = (specifier: string, from: string) => string;

/** A copy of `@storybook/mcp` that could not be loaded or could not be used. */
export class McpLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpLoadError';
  }
}

const defaultResolver: Resolver = (specifier, from) => createRequire(from).resolve(specifier);

/**
 * The names `packages/agent-view`'s driver calls. Checked before the module is
 * handed over so a copy that has renamed one fails by name, rather than as a
 * `TypeError` from inside a registrar with no indication of which version ran.
 */
const REQUIRED = [
  'COMPONENT_MANIFEST_PATH',
  'DOCS_MANIFEST_PATH',
  'addGetDocumentationTool',
  'addGetStoryDocumentationTool',
  'addListAllDocumentationTool',
] as const;

type PackageJson = {
  version?: string;
  main?: string;
  exports?: { '.'?: string | { default?: string; import?: string } };
};

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
}

/**
 * The module file a package's `.` export points at.
 *
 * `require.resolve('@storybook/mcp')` would be shorter, but the package exports
 * no `require` condition, so resolving it that way fails on the entry while
 * succeeding on `./package.json`. Reading the manifest is what works for both
 * the 0.8 line and the 10.6 line, whose `.` export gained a `code` condition
 * alongside `types` and `default` (storybookjs/storybook,
 * `code/lib/mcp/package.json`).
 */
function entryUrl(packageJsonPath: string, pkg: PackageJson): string {
  const dot = pkg.exports?.['.'];
  const entry = typeof dot === 'string' ? dot : (dot?.default ?? dot?.import ?? pkg.main);
  // A nested condition map (`{".": {"import": {"default": ...}}}`) makes `entry`
  // an object, and `resolve` would then throw a path-argument TypeError that
  // reads as a broken install rather than a shape this does not read.
  if (typeof entry !== 'string' || entry === '') {
    throw new McpLoadError(
      `@storybook/mcp at ${packageJsonPath} declares no module entry this can read.\n` +
        `Its "." export resolved to ${typeof entry}, and only a string path or a flat condition map is handled.`,
    );
  }
  return pathToFileURL(resolve(dirname(packageJsonPath), entry)).href;
}

function validate(loaded: unknown, version: string, origin: McpOrigin): McpModule {
  const missing = REQUIRED.filter((name) => (loaded as Record<string, unknown>)[name] === undefined);
  if (missing.length > 0) {
    throw new McpLoadError(
      `@storybook/mcp ${version} (${describeOrigin(origin)}) is missing ${missing.join(', ')}.\n` +
        `\`oversight agent-view\` drives the server's own documentation tools, and this copy does not export them.`,
    );
  }
  return loaded as McpModule;
}

/** How the header names where a copy came from. */
export function describeOrigin(origin: McpOrigin): string {
  // Two things this line does not claim. The declared branch is reached when no
  // copy resolved, covering both a project with no `@storybook/addon-mcp` and
  // one whose addon cannot reach `@storybook/mcp`, and only the first is
  // checked. And the project branch says "nearest the manifest" rather than
  // "this project's": resolution walks up out of a downloaded build directory
  // into whatever install sits above it, which is the right copy in a checkout
  // and an ambient one when auditing a build on its own.
  return origin === 'project'
    ? 'resolved from the @storybook/addon-mcp nearest the manifest'
    : 'shipped with oversight-lint; no copy resolved near the manifest';
}

async function loadFrom(packageJsonPath: string, origin: McpOrigin): Promise<LoadedMcp> {
  const pkg = readPackageJson(packageJsonPath);
  const version = pkg.version ?? 'unknown version';
  const loaded: unknown = await import(entryUrl(packageJsonPath, pkg));
  const mcp = validate(loaded, version, origin);

  // Names alone say nothing about whether the driver's stub still fits this
  // copy, and the CLI renders with copies no test covers.
  try {
    await assertDrivable(mcp);
  } catch (err) {
    throw new McpLoadError(
      `@storybook/mcp ${version} (${describeOrigin(origin)}) cannot be driven: ${(err as Error).message}`,
    );
  }
  return { mcp, version, origin };
}

/**
 * Load the `@storybook/mcp` that should render this manifest.
 *
 * `resolver` is a parameter so both branches are reachable in tests without
 * standing up a `node_modules` tree for each.
 */
export async function loadMcp(manifestPath: string, resolver: Resolver = defaultResolver): Promise<LoadedMcp> {
  // `createRequire` wants a file, and the manifest is one, but it refuses a
  // relative path and the manifest argument is usually relative. Resolving the
  // addon first and `@storybook/mcp` from there follows the same edge npm does:
  // the addon depends on it, so under a strict node_modules layout that is the
  // only place the project's copy is reachable from.
  const from = resolve(manifestPath);

  // Resolution is the only step that may fall back. Any reason the two lookups
  // fail means there is no project copy to render with, including an addon that
  // stops exporting `./package.json` and answers ERR_PACKAGE_PATH_NOT_EXPORTED.
  // Loading and validating are past that point: a copy was found, so rendering
  // with a different one would attribute its text to a version the inspected
  // project does not have, in output pasted into pull requests.
  let projectPath: string | undefined;
  try {
    const addonPath = resolver('@storybook/addon-mcp/package.json', from);
    projectPath = resolver('@storybook/mcp/package.json', addonPath);
  } catch {
    projectPath = undefined;
  }

  if (projectPath !== undefined) {
    try {
      return await loadFrom(projectPath, 'project');
    } catch (err) {
      if (err instanceof McpLoadError) throw err;
      throw new McpLoadError(
        `Could not load the @storybook/mcp installed beside ${manifestPath}: ${(err as Error).message}`,
      );
    }
  }

  try {
    const mcpPath = resolver('@storybook/mcp/package.json', import.meta.url);
    return await loadFrom(mcpPath, 'declared');
  } catch (err) {
    if (err instanceof McpLoadError) throw err;
    throw new McpLoadError(
      `Could not load @storybook/mcp, which \`oversight agent-view\` renders with: ${(err as Error).message}`,
    );
  }
}
