# oversight-lint

Lint your Storybook MCP components manifest in CI.

Your coding agent reads your components from the manifest Storybook's MCP server generates. When a description never reaches that manifest (extraction failed, the wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component with no docs. `oversight-lint` runs over the built manifest and fails the build when that happens, so a regression stops at CI instead of reaching the agent.

It runs the same rules as [`storybook-addon-oversight`](../storybook-addon-oversight/README.md), which surfaces them live in Storybook while you work.

[Install](#install) · [Prerequisite](#prerequisite-a-built-manifest) · [Usage](#usage) · [Output](#output) · [Exit codes](#exit-codes) · [Options](#options) · [Findings](#findings) · [Configuration file](#configuration-file)

## Install

```bash
npm install --save-dev oversight-lint
# or: pnpm add -D oversight-lint
```

The command is `oversight`.

## Prerequisite: a built manifest

`oversight-lint` reads a static manifest; it does not run Storybook. On **Storybook ^10.3**, `storybook build` writes `storybook-static/manifests/components.json` when the `features.componentsManifest` flag is enabled in `.storybook/main.ts`. Installing [`@storybook/addon-mcp`](https://www.npmjs.com/package/@storybook/addon-mcp) enables the flag for you.

Older Storybooks are unsupported. On 10.1 and 10.2 the manifest is built only behind `features.experimentalComponentsManifest`, and those flag-built manifests happen to lint; that spelling was renamed at 10.3.0 with no alias. Below 10.1 there is no components manifest to lint.

Storybook's experimental `experimentalDocgenServer` flag emits a ref-based manifest (`v: 1`) whose entries defer their payloads to per-component files under `services/core/`. `oversight-lint` reads it, resolving those refs relative to the manifest. Findings come out the same as for an inline manifest.

Two things to know about that flag. It writes a manifest only when `features.componentsManifest` is also on, which `@storybook/addon-mcp` supplies; with the flag alone, no manifest is written at all. And the manifest is written on `storybook build`, never served in dev.

Storybook documents the `services/core/` layout as an internal construct that may change in patch versions. A ref that stops resolving is reported as `docgen-missing` for that component, and a manifest version this build does not know is refused by version number (exit 2) rather than guessed at.

## Usage

```bash
oversight [manifest] [options]
```

With no argument it reads `storybook-static/manifests/components.json`. In GitHub Actions, that is two steps:

```yaml
- run: pnpm build-storybook # writes storybook-static/manifests/components.json
- run: npx oversight --format github --max-warnings 0 --expected-extractor react-docgen-typescript
```

[`oversight-lint-action`](https://github.com/rachelslurs/oversight-lint-action) runs the same linter as a GitHub Action, surfacing findings as annotations on the pull request. It lives in its own repo, and it lints an already-built manifest too, so `build-storybook` still comes first.

`--expected-extractor` states the extractor your `.storybook/main.ts` sets; `extractor-drift` runs only when an expectation is configured, via the flag or the config file. With `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` enabled the value to state is `react-component-meta`: either flag picks the extractor itself, so the manifest records `react-component-meta` and `typescript.reactDocgen` is never read.

`--format github` emits `::error`/`::warning`/`::notice` annotations; GitHub shows them on the run and the pull request's Checks tab, not beside your changed code (findings have no line numbers, so each anchors to the top of the stories file). Under Actions it also appends a findings table to the job summary, and GitHub caps the annotations at ~10 per type per step.

## Output

```
storybook-static/manifests/components.json (docgen: react-docgen-typescript)

Card
  warning  prop-descriptions-missing   Card has 2 undocumented props. (props: title, elevated)
  error    required-prop-undocumented  Card has required prop without documentation. (props: title)

✖ 2 findings (1 error, 1 warning, 0 info), 1 of 42 entries affected
```

The header names the manifest that was linted and its recorded extractor: `meta.docgen` when the manifest sets it, else the payload key every extracted entry shares (`reactDocgenTypescript`, `reactDocgen` or `reactComponentMeta`). It matters because the same path can hold a different artifact per build: a config like `reactDocgen: isCI ? 'react-docgen-typescript' : 'react-docgen'` writes one manifest in CI and another locally, and toggling `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` changes it without touching `reactDocgen` at all.

Counts are per manifest entry. One entry exists per stories file, so a component with several stories files produces several entries, and every count is inflated relative to components. The CLI does not deduplicate by component name: names collide across packages, and the manifest offers no stronger component identity than the entry id.

Findings are grouped by entry, headed with the entry's component name. When another entry in the manifest shares that name, the heading adds the stories file, because the name alone cannot say which file a finding came from: `Features (src/Dialog/Dialog.features.stories.tsx)`. An entry is labeled with its entry id instead when it records no stories file, or when a same-named entry records the same one; that choice is made per entry, so one entry never changes how its siblings read. Entries named `Manifest` are always labeled, since manifest-level findings own that heading. The Actions step summary labels its Component column the same way.

`--format json` (alias `--json`) emits the same findings keyed by component id, with the summary counts and the manifest's `path`, `docgen`, and `entries` count under `summary.manifest`, for programmatic use. `docgen-missing` and `story-extraction-error` findings carry the full extraction error on an `error` field and, when the manifest error carries one, its `name` on `errorName`; their messages lead with the name and append the message's diagnosis line when it adds information. In the audited manifests, react-docgen-typescript failures open the message with a `File: <path>` line and react-docgen adds a bare `Error:` label; the summary skips those lines and leads with the line after them, while the full text stays on the JSON `error` field.

### Mass failures collapse in text output

A repo-wide extraction failure makes `docgen-missing` fire once per entry and `story-extraction-error` once per failing story, several per entry, so text output would render hundreds of near-identical findings. When one rule's findings touch at least 10 distinct entries and at least half the manifest's entries, they leave the per-entry groups and render as one line per error signature (the same one-line summary the messages use), stating the count, the share, and the diagnosis:

```
  error  docgen-missing  122 of 123 entries: No component found: We could not detect the component from your story file. Specify meta.component.
```

Because the summary skips the message's `File: <path>` location line, entries that share a diagnosis share a row instead of fragmenting on their per-entry paths. Signatures on fewer than 10 entries pool into one leftovers line ("8 other errors"). The Actions step summary collapses the same way, so both surfaces stay the same size on the same input. The tally still counts every finding, and `--format json` keeps the per-entry list.

Documentation gaps do not collapse. `component-description-missing`, `prop-descriptions-missing`, and `required-prop-undocumented` each name a different component, and the prop rules name that component's own undocumented props, so a summary row would trade the list for a count the tally already reports. Extraction failures repeat one diagnosis across many entries, which is what makes one row worth reading in their place. Where a manifest has hundreds of documentation gaps, `--quiet` prints the errors alone and `--format json` keeps every finding.

## Exit codes

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Clean, or only warnings within `--max-warnings`.                        |
| `1`  | An error-severity rule fired, or warnings exceeded `--max-warnings`.    |
| `2`  | Could not run: manifest missing, unparseable, or an unsupported format. |

Exit `2` is distinct from `1` so a broken setup does not read as a passing lint.

## Options

| Option | Description |
| --- | --- |
| `[manifest]` | Path to `components.json` (default: the static build output). |
| `--expected-extractor <name>` | Extractor the manifest should have used. Enables `extractor-drift`; also settable in the config file. |
| `--rule <name>=<severity>` | Override a rule: `off`, `error`, `warning`, `info`. Repeatable. |
| `--max-warnings <n>` | Fail if warnings exceed `n` (default: no limit). |
| `--config <path>` | Config file (default: `./oversight.config.json`). |
| `--format <text\|json\|github>` | Output format: `text` (default), `json`, or `github` (Actions annotations). |
| `--json` | Alias for `--format json`. |
| `--quiet` | Print only errors (does not change the exit code). |
| `-h`, `--help` | Show help. |
| `--version` | Print the version. |

`@oversightIgnore` on a component's JSDoc exempts it; the directive is documented under [Exempting a component](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/authoring.md#exempting-a-component).

## Findings

Findings name a rule id. The rules are shared with the addon, so they are documented outside both packages:

- [Rules](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/rules.md), what each one fires on and its default severity
- [Troubleshooting](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/troubleshooting.md), a fix for every finding
- [Authoring MCP-legible docs](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/authoring.md), how to write the docs that keep most of them from firing, and [exempting a component](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/authoring.md#exempting-a-component) with `@oversightIgnore`
- [Why these are lint rules](https://github.com/rachelslurs/storybook-oversight/blob/main/docs/why-lint-rules.md), the four that need judgment a raw view can't give you

## Configuration file

Flags override an optional `oversight.config.json` in the working directory (or a path passed with `--config`):

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

The panel reads its `rules` and `expectedExtractor` from `.storybook/manager.ts`, which the CLI cannot execute, so the CLI takes its configuration from flags or this file.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for the release history.

## License

MIT
