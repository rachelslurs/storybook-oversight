<p align="center">
  <img src="https://raw.githubusercontent.com/rachelslurs/storybook-oversight/main/assets/oversight-icon-128.png" alt="Oversight" width="96" height="96" />
</p>

<h1 align="center">storybook-addon-oversight</h1>

<p align="center">
  See what your agent can and can't see.<br />
  Diagnoses silent failures in your Storybook MCP manifest.
</p>

<p align="center">
  <a href="https://rachelslurs.github.io/storybook-oversight/"><strong>▶ Live demo</strong></a>
</p>

Your coding agent reads your components from the manifest Storybook's MCP server
generates. When a description never reaches that manifest (extraction failed, the
wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component
with no docs, and nothing tells you. Oversight lints the manifest per component
while you work, so the gap surfaces on the component in front of you.

![The Oversight panel cycling through Card, Tile, and Badge, flagging findings per component](https://raw.githubusercontent.com/rachelslurs/storybook-oversight/main/stories/assets/oversight-panel.gif)

<p>Blog post: <a href="https://rachel.fyi/posts/your-agent-is-reading-a-different-design-system"><em>Your Agent Is Reading a Different Design System</em></a></p>

## Requirements

- **Storybook ^10.3** (React projects).
- **React 18 or 19** in the consumer project. The addon's manager UI renders
  through Storybook's own React, so your app's React version is independent
  (needs `0.1.1+`; earlier versions crash the manager on React 19 projects).
- The **components-manifest** feature enabled and served in dev.
  [`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp)
  turns it on and serves `/manifests/components.json`, the manifest Oversight
  lints. Without it, the panel degrades to an "unavailable" state.
- Storybook's experimental `experimentalDocgenServer` flag is **not yet
  supported**. With it enabled the dev manifest is disabled by design, so the
  panel reports it as unavailable and points you to `storybook build`; a built
  ref-based manifest currently shows a "could not be parsed" state rather than
  coverage. Support for the ref-based format is tracked in
  [#13](https://github.com/rachelslurs/storybook-oversight/issues/13).

## Install

```bash
npm install --save-dev storybook-addon-oversight
# or: pnpm add -D storybook-addon-oversight
```

Register it in `.storybook/main.ts` (alongside `@storybook/addon-mcp`):

```ts
const config = {
  addons: ['@storybook/addon-mcp', 'storybook-addon-oversight'],
};
export default config;
```

Oversight's default `expectedExtractor` is `react-docgen-typescript`. Pin the
same extractor so JSDoc on components and props is actually extracted:

```ts
// .storybook/main.ts
const config = {
  typescript: { reactDocgen: 'react-docgen-typescript' },
};
```

### Optional: enable the Docs-page block

Register the global container in `.storybook/preview.ts` to render Oversight at
the bottom of every component Docs page:

```ts
import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';

const preview = {
  parameters: { docs: { container: OversightDocsContainer } },
};
export default preview;
```

Unattached MDX pages, such as an overview with no `of`, keep the plain Docs
container without an Oversight block. Remove the container from `preview.ts` to
disable the block globally.

To enable it on individual component MDX pages instead, place the block on each
page:

```mdx
import { Oversight } from 'storybook-addon-oversight/blocks';

<Oversight />
```

The Docs block and manager panel share the components-manifest prerequisite.

## What Oversight checks

The manifest Oversight lints is the _upstream_ artifact: Storybook's MCP
`get-documentation` reads from it, reformats it, and drops what it won't serve
(component-level JSDoc tags among them). So Oversight checks two things: that the
doc content the MCP will serve is present and good (component/prop descriptions),
and that the pipeline building the manifest is healthy enough to deliver it
(extraction succeeded, the expected docgen extractor ran). It adds no
documentation vocabulary of its own: selection guidance ("use X instead") lives
as a plain redirect sentence in the component description, typical Storybook
practice and passed through verbatim by `get-documentation`. Its one tag,
`@oversightIgnore`, is a lint-suppression directive.

## Surfaces

The same diagnostics appear in two places, independently:

- **Manager panel**: an "Oversight" tab in the addons drawer, shown on every
  component's **story** view (Storybook hides addon panels on Docs pages).
  Registering the addon in `.storybook/main.ts` enables it.
- **Docs-page block**: the same coverage rendered inline on Docs pages. It is an
  optional step in the [installation](#optional-enable-the-docs-page-block) and
  can be enabled globally or on individual component MDX pages.

## In CI

The same rules run headlessly over a built manifest with **`oversight-lint`**, so a
change that drops a component's docs fails the build instead of surfacing only in
the panel. After `storybook build`, point it at the emitted manifest:

```bash
npx oversight storybook-static/manifests/components.json
```

See [`oversight-lint`](../cli/README.md) for options, config, and exit codes.

## Diagnostics

The rules, their default severities, and what each fires on live in
[`oversight-lint`'s Diagnostics table](../cli/README.md#diagnostics), which also
covers [why these are lint rules](../cli/README.md#why-these-are-lint-rules). The
panel and the CLI run the same rules from `oversight-core`. In the panel,
`extractor-drift` shows in its own **Manifest** section, since it's a property of
the whole manifest rather than any one component.

## Troubleshooting `docgen-missing`

`docgen-missing` means `react-docgen-typescript` returned no docs for the
component's file, so its props and JSDoc never reach the manifest. An agent sees
the component with no documented props. In order of likelihood:

1. **`reactDocgen` isn't `react-docgen-typescript`.** See [Install](#install).
2. **Your root `tsconfig.json` is solution-style.** The default `npm create vite`
   (react-ts) scaffold ships a root that only delegates to project references and
   owns no files:

   ```jsonc
   // tsconfig.json
   { "files": [], "references": [{ "path": "./tsconfig.app.json" } /* , … */] }
   ```

   Storybook's manifest docgen (`@storybook/react`) resolves the nearest tsconfig
   at your project root and builds its TypeScript program from it. A solution-style
   root contributes no files of its own, so the program is empty and extraction
   returns nothing, even for a fully-typed, fully-documented component. Give that
   root config your sources:

   ```jsonc
   // tsconfig.json
   { "extends": "./tsconfig.app.json", "include": ["src"] }
   ```

3. **`reactDocgenTypescriptOptions.tsconfigPath` won't fix this.** There are two
   docgen paths and they don't share a tsconfig: Storybook's Docs UI honors
   `typescript.reactDocgenTypescriptOptions.tsconfigPath`, but the manifest docgen
   that Oversight reads uses `findTsconfigPath(cwd)` and ignores it. So that
   override can make your Docs prop tables render while this finding still fires.
   Fix the tsconfig your project _root_ resolves to (point 2).

## Authoring MCP-legible docs

Put a JSDoc block above the component and on each prop; no addon-specific tags.
Where two components are confusable, end the description with a redirect the MCP
passes through verbatim:

```ts
/**
 * A committed-selection box: tick one or more items and submit them together,
 * rather than applying each change the moment it flips.
 * For a setting that applies the moment it flips, use
 * [Toggle](?path=/docs/forms-toggle--docs) instead.
 */
```

The `[Toggle](?path=…)` link is validated by `docs-link-dangling` and is made
clickable in the panel.

### Exempting a component

`@oversightIgnore` keeps a component in the manifest (agents still see its docs)
but exempts it from lint rules (bare for all rules, or scoped):

```ts
/**
 * An internal token catalog; coverage rules don't apply.
 *
 * @oversightIgnore docgen-missing, story-extraction-error
 */
```

This is deliberately different from Storybook's `!manifest` tag, which removes
the component from the manifest, and therefore from agents, entirely. Use
`!manifest` to hide, `@oversightIgnore` to exempt.

Unrecognized rule names in the list are themselves flagged
(`unknown-ignore-rule`) rather than silently exempting nothing. For an entry
whose docgen extraction failed (no component JSDoc reaches the manifest), put
`@oversightIgnore` on the JSDoc above the stories file's `meta`, the one case
where story-meta JSDoc is sanctioned.

## Configuration

Addon options don't reach the manager bundle, so configuration goes through
`.storybook/manager.ts`:

```ts
import { addons } from 'storybook/manager-api';

addons.setConfig({
  'storybook-addon-oversight': {
    expectedExtractor: 'react-docgen-typescript',
    debuggerLink: false, // hide the manifest-debugger link
    rules: {
      'deprecated-tag': 'off', // disable a rule
      'prop-descriptions-missing': 'error', // or remap its severity
    },
  },
});
```

Valid `rules` values are `"off"`, `"error"`, `"warning"`, `"info"`; anything
else is ignored and the rule keeps its default severity.

`debuggerLink` toggles the **"manifest debugger" footer link** (defaults to
`true`): a deep link to Storybook's own `components.html`, which _renders_ the
raw manifest for inspection. Oversight doesn't replace that page; it lints what
the page only displays, and links out to it for the raw view. The `rules`,
`expectedExtractor`, and `debuggerLink` options are read from a different channel
on each surface:

- **Panel**: the global `addons.setConfig` value above.
- **Docs block**: `parameters.oversight` on the **component's own stories
  meta**, per component (the block reads the component meta's parameters
  directly, not merged `.storybook/preview.ts` parameters):

  ```ts
  // a component's stories/MDX meta: hides the link on that component's Docs block
  const meta = { title: 'Forms/Checkbox', parameters: { oversight: { debuggerLink: false } } };
  ```

## Try it

A live build is hosted at
**[rachelslurs.github.io/storybook-oversight](https://rachelslurs.github.io/storybook-oversight/)**:
open a component's story to see the Oversight panel, or its Docs page for the
inline block.

This repo also ships that demo Storybook so you can run it locally, with a handful of
components each engineered to trip one rule:

```bash
pnpm install
pnpm build      # bundle the addon to dist/ (Storybook loads the built output)
pnpm storybook  # open the demo at http://localhost:6006
# or `pnpm start` to rebuild the addon on change while Storybook runs
```

Open any component's story to see the Oversight panel, or its Docs page to see
the inline coverage block.

## Development

This package lives in the [Oversight monorepo](../../README.md). The diagnostic
logic is a separate `oversight-core` package (pure functions, zero Storybook
imports); the panel and Docs block are thin renderers over it, and `oversight-lint`
runs the same rules. Build and test from the repo root:

```bash
pnpm install
pnpm -r build
pnpm -r test
```

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the PR and release workflow.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release history.

## License

MIT
