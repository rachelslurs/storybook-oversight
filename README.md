<p align="center">
  <img src="https://raw.githubusercontent.com/rachelslurs/storybook-oversight/main/assets/oversight-icon-128.png" alt="Oversight" width="96" height="96" />
</p>

<h1 align="center">Oversight</h1>

<p align="center">
  See what your agent can and can't see.<br />
  Diagnoses silent failures in your Storybook MCP manifest.
</p>

<p align="center">
  <a href="https://rachelslurs.github.io/storybook-oversight/"><strong>▶ Live demo</strong></a>
</p>

Your coding agent reads your components from the manifest Storybook's MCP server generates. When a description never reaches that manifest (extraction failed, the wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component with no docs, and nothing tells you. Oversight lints that manifest per component so the gap surfaces, either while you work or in CI.

![The Oversight panel cycling through Card, Tile, and Badge, flagging findings per component](https://raw.githubusercontent.com/rachelslurs/storybook-oversight/main/stories/assets/oversight-panel.gif)

The rules live once, in a shared core, and run two ways: one interactive in Storybook, one headless in CI. Each README below has the full install, usage, and options:

| Package | Use it for |
| --- | --- |
| [**storybook-addon-oversight**](./packages/storybook-addon-oversight/README.md) | Lints the manifest live in Storybook: an addon panel on every story and an inline Docs-page block, while you work. |
| [**oversight-lint**](./packages/cli/README.md) | Lints the built manifest in CI. Fails the build when a change drops or breaks a component's docs. The command is `oversight`. |
| [**oversight-lint-action**](https://github.com/rachelslurs/oversight-lint-action) | Runs the CI linter as a GitHub Action, reporting findings as annotations. Lives in its own repo. |

<p>Blog post: <a href="https://rachel.fyi/posts/your-agent-is-reading-a-different-design-system"><em>Your Agent Is Reading a Different Design System</em></a></p>

## Why these are lint rules

The raw manifest is already viewable: `@storybook/addon-mcp` serves a debugger at `components.html`. Three of the rules need judgment that reading it can't give you:

- **`extractor-drift` is a comparison.** The manifest looks fine on its own; it's only wrong _relative to_ the extractor you expected, so a raw view has nothing to flag against. Oversight holds the expectation (`expectedExtractor`) and checks the manifest against it. Without a configured expectation the rule does not run. A manifest records its extractor in `meta.docgen` or in the payload key its entries share; when neither says anything, the check fails rather than passing as a match. It's a property of the whole manifest, so it's reported on its own rather than against any one component.
- **`docs-link-dangling` needs every other entry.** One component's entry can't tell you its `?path=` redirect points at nothing; that takes cross-referencing every id in the manifest. A per-component view can't see it; Oversight can. The rule validates one convention: selection guidance written into component descriptions as `?path=/docs|story/…` redirect links. In a repo that does not write those links it has nothing to check, and it stays silent. In such a repo the rule's silence reports the convention's absence and says nothing about link validity.
- **`required-prop-undocumented` vs `prop-descriptions-missing` is a severity call.** Every blank prop description renders the same in a raw view. Oversight decides that an undocumented _required_ prop is the one an agent is most likely to guess at, so it's an `error`, while a missing optional description is a `warning`.

## Layout

```
packages/
  core/                        oversight-core, the diagnostic engine (pure, private, bundled into the addon and the CLI)
  storybook-addon-oversight/   the Storybook addon (panel + Docs block)
  cli/                         oversight-lint, the CI linter
.storybook/  stories/          the demo Storybook that dogfoods the addon
```

`oversight-core` holds every rule as pure functions with zero Storybook or React imports. The addon and the CLI each bundle it, so the two can never disagree about what a finding is. It is never published on its own.

## Development

```bash
pnpm install
pnpm -r build        # build every package (tsc typecheck + tsup bundle)
pnpm -r test         # unit tests across core, addon, and cli
pnpm lint
pnpm build-storybook # build the addon, then the demo Storybook
pnpm storybook       # run the demo at http://localhost:6006
```

The demo ships a handful of components each engineered to trip one rule. Open a component's story to see the addon panel, or its Docs page for the inline block. Run `oversight storybook-static/manifests/components.json` after `pnpm build-storybook` to see the CLI report the same findings.

Changes land through pull requests; see [CONTRIBUTING.md](./CONTRIBUTING.md).

Per-package release history: [`storybook-addon-oversight`](./packages/storybook-addon-oversight/CHANGELOG.md) and [`oversight-lint`](./packages/cli/CHANGELOG.md).

## License

MIT
