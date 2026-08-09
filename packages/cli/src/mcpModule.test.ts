/**
 * Which copy of `@storybook/mcp` renders the agent view.
 *
 * The resolver is a parameter so both branches are reachable without standing up
 * a `node_modules` tree per case: the point under test is the decision, not
 * Node's resolution algorithm.
 */
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeOrigin, loadMcp, type Resolver } from './mcpModule';

const require = createRequire(import.meta.url);
const REAL_MCP = require.resolve('@storybook/mcp/package.json');

/**
 * Resolves only the specifiers listed; anything else fails the way Node does.
 *
 * `from` is recorded rather than ignored. It is the argument that decides whose
 * copy renders, and a resolver that drops it leaves the anchoring untested.
 */
function resolverFor(known: Record<string, string>, from: string[] = []): Resolver {
  return (specifier, resolvedFrom) => {
    from.push(resolvedFrom);
    const hit = known[specifier];
    if (hit === undefined) {
      const err = new Error(`Cannot find module '${specifier}'`) as Error & { code: string };
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }
    return hit;
  };
}

describe('loadMcp', () => {
  it('looks for the copy beside the manifest, not beside the CLI', async () => {
    const manifest = join(tmpdir(), 'audited-project', 'storybook-static', 'manifests', 'components.json');
    const from: string[] = [];
    await loadMcp(manifest, resolverFor({ '@storybook/mcp/package.json': REAL_MCP }, from));

    // The first lookup decides whose copy renders. Anchored at this CLI instead,
    // every audit of another project's build would answer with the version
    // installed here, under a header claiming it came from theirs.
    expect(from[0]).toBe(manifest);
  });

  it('anchors an absolute path, since a relative one is what a run passes', async () => {
    const from: string[] = [];
    await loadMcp(
      'storybook-static/manifests/components.json',
      resolverFor({ '@storybook/mcp/package.json': REAL_MCP }, from),
    );

    // `createRequire` rejects a relative path outright, and the rejection is not
    // a missing module, so it would surface as a load failure rather than as the
    // absent addon it looks like.
    expect(isAbsolute(from[0] ?? '')).toBe(true);
  });

  it('renders with the copy the project installs when there is one', async () => {
    const loaded = await loadMcp(
      'components.json',
      resolverFor({
        '@storybook/addon-mcp/package.json': REAL_MCP,
        '@storybook/mcp/package.json': REAL_MCP,
      }),
    );

    expect(loaded.origin).toBe('project');
    expect(loaded.version).toMatch(/^\d+\./);
    expect(typeof loaded.mcp.addGetDocumentationTool).toBe('function');
  });

  it('falls back to the declared copy when no addon-mcp sits near the manifest', async () => {
    const loaded = await loadMcp('components.json', resolverFor({ '@storybook/mcp/package.json': REAL_MCP }));

    expect(loaded.origin).toBe('declared');
    expect(typeof loaded.mcp.addGetDocumentationTool).toBe('function');
  });

  it('names the two origins differently, since the header is the only place they are told apart', () => {
    expect(describeOrigin('project')).not.toBe(describeOrigin('declared'));
    expect(describeOrigin('declared')).toMatch(/oversight-lint/);
    // Only the addon is looked for, so the fallback cannot say the project has none.
    expect(describeOrigin('declared')).not.toMatch(/addon-mcp/);
  });

  it('falls back when the addon resolves in a way that yields no copy', async () => {
    // `@storybook/addon-mcp` exports `./package.json` today; a version that stops
    // would answer ERR_PACKAGE_PATH_NOT_EXPORTED rather than a missing module.
    // Every resolution failure means the same thing here: no project copy to
    // render with. Only loading and validating are past that point.
    const resolver: Resolver = (specifier, from) => {
      if (specifier === '@storybook/addon-mcp/package.json') {
        const err = new Error('No "exports" main defined') as Error & { code: string };
        err.code = 'ERR_PACKAGE_PATH_NOT_EXPORTED';
        throw err;
      }
      if (from.startsWith('file:')) return REAL_MCP;
      throw new Error(`unexpected lookup from ${from}`);
    };

    expect((await loadMcp('components.json', resolver)).origin).toBe('declared');
  });

  it('fails rather than falling back when a project copy is found but cannot be loaded', async () => {
    // Falling back here would print another version's text under a header
    // saying no copy was found beside the manifest, about a project that has
    // one. Reachable when @storybook/mcp is linked to an unbuilt checkout.
    const broken = fileURLToPath(new URL('./__fixtures__/unbuilt-mcp/package.json', import.meta.url));
    const resolver: Resolver = (_specifier, from) => (from.startsWith('file:') ? REAL_MCP : broken);

    await expect(loadMcp('components.json', resolver)).rejects.toThrow(/beside components\.json/);
  });

  it('refuses a copy that does not export the tools the driver calls', async () => {
    const partial = fileURLToPath(new URL('./__fixtures__/partial-mcp/package.json', import.meta.url));

    await expect(loadMcp('components.json', resolverFor({ '@storybook/mcp/package.json': partial }))).rejects.toThrow(
      /addGetDocumentationTool/,
    );
  });
});
