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

Your coding agent reads your components from the manifest Storybook's MCP server generates. When a description never reaches that manifest (extraction failed, the wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component with no docs, and nothing tells you. Oversight lints the manifest per component while you work, so the gap surfaces on the component in front of you.

![The Oversight panel cycling through Card, Tile, and Badge, flagging findings per component](https://raw.githubusercontent.com/rachelslurs/storybook-oversight/main/stories/assets/oversight-panel.gif)

<p>Blog post: <a href="https://rachel.fyi/posts/your-agent-is-reading-a-different-design-system"><em>Your Agent Is Reading a Different Design System</em></a></p>

## Requirements

- **Storybook ^10.3** (React projects).
- **React 18 or 19** in the consumer project. The addon's manager UI renders through Storybook's own React, so your app's React version is independent (needs `0.1.1+`; earlier versions crash the manager on React 19 projects).
- The **components-manifest** feature enabled and served in dev. [`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp) turns it on and serves `/manifests/components.json`, the manifest Oversight lints. Without it, the panel degrades to an "unavailable" state.
- Storybook's experimental `experimentalDocgenServer` flag **disables the dev manifest by design**. From `0.5.0` the panel and the Docs block read Storybook's in-runtime service API in dev under that flag (needs Storybook `10.5+`), and resolve the ref-based (`v: 1`) manifest a build writes; earlier addon versions report the dev manifest unavailable and the built one unparseable. `oversight-lint` reads the built form as well.

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

Set the extractor so JSDoc on components and props is actually extracted:

```ts
// .storybook/main.ts
const config = {
  typescript: { reactDocgen: 'react-docgen-typescript' },
};
```

Set the same value as `expectedExtractor` (see [Configuration](#configuration)) so `extractor-drift` can flag a manifest built with a different extractor. The rule runs only when an expectation is configured.

If you enable `features.experimentalReactComponentMeta`, set `expectedExtractor` to `react-component-meta` instead. That flag chooses the extractor itself, so the manifest records `react-component-meta` and `typescript.reactDocgen` above is never read.

`features.experimentalDocgenServer` records the same extractor, so `react-component-meta` is also the value to state under that flag: `expectedExtractor` for the panel and the Docs block, `--expected-extractor` on [`oversight-lint`](../cli/README.md) for the built manifest.

### Optional: enable the Docs block

Register the global container in `.storybook/preview.ts` to render Oversight at the bottom of every component Docs page:

```ts
import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';

const preview = {
  parameters: { docs: { container: OversightDocsContainer } },
};
export default preview;
```

Unattached MDX pages, such as an overview with no `of`, keep the plain Docs container without an Oversight block. Remove the container from `preview.ts` to disable the block globally.

To enable it on individual component MDX pages instead, place the block on each page:

```mdx
import { Oversight } from 'storybook-addon-oversight/blocks';

<Oversight />
```

## What Oversight checks

The manifest Oversight lints is the _upstream_ artifact: Storybook's MCP `get-documentation` reads from it, reformats it, and drops what it won't serve (component-level JSDoc tags among them). So Oversight checks two things: that the doc content the MCP will serve is present and good (component/prop descriptions), and that the pipeline building the manifest is healthy enough to deliver it (extraction succeeded and, when you configure `expectedExtractor`, the expected docgen extractor ran). It adds no documentation vocabulary of its own: selection guidance ("use X instead") lives as a plain redirect sentence in the component description, typical Storybook practice and passed through verbatim by `get-documentation`. Its one tag, `@oversightIgnore`, is a lint-suppression directive.

## Surfaces

The same findings appear in two places, independently:

- **Addons panel**: an "Oversight" tab on every component's **story** view (Storybook hides addon panels on Docs pages). Registering the addon in `.storybook/main.ts` enables it.
- **Docs block**: the same coverage rendered inline on Docs pages. It is an optional step in the [installation](#optional-enable-the-docs-block).

## In CI

The same rules run headlessly over a built manifest with **`oversight-lint`**, so a change that drops a component's docs fails the build instead of surfacing only in the panel. After `storybook build`, point it at the emitted manifest:

```bash
npx oversight storybook-static/manifests/components.json
```

See [`oversight-lint`](../cli/README.md) for options, config, and exit codes.

## Findings

The panel and the CLI run the same rules from `oversight-core`, so they are documented outside both packages:

- [Rules](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/rules.md), what each one fires on and its default severity
- [Troubleshooting](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/troubleshooting.md), a fix for every finding
- [Authoring MCP-legible docs](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/authoring.md), how to write the docs that keep most of them from firing, and [exempting a component](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/authoring.md#exempting-a-component) with `@oversightIgnore`
- [Why these are lint rules](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/why-lint-rules.md), the four that need judgment a raw view can't give you

In the panel, `extractor-drift` shows in its own **Manifest** section, since it's a property of the whole manifest rather than any one component.

## Configuration

Addon options don't reach the manager bundle, so configuration goes through `.storybook/manager.ts`:

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

Valid `rules` values are `"off"`, `"error"`, `"warning"`, `"info"`; anything else is ignored and the rule keeps its default severity.

`debuggerLink` toggles the **"manifest debugger" footer link** (defaults to `true`): a deep link to Storybook's own `components.html`, which _renders_ the raw manifest for inspection. Oversight doesn't replace that page; it lints what the page only displays, and links out to it for the raw view. The `rules`, `expectedExtractor`, and `debuggerLink` options are read from a different channel on each surface:

- **Panel**: the global `addons.setConfig` value above.
- **Docs block**: `parameters.oversight` on the **component's own stories meta**, per component (the block reads the component meta's parameters directly, not merged `.storybook/preview.ts` parameters):

  ```ts
  // a component's stories/MDX meta: hides the link on that component's Docs block
  const meta = { title: 'Forms/Checkbox', parameters: { oversight: { debuggerLink: false } } };
  ```

## Try it

A live build is hosted at **[rachelslurs.github.io/storybook-oversight](https://rachelslurs.github.io/storybook-oversight/)**: open a component's story to see the Oversight panel, or its Docs page for the inline block.

This repo also ships that demo Storybook so you can run it locally, with a handful of components each engineered to trip one rule:

```bash
pnpm install
pnpm build      # bundle the addon to dist/ (Storybook loads the built output)
pnpm storybook  # open the demo at http://localhost:6006
# or `pnpm start` to rebuild the addon on change while Storybook runs
```

## Development

This package lives in the [Oversight monorepo](../../README.md). Build and test from the repo root:

```bash
pnpm install
pnpm exec playwright install chromium  # once, for the story tests
pnpm -r build
pnpm test        # or pnpm test:unit to skip the browser
```

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the PR and release workflow.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release history.

## License

MIT
