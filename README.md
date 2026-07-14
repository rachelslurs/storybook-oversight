<p align="center">
  <img src="https://raw.githubusercontent.com/rachelslurs/storybook-addon-oversight/main/assets/oversight-icon-128.png" alt="Oversight" width="96" height="96" />
</p>

<h1 align="center">storybook-addon-oversight</h1>

<p align="center">
  See what your agent can and can't see.<br />
  Diagnoses silent failures in your Storybook MCP manifest.
</p>

<p align="center">
  <a href="https://rachelslurs.github.io/storybook-addon-oversight/"><strong>▶ Live demo</strong></a>
</p>

A Storybook addon that lints your components manifest for the **documentation
the MCP actually consumes**, per component, while you work. It surfaces docgen
extraction health and component/prop/story documentation coverage, with a count
badge on the panel tab.

Scope is deliberate. The manifest Oversight lints is the _upstream_ artifact:
Storybook's MCP `get-documentation` reads from it, reformats it, and drops what
it won't serve (JSDoc tags among them). So Oversight checks two things: that the
doc content the MCP will serve is present and good (component/prop descriptions),
and that the pipeline building the manifest is healthy enough to deliver it
(extraction succeeded, the expected docgen extractor ran). It adds no
documentation vocabulary of its own: selection guidance ("use X instead") lives
as a plain redirect sentence in the component description, typical Storybook
practice and passed through verbatim by `get-documentation`. Its one tag,
`@oversightIgnore`, is a lint-suppression directive, not documentation.

## Requirements

- **Storybook ^10.3** (React projects).
- The **components-manifest** feature enabled and served in dev.
  [`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp)
  turns it on and serves `/manifests/components.json`, the manifest Oversight
  lints. Without it, the panel degrades to an "unavailable" state.

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

## Surfaces

The same diagnostics appear in two places, independently:

- **Manager panel**: an "Oversight" tab in the addons drawer, shown on every
  component's **story** view (Storybook hides addon panels on Docs pages).
  Registering the addon in `.storybook/main.ts` enables it.
- **Docs-page block**: the coverage rendered inline on Docs pages. Two ways to
  enable it, both from `storybook-addon-oversight/blocks`:

  **Global (every Docs page), one line in `.storybook/preview.ts`:**

  ```ts
  import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';

  const preview = {
    parameters: { docs: { container: OversightDocsContainer } },
  };
  export default preview;
  ```

  Delete that line to remove it from every page. Unattached MDX pages (an
  overview with no `of`) get the plain container, without a block.

  **Per page**, place the block in an individual component's MDX instead:

  ```mdx
  import { Oversight } from 'storybook-addon-oversight/blocks';

  <Oversight />
  ```

Either way, the Docs block needs the components-manifest feature enabled, the same
prerequisite as the panel.

## Diagnostics

| Rule                            | Default severity | Fires when                                                                                     |
| ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| `docgen-missing`                | error            | an entry has no docgen payload (extraction failed)                                             |
| `story-extraction-error`        | warning          | a story's snippet/docgen extraction failed (`stories[].error`)                                 |
| `extractor-drift`               | warning          | `meta.docgen` ≠ the expected extractor                                                         |
| `component-description-missing` | warning          | no component description                                                                       |
| `prop-descriptions-missing`     | warning          | props without JSDoc descriptions                                                               |
| `required-prop-undocumented`    | error            | required props without JSDoc descriptions                                                      |
| `docs-link-dangling`            | error            | a prose `?path=/docs\|story/…` link targets an id whose component prefix isn't in the manifest |
| `unknown-ignore-rule`           | warning          | `@oversightIgnore` lists a token that is not a rule name                                       |
| `deprecated-tag`                | info             | a `@deprecated` tag is present                                                                 |

## Authoring MCP-legible docs

Everything Oversight lints is standard Storybook practice: no addon-specific
tags. Put a JSDoc block above the component (and on each prop), and where two
components are confusable, end the description with a redirect the MCP passes
through verbatim:

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
**[rachelslurs.github.io/storybook-addon-oversight](https://rachelslurs.github.io/storybook-addon-oversight/)**:
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

```bash
pnpm build   # tsc typecheck + tsup bundle → dist/
pnpm test    # core unit tests (vitest)
pnpm lint
```

Diagnostic logic lives as pure functions in `src/core/` with zero Storybook
imports (plain data in, plain data out); the panel and Docs block are thin
renderers over it.

Changes land through pull requests labelled for SemVer; see
[CONTRIBUTING.md](./CONTRIBUTING.md) for the PR and release workflow.

## License

MIT
