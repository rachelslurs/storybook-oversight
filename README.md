<p align="center">
  <img src="https://raw.githubusercontent.com/rachelslurs/storybook-addon-oversight/main/assets/oversight-icon-128.png" alt="Oversight" width="96" height="96" />
</p>

<h1 align="center">Oversight</h1>

<p align="center">
  See what your agent can and can't see.<br />
  Diagnoses silent failures in your Storybook MCP manifest.
</p>

<p align="center">
  <a href="https://rachelslurs.github.io/storybook-addon-oversight/"><strong>▶ Live demo</strong></a>
</p>

Your coding agent reads your components from the manifest Storybook's MCP server
generates. When a description never reaches that manifest (extraction failed, the
wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component
with no docs, and nothing tells you. Oversight lints that manifest per component
so the gap surfaces, either while you work or in CI.

The rules live once, in a shared core, and run from two front ends:

| Package                                                               | Use it for                                                                                                                    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [**storybook-addon-oversight**](./packages/storybook-addon-oversight) | Lints the manifest live in Storybook: an addon panel on every story and an inline Docs-page block, while you work.            |
| [**oversight-lint**](./packages/cli)                                  | Lints the built manifest in CI. Fails the build when a change drops or breaks a component's docs. The command is `oversight`. |

<p>Blog post: <a href="https://rachel.fyi/posts/your-agent-is-reading-a-different-design-system"><em>Your Agent Is Reading a Different Design System</em></a></p>

## Layout

```
packages/
  core/                        oversight-core, the diagnostic engine (pure, private, bundled into both front ends)
  storybook-addon-oversight/   the Storybook addon (panel + Docs block)
  cli/                         oversight-lint, the CI linter
.storybook/  stories/          the demo Storybook that dogfoods the addon
```

`oversight-core` holds every rule as pure functions with zero Storybook or React
imports. The addon and the CLI each bundle it, so the two surfaces can never
disagree about what a finding is. It is never published on its own.

## Development

```bash
pnpm install
pnpm -r build        # build every package (tsc typecheck + tsup bundle)
pnpm -r test         # unit tests across core, addon, and cli
pnpm lint
pnpm build-storybook # build the addon, then the demo Storybook
pnpm storybook       # run the demo at http://localhost:6006
```

The demo ships a handful of components each engineered to trip one rule. Open a
component's story to see the addon panel, or its Docs page for the inline block.
Run `oversight storybook-static/manifests/components.json` after
`pnpm build-storybook` to see the CLI report the same findings.

Changes land through pull requests; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
