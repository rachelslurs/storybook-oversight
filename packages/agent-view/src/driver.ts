/**
 * Drives Storybook's MCP server the way it is actually called, and records what
 * comes back.
 *
 * The functions that turn a manifest entry into the markdown an agent reads
 * (`formatComponentManifest`, `formatManifestsToLists`) are internal to
 * `@storybook/mcp`: they live in `src/utils/manifest-formatter/markdown.ts` and
 * `src/index.ts` re-exports neither. So the projection cannot be read by
 * importing them, and copying them out of `dist/` would test a copy that is free
 * to drift from what ships. The tool registrars *are* exported, and a maintainer
 * has confirmed they are public API (storybookjs/mcp#150). So a stub server
 * captures the handler a registrar installs, and the handler is then invoked
 * directly: everything below that call is the shipped code path.
 *
 * Measured against `@storybook/mcp` 0.8.0. That version was published from
 * storybookjs/mcp; the source has since moved to storybookjs/storybook under
 * `code/lib/mcp/`, keeping the same package name and the same exports, and every
 * upstream path named in this package is relative to that directory.
 *
 * The registrars arrive as an argument rather than an import. The CLI renders
 * with whichever copy of `@storybook/mcp` the inspected project installs, which
 * a static import cannot express, and passing the module in makes *which* copy
 * produced a given text explicit rather than implicit.
 *
 * `manifestProvider` hands the server a JSON string. That is the seam that lets
 * every variant be an in-memory object, with no temp directory and no Storybook
 * process, and lets the CLI answer from a build output on disk.
 */
import type {
  COMPONENT_MANIFEST_PATH,
  DOCS_MANIFEST_PATH,
  StorybookContext,
  addGetDocumentationTool,
  addGetStoryDocumentationTool,
  addListAllDocumentationTool,
} from '@storybook/mcp';

/**
 * The part of `@storybook/mcp` this driver touches.
 *
 * Types come from the version this workspace declares; the module passed in may
 * be a different one the inspected project installs. `loadMcp` in the CLI checks
 * that every name here is present, which catches a rename or a removal and
 * nothing else: a registrar whose signature or context slot moved still has all
 * five names. `assertDrivable` below is what covers that.
 */
export type McpModule = {
  COMPONENT_MANIFEST_PATH: typeof COMPONENT_MANIFEST_PATH;
  DOCS_MANIFEST_PATH: typeof DOCS_MANIFEST_PATH;
  addGetDocumentationTool: typeof addGetDocumentationTool;
  addGetStoryDocumentationTool: typeof addGetStoryDocumentationTool;
  addListAllDocumentationTool: typeof addListAllDocumentationTool;
};

/** A tool result reduced to the two things an agent can act on. */
export type ToolResult = {
  /** The `text` of the single content block the documentation tools return. */
  text: string;
  /** Whether the call was flagged as failed. A silent failure leaves this false. */
  isError: boolean;
};

/**
 * The files the server may ask for, keyed by the path it asks for them under.
 *
 * A `$ref` resolves against `manifests/`, so a v:1 docgen leaf is requested as
 * `./services/core/docgen/<id>.json`. A path with no entry rejects, which is how
 * a dangling `$ref` is reproduced.
 */
export type ManifestFiles = Record<string, unknown>;

/**
 * Where the server's manifest requests are answered from: an in-memory map, or a
 * loader that reads them. Rejecting is how a path 404s, either way.
 */
export type ManifestSource = ManifestFiles | ((path: string) => Promise<string>);

type ToolContent = { type: string; text: string };
type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: ToolContent[];
  isError?: boolean;
}>;
type Registrar = McpModule['addGetDocumentationTool' | 'addGetStoryDocumentationTool' | 'addListAllDocumentationTool'];

function providerFor(source: ManifestSource): StorybookContext {
  return {
    manifestProvider: async (_request, path) => {
      if (typeof source === 'function') return source(path);
      const file = source[path];
      if (file === undefined) {
        // What the real fetch-based provider fails with when a path 404s, from
        // `defaultManifestProvider` in `src/utils/get-manifest.ts` upstream.
        throw new Error('Failed to fetch manifest: 404 Not Found');
      }
      return JSON.stringify(file);
    },
  };
}

