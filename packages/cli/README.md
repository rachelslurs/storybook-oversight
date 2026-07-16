# oversight-lint

Lint your Storybook MCP components manifest in CI.

Your coding agent reads your components from the manifest Storybook's MCP server
generates. When a description never reaches that manifest (extraction failed, the
wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component
with no docs. `oversight-lint` runs over the built manifest and fails the build
when that happens, so a regression stops at CI instead of reaching the agent.

It runs the same rules as
[`storybook-addon-oversight`](../storybook-addon-oversight/README.md), which
surfaces them live in Storybook while you work. This is the CI half of the same
check.

## Install

```bash
npm install --save-dev oversight-lint
# or: pnpm add -D oversight-lint
```

The command is `oversight`.

## Prerequisite: a built manifest

`oversight-lint` reads a static manifest; it does not run Storybook. Produce one
with `storybook build` and
[`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp)
enabled, which writes `storybook-static/manifests/components.json`.

Storybook's experimental `experimentalDocgenServer` flag emits a different,
ref-based manifest that is not supported yet; `oversight-lint` reports it as an
unsupported format (exit 2) rather than guessing.

## Usage

```bash
oversight [manifest] [options]
```

With no argument it reads `storybook-static/manifests/components.json`. In GitHub
Actions, that is two steps:

```yaml
- run: pnpm build-storybook # writes storybook-static/manifests/components.json
- run: npx oversight --max-warnings 0
```

Under Actions it also appends a findings table to the job summary.

## Output

```
Card
  warning  prop-descriptions-missing   Card has 2 undocumented props. (props: title, elevated)
  error    required-prop-undocumented  Card has required prop without documentation. (props: title)

✖ 5 problems (2 errors, 2 warnings, 1 info)
```

Findings are grouped by component. `--json` emits the same findings keyed by
component id, with a summary count, for programmatic use.

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Clean, or only warnings within `--max-warnings`.                        |
| `1`  | An error-severity rule fired, or warnings exceeded `--max-warnings`.    |
| `2`  | Could not run: manifest missing, unparseable, or an unsupported format. |

Exit `2` is kept distinct from `1` so a broken setup does not read as a passing
lint, and a passing lint does not read as a broken setup.

## Options

| Option                        | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `[manifest]`                  | Path to `components.json` (default: the static build output).        |
| `--expected-extractor <name>` | Extractor the manifest should have used (`react-docgen-typescript`). |
| `--rule <name>=<severity>`    | Override a rule: `off`, `error`, `warning`, `info`. Repeatable.      |
| `--max-warnings <n>`          | Fail if warnings exceed `n` (default: no limit).                     |
| `--config <path>`             | Config file (default: `./oversight.config.json`).                    |
| `--json`                      | Emit JSON keyed by component id.                                     |
| `--quiet`                     | Print only errors (does not change the exit code).                   |
| `-h`, `--help`                | Show help.                                                           |
| `--version`                   | Print the version.                                                   |

The rules, their default severities, and what each one fires on are documented in
the addon's [Diagnostics table](../storybook-addon-oversight/README.md#diagnostics).
`@oversightIgnore` on a component's JSDoc exempts it here too.

## Configuration file

Flags override an optional `oversight.config.json` in the working directory (or a
path passed with `--config`):

```json
{
  "manifest": "storybook-static/manifests/components.json",
  "expectedExtractor": "react-docgen-typescript",
  "maxWarnings": 0,
  "rules": {
    "deprecated-tag": "off",
    "prop-descriptions-missing": "error"
  }
}
```

The panel reads its `rules` and `expectedExtractor` from `.storybook/manager.ts`,
which the CLI cannot execute, so the CLI takes its configuration from flags or this
file.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release history.

## License

MIT
