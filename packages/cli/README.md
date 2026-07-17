# oversight-lint

Lint your Storybook MCP components manifest in CI.

Your coding agent reads your components from the manifest Storybook's MCP server
generates. When a description never reaches that manifest (extraction failed, the
wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component
with no docs. `oversight-lint` runs over the built manifest and fails the build
when that happens, so a regression stops at CI instead of reaching the agent.

It runs the same rules as
[`storybook-addon-oversight`](../storybook-addon-oversight/README.md), which
surfaces them live in Storybook while you work.

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
- run: npx oversight --format github --max-warnings 0
```

`--format github` emits `::error`/`::warning`/`::notice` annotations; GitHub shows
them on the run and the pull request's Checks tab, not beside your changed code
(findings have no line numbers, so each anchors to the top of the stories file).
Under Actions it also appends a findings table to the job summary, and GitHub
caps the annotations at ~10 per type per step.

## Output

```
Card
  warning  prop-descriptions-missing   Card has 2 undocumented props. (props: title, elevated)
  error    required-prop-undocumented  Card has required prop without documentation. (props: title)

✖ 2 problems (1 error, 1 warning, 0 info)
```

Findings are grouped by component. `--format json` (alias `--json`) emits the same
findings keyed by component id, with a summary count, for programmatic use.

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Clean, or only warnings within `--max-warnings`.                        |
| `1`  | An error-severity rule fired, or warnings exceeded `--max-warnings`.    |
| `2`  | Could not run: manifest missing, unparseable, or an unsupported format. |

Exit `2` is kept distinct from `1` so a broken setup does not read as a passing
lint, and a passing lint does not read as a broken setup.

## Options

| Option                          | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `[manifest]`                    | Path to `components.json` (default: the static build output).               |
| `--expected-extractor <name>`   | Extractor the manifest should have used (`react-docgen-typescript`).        |
| `--rule <name>=<severity>`      | Override a rule: `off`, `error`, `warning`, `info`. Repeatable.             |
| `--max-warnings <n>`            | Fail if warnings exceed `n` (default: no limit).                            |
| `--config <path>`               | Config file (default: `./oversight.config.json`).                           |
| `--format <text\|json\|github>` | Output format: `text` (default), `json`, or `github` (Actions annotations). |
| `--json`                        | Alias for `--format json`.                                                  |
| `--quiet`                       | Print only errors (does not change the exit code).                          |
| `-h`, `--help`                  | Show help.                                                                  |
| `--version`                     | Print the version.                                                          |

`@oversightIgnore` on a component's JSDoc exempts it here too; write the directive
where the addon documents it, under
[Exempting a component](../storybook-addon-oversight/README.md#exempting-a-component).

## Diagnostics

`oversight-lint` and
[`storybook-addon-oversight`](../storybook-addon-oversight/README.md) run the same
rules from `oversight-core`, at these default severities:

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

## Why these are lint rules

The raw manifest is already viewable: `@storybook/addon-mcp` serves a debugger at
`components.html`. Three of the rules need judgment that reading it can't give
you:

- **`extractor-drift` is a comparison.** The manifest looks fine on its own; it's
  only wrong _relative to_ the extractor you expected, so a raw view has nothing
  to flag against. Oversight holds the expectation (`expectedExtractor`) and
  checks the manifest against it. It's a property of the whole manifest, so it's
  reported on its own rather than against any one component.
- **`docs-link-dangling` needs every other entry.** One component's entry can't
  tell you its `?path=` redirect points at nothing; that takes cross-referencing
  every id in the manifest. A per-component view can't see it; Oversight can.
- **`required-prop-undocumented` vs `prop-descriptions-missing` is a severity
  call.** Every blank prop description renders the same in a raw view. Oversight
  decides that an undocumented _required_ prop is the one an agent is most likely
  to guess at, so it's an `error`, while a missing optional description is a
  `warning`.

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