async function callTool(
  register: Registrar,
  source: ManifestSource,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  let handler: ToolHandler | undefined;

  const server = {
    tool: (_metadata: unknown, fn: ToolHandler) => {
      handler = fn;
    },
    ctx: { custom: providerFor(source) },
  };

  // The registrars type their first argument as tmcp's `McpServer`. Only `.tool`
  // and `.ctx.custom` are ever touched, so a stub carrying those two is enough to
  // capture the handler; the cast is the price of not standing up a transport.
  await register(server as unknown as Parameters<Registrar>[0], () => true);

  if (!handler) throw new Error('the registrar installed no handler');

  const result = await handler(input);
  return { text: result.content[0]?.text ?? '', isError: result.isError ?? false };
}

/**
 * Assemble the file map for a single-source Storybook. `extra` carries the `$ref`
 * targets a v:1 manifest points at; omitting one makes that ref dangle.
 */
export function filesFor(mcp: McpModule, manifest: unknown, extra: ManifestFiles = {}): ManifestFiles {
  return {
    [mcp.COMPONENT_MANIFEST_PATH]: manifest,
    [mcp.DOCS_MANIFEST_PATH]: { v: 0, docs: {} },
    ...extra,
  };
}

/** `get-documentation`, what an agent reads once it has chosen a component. */
export function getDocumentation(mcp: McpModule, source: ManifestSource, id: string): Promise<ToolResult> {
  return callTool(mcp.addGetDocumentationTool, source, { id });
}

/** `list-all-documentation`, the only surface a component is selected from. */
export function listAllDocumentation(
  mcp: McpModule,
  source: ManifestSource,
  options: { withStoryIds?: boolean } = {},
): Promise<ToolResult> {
  return callTool(mcp.addListAllDocumentationTool, source, options);
}

/** The id the probe below asks for, distinctive enough to find in the output. */
const PROBE_ID = 'oversight-drivable-probe';

const PROBE_MANIFEST = {
  v: 0,
  components: {
    [PROBE_ID]: {
      id: PROBE_ID,
      name: 'Probe',
      path: './probe.stories.tsx',
      description: 'Probe.',
      reactDocgenTypescript: { description: 'Probe.', props: {} },
      stories: [],
    },
  },
};

/**
 * Check that a copy of `@storybook/mcp` can actually be driven, before its
 * output is attributed to it.
 *
 * Presence of the five exports is not the assumption this driver rests on. It
 * rests on the stub's shape: that a registrar calls `server.tool` with the
 * handler second, and that the handler reads its context from `server.ctx.custom`.
 * Both are tmcp's shape seen through `@storybook/mcp` rather than its own API,
 * and the cast in `callTool` is what lets a structurally false object typecheck,
 * so nothing catches a change to either at build time.
 *
 * That was tolerable while one pinned copy was the only one ever driven, since
 * this package's tests exercise it on every run. The CLI resolves a copy at run
 * time, which moved the same assumptions onto versions no test covers. Driving
 * one component in memory exercises all of them at once and costs a single call.
 *
 * `asked` is the assertion that matters. If the context slot moves, the handler
 * never reaches this provider and falls through to the real fetch-based one, and
 * the failure surfaces as a network error against the user's own build rather
 * than as the version incompatibility it is.
 */
export async function assertDrivable(mcp: McpModule): Promise<void> {
  const files = filesFor(mcp, PROBE_MANIFEST);
  let asked = false;

  const { text, isError } = await getDocumentation(
    mcp,
    async (path) => {
      asked = true;
      const file = files[path];
      if (file === undefined) throw new Error('Failed to fetch manifest: 404 Not Found');
      return JSON.stringify(file);
    },
    PROBE_ID,
  );

  if (!asked) {
    throw new Error('it never read the manifest provider it was given, so its context is not where this expects.');
  }
  if (isError || !text.includes(PROBE_ID)) {
    throw new Error(
      `it returned no documentation for a component it was handed${isError ? ', and flagged an error' : ''}.`,
    );
  }
}

/** `get-documentation-for-story`, extra usage examples for one story. */
export function getStoryDocumentation(
  mcp: McpModule,
  source: ManifestSource,
  componentId: string,
  storyName: string,
): Promise<ToolResult> {
  return callTool(mcp.addGetStoryDocumentationTool, source, { componentId, storyName });
}
