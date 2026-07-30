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

`oversight-lint` reads a static manifest; it does not run Storybook. On
**Storybook ^10.3**, `storybook build` writes
`storybook-static/manifests/components.json` when the
`features.componentsManifest` flag is enabled in `.storybook/main.ts`.
Installing
[`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp)
enables the flag for you.

Older Storybooks are unsupported. On 10.1 and 10.2 the manifest is built only
behind `features.experimentalComponentsManifest`, and those flag-built manifests
happen to lint; that spelling was renamed at 10.3.0 with no alias. Below 10.1
there is no components manifest to lint.

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
- run: npx oversight --format github --max-warnings 0 --expected-extractor react-docgen-typescript
```

`--expected-extractor` states the extractor your `.storybook/main.ts` pins;
`extractor-drift` runs only when an expectation is configured, via the flag or
the config file.

`--format github` emits `::error`/`::warning`/`::notice` annotations; GitHub shows
them on the run and the pull request's Checks tab, not beside your changed code
(findings have no line numbers, so each anchors to the top of the stories file).
Under Actions it also appends a findings table to the job summary, and GitHub
caps the annotations at ~10 per type per step.

## Output

```
storybook-static/manifests/components.json (docgen: react-docgen-typescript)

Card
  warning  prop-descriptions-missing   Card has 2 undocumented props. (props: title, elevated)
  error    required-prop-undocumented  Card has required prop without documentation. (props: title)

✖ 2 problems (1 error, 1 warning, 0 info), 1 of 42 entries affected
```

The header names the manifest that was linted and its recorded extractor:
`meta.docgen` when the manifest sets it, else the payload key every extracted
entry shares. It matters because the same path can hold a different artifact
per build: a config like `reactDocgen: isCI ? 'react-docgen-typescript' :
'react-docgen'` writes one manifest in CI and another locally.

Counts are per manifest entry. One entry exists per stories file, so a component
with several stories files produces several entries, and every count is inflated
relative to components. The CLI does not deduplicate by component name: names
collide across packages, and the manifest offers no stronger component identity
than the entry id.

Findings are grouped by component. `--format json` (alias `--json`) emits the
same findings keyed by component id, with the summary counts and the manifest's
`path`, `docgen`, and `entries` count under `summary.manifest`, for programmatic
use. `docgen-missing` and `story-extraction-error` findings carry the full
extraction error on an `error` field and, when the manifest error carries one,
its `name` on `errorName`; their messages lead with the name and append the
message's diagnosis line when it adds information. In the audited manifests,
react-docgen-typescript failures open the message with a `File: <path>` line
and react-docgen adds a bare `Error:` label; the summary skips those lines
and leads with the line after them, while the full text stays on the JSON
`error` field.

### Mass failures collapse in text output

A repo-wide extraction failure fires `docgen-missing` once per entry and
`story-extraction-error` once per failing story, several per entry, so text
output would render hundreds of near-identical findings. When one rule's
findings touch at least 10 distinct entries and at least half the manifest's
entries, they leave the per-component groups and render as one line per error
signature (the same one-line summary the messages use), stating the count,
the share, and the diagnosis:

```
  error  docgen-missing  122 of 123 entries: No component found: We could not detect the component from your story file. Specify meta.component.
```

Because the summary skips the message's `File: <path>` location line, entries
that share a diagnosis share a row instead of fragmenting on their per-entry
paths. Signatures on fewer than 10 entries pool into one leftovers line ("8
other errors"). The Actions step summary collapses the same way, since GitHub
truncates oversized step summaries. The tally still counts every finding, and
`--format json` keeps the per-entry list.

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Clean, or only warnings within `--max-warnings`.                        |
| `1`  | An error-severity rule fired, or warnings exceeded `--max-warnings`.    |
| `2`  | Could not run: manifest missing, unparseable, or an unsupported format. |

Exit `2` is distinct from `1` so a broken setup does not read as a passing lint.

## Options

| Option                          | Description                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[manifest]`                    | Path to `components.json` (default: the static build output).                                         |
| `--expected-extractor <name>`   | Extractor the manifest should have used. Enables `extractor-drift`; also settable in the config file. |
| `--rule <name>=<severity>`      | Override a rule: `off`, `error`, `warning`, `info`. Repeatable.                                       |
| `--max-warnings <n>`            | Fail if warnings exceed `n` (default: no limit).                                                      |
| `--config <path>`               | Config file (default: `./oversight.config.json`).                                                     |
| `--format <text\|json\|github>` | Output format: `text` (default), `json`, or `github` (Actions annotations).                           |
| `--json`                        | Alias for `--format json`.                                                                            |
| `--quiet`                       | Print only errors (does not change the exit code).                                                    |
| `-h`, `--help`                  | Show help.                                                                                            |
| `--version`                     | Print the version.                                                                                    |

`@oversightIgnore` on a component's JSDoc exempts it here too; write the directive
where the addon documents it, under
[Exempting a component](../storybook-addon-oversight/README.md#exempting-a-component).

## Diagnostics

`oversight-lint` and
[`storybook-addon-oversight`](../storybook-addon-oversight/README.md) run the same
rules from `oversight-core`, at these default severities:

| Rule                            | Default severity | Fires when                                                                                         |
| ------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| `docgen-missing`                | error            | an entry has no docgen payload (extraction failed)                                                 |
| `story-extraction-error`        | warning          | a story's snippet/docgen extraction failed (`stories[].error`)                                     |
| `extractor-drift`               | warning          | `meta.docgen` ≠ the expected extractor, or unrecorded; runs only when an expectation is configured |
| `component-description-missing` | warning          | no component description                                                                           |
| `prop-descriptions-missing`     | warning          | props without JSDoc descriptions                                                                   |
| `required-prop-undocumented`    | error            | required props without JSDoc descriptions                                                          |
| `docs-link-dangling`            | error            | a prose `?path=/docs\|story/…` link targets an id whose component prefix isn't in the manifest     |
| `unknown-ignore-rule`           | warning          | `@oversightIgnore` lists a token that is not a rule name                                           |
| `deprecated-tag`                | info             | a `@deprecated` tag is present                                                                     |

## Why these are lint rules

The raw manifest is already viewable: `@storybook/addon-mcp` serves a debugger at
`components.html`. Three of the rules need judgment that reading it can't give
you:

- **`extractor-drift` is a comparison.** The manifest looks fine on its own; it's
  only wrong _relative to_ the extractor you expected, so a raw view has nothing
  to flag against. Oversight holds the expectation (`expectedExtractor`) and
  checks the manifest against it. Without a configured expectation the rule does
  not run. A manifest records its extractor in `meta.docgen` or in the payload
  key its entries share; when neither says anything, the check fails rather than
  passing as a match. It's a property of the whole manifest, so it's reported on
  its own rather than against any one component.
- **`docs-link-dangling` needs every other entry.** One component's entry can't
  tell you its `?path=` redirect points at nothing; that takes cross-referencing
  every id in the manifest. A per-component view can't see it; Oversight can. The
  rule validates one convention: selection guidance written into component
  descriptions as `?path=/docs|story/…` redirect links. In a repo that does not
  write those links it has nothing to check, and it stays silent. In such a
  repo the rule's silence reports the convention's absence and says nothing
  about link validity.
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
