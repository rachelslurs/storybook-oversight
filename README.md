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
| [**storybook-addon-oversight**](./packages/storybook-addon-oversight/README.md) | Lints the manifest live in Storybook: an addon panel on every story and an inline Docs block, while you work. |
| [**oversight-lint**](./packages/cli/README.md) | Lints the built manifest in CI. Fails the build when a change drops or breaks a component's docs. The command is `oversight`. |
| [**oversight-lint-action**](https://github.com/rachelslurs/oversight-lint-action) | Runs the CI linter as a GitHub Action, reporting findings as annotations. Lives in its own repo. |

<p>Blog post: <a href="https://rachel.fyi/posts/your-agent-is-reading-a-different-design-system"><em>Your Agent Is Reading a Different Design System</em></a></p>

## Where to look

The rules are shared, so they are documented in [`docs/`](./docs) rather than in either package. This applies whether you run the CLI or the addon:

| Looking for | Where |
| --- | --- |
| What a rule fires on, and its default severity | [Rules](./docs/rules.md) |
| Turning a rule off, or changing its severity | [Changing a severity](./docs/rules.md#changing-a-severity) |
| A fix for any finding, `docgen-missing` through `deprecated-tag` | [Troubleshooting](./docs/troubleshooting.md) |
| Writing component docs an agent can act on | [Authoring MCP-legible docs](./docs/authoring.md) |
| Keeping a component but exempting it from a rule | [`@oversightIgnore`](./docs/authoring.md#exempting-a-component) |
| Why these are lint rules and not a manifest viewer | [Why these are lint rules](./docs/why-lint-rules.md) |
| What the MCP actually serves an agent, field by field | [What the agent actually receives](./docs/agent-view.md) |

## Layout

```
docs/                          the rules, and how to satisfy them, shared by both packages
packages/
  core/                        oversight-core, the rules engine (pure, private, bundled into the addon and the CLI)
  storybook-addon-oversight/   the Storybook addon (panel + Docs block)
  cli/                         oversight-lint, the CI linter
.storybook/  stories/          the demo Storybook that dogfoods the addon
```

`oversight-core` holds every rule as pure functions with zero Storybook or React imports. The addon and the CLI each bundle it, so the two can never disagree about what a finding is. It is never published on its own.

## Development

```bash
pnpm install
pnpm exec playwright install chromium  # once, for the browser checks
pnpm -r build        # build every package (tsc typecheck + tsup bundle)
pnpm test            # unit projects, then the built Storybook, then the demo's stories
pnpm test:unit       # just the unit projects, no build, no browser
pnpm built-storybook-checks  # just the Docs block and panel, against the last build
pnpm lint
pnpm build-storybook # build the addon, then the demo Storybook
pnpm storybook       # run the demo at http://localhost:6006
```

The demo ships a handful of components each engineered to trip one rule. Open a component's story to see the addon panel, or its Docs page for the inline block. Run `oversight storybook-static/manifests/components.json` after `pnpm build-storybook` to see the CLI report the same findings.

Changes land through pull requests; see [CONTRIBUTING.md](./CONTRIBUTING.md).

Per-package release history: [`storybook-addon-oversight`](./packages/storybook-addon-oversight/CHANGELOG.md) and [`oversight-lint`](./packages/cli/CHANGELOG.md).

## License

MIT
