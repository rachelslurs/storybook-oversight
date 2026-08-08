/**
 * Drives Storybook's MCP server the way it is actually called, and records what
 * comes back.
 *
 * The functions that turn a manifest entry into the markdown an agent reads
 * (`formatComponentManifest`, `formatManifestsToLists`) are internal to
 * `@storybook/mcp`. They are not exported, so the projection cannot be read by
 * importing them, and copying them out of `dist/` would test a copy that is free
 * to drift from what ships. The tool registrars *are* exported. So a stub server
 * captures the handler a registrar installs, and the handler is then invoked
 * directly: everything below that call is the shipped code path.
 *
 * `manifestProvider` hands the server a JSON string. That is the seam that lets
 * every variant be an in-memory object, with no temp directory and no Storybook
 * process.
 */
import {
  COMPONENT_MANIFEST_PATH,
  DOCS_MANIFEST_PATH,
  addGetDocumentationTool,
  addGetStoryDocumentationTool,
  addListAllDocumentationTool,
  type StorybookContext,
} from '@storybook/mcp';

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

type ToolContent = { type: string; text: string };
type ToolHandler = (input: Record<string, unknown>) => Promise<{
  content: ToolContent[];
  isError?: boolean;
}>;
type Registrar =
  | typeof addGetDocumentationTool
  | typeof addGetStoryDocumentationTool
  | typeof addListAllDocumentationTool;

function providerFor(files: ManifestFiles): StorybookContext {
  return {
    manifestProvider: async (_request, path) => {
      const file = files[path];
      if (file === undefined) {
        // What the real fetch-based provider fails with when a path 404s.
        throw new Error('Failed to fetch manifest: 404 Not Found');
      }
      return JSON.stringify(file);
    },
  };
}

async function callTool(
  register: Registrar,
  files: ManifestFiles,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  let handler: ToolHandler | undefined;

  const server = {
    tool: (_metadata: unknown, fn: ToolHandler) => {
      handler = fn;
    },
    ctx: { custom: providerFor(files) },
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
export function filesFor(manifest: unknown, extra: ManifestFiles = {}): ManifestFiles {
  return {
    [COMPONENT_MANIFEST_PATH]: manifest,
    [DOCS_MANIFEST_PATH]: { v: 0, docs: {} },
    ...extra,
  };
}

/** `get-documentation`, what an agent reads once it has chosen a component. */
export function getDocumentation(files: ManifestFiles, id: string): Promise<ToolResult> {
  return callTool(addGetDocumentationTool, files, { id });
}

/** `list-all-documentation`, the only surface a component is selected from. */
export function listAllDocumentation(
  files: ManifestFiles,
  options: { withStoryIds?: boolean } = {},
): Promise<ToolResult> {
  return callTool(addListAllDocumentationTool, files, options);
}

/** `get-documentation-for-story`, extra usage examples for one story. */
export function getStoryDocumentation(
  files: ManifestFiles,
  componentId: string,
  storyName: string,
): Promise<ToolResult> {
  return callTool(addGetStoryDocumentationTool, files, { componentId, storyName });
}
