# oversight-lint

Lint your Storybook MCP components manifest in CI.

Your coding agent reads your components from the manifest Storybook's MCP server generates. When a description never reaches that manifest (extraction failed, the wrong docgen extractor ran, or the JSDoc is missing), the agent sees a component with no docs. `oversight-lint` runs over the built manifest and fails the build when that happens, so a regression stops at CI instead of reaching the agent.

It runs the same rules as [`storybook-addon-oversight`](../storybook-addon-oversight/README.md), which surfaces them live in Storybook while you work.

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

✖ 2 problems (1 error, 1 warning, 0 info), 1 of 42 entries affected
```

The header names the manifest that was linted and its recorded extractor: `meta.docgen` when the manifest sets it, else the payload key every extracted entry shares (`reactDocgenTypescript`, `reactDocgen` or `reactComponentMeta`). It matters because the same path can hold a different artifact per build: a config like `reactDocgen: isCI ? 'react-docgen-typescript' : 'react-docgen'` writes one manifest in CI and another locally, and toggling `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` changes it without touching `reactDocgen` at all.

Counts are per manifest entry. One entry exists per stories file, so a component with several stories files produces several entries, and every count is inflated relative to components. The CLI does not deduplicate by component name: names collide across packages, and the manifest offers no stronger component identity than the entry id.

Findings are grouped by entry, headed with the entry's component name. When another entry in the manifest shares that name, the heading adds the stories file, because the name alone cannot say which file a finding came from: `Features (src/Dialog/Dialog.features.stories.tsx)`. An entry is labeled with its entry id instead when it records no stories file, or when a same-named entry records the same one; that choice is made per entry, so one entry never changes how its siblings read. Entries named `Manifest` are always labeled, since manifest-level findings own that heading. The Actions step summary labels its Component column the same way.

`--format json` (alias `--json`) emits the same findings keyed by component id, with the summary counts and the manifest's `path`, `docgen`, and `entries` count under `summary.manifest`, for programmatic use. `docgen-missing` and `story-extraction-error` findings carry the full extraction error on an `error` field and, when the manifest error carries one, its `name` on `errorName`; their messages lead with the name and append the message's diagnosis line when it adds information. In the audited manifests, react-docgen-typescript failures open the message with a `File: <path>` line and react-docgen adds a bare `Error:` label; the summary skips those lines and leads with the line after them, while the full text stays on the JSON `error` field.

### Mass failures collapse in text output

A repo-wide extraction failure fires `docgen-missing` once per entry and `story-extraction-error` once per failing story, several per entry, so text output would render hundreds of near-identical findings. When one rule's findings touch at least 10 distinct entries and at least half the manifest's entries, they leave the per-entry groups and render as one line per error signature (the same one-line summary the messages use), stating the count, the share, and the diagnosis:

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

`@oversightIgnore` on a component's JSDoc exempts it; the directive is documented under [Exempting a component](#exempting-a-component).

## Diagnostics

`oversight-lint` and [`storybook-addon-oversight`](../storybook-addon-oversight/README.md) run the same rules from `oversight-core`, at these default severities:

| Rule | Default severity | Fires when |
| --- | --- | --- |
| `docgen-missing` | error | an entry has no docgen payload (extraction failed) |
| `story-extraction-error` | warning | a story's snippet/docgen extraction failed (`stories[].error`) |
| `extractor-drift` | warning | `meta.docgen` ≠ the expected extractor, or unrecorded; runs only when an expectation is configured |
| `component-description-missing` | warning | no component description |
| `prop-descriptions-missing` | warning | props without JSDoc descriptions |
| `required-prop-undocumented` | error | required props without JSDoc descriptions |
| `docs-link-dangling` | error | a prose `?path=/docs\|story/…` link targets an id whose component prefix isn't in the manifest |
| `unknown-ignore-rule` | warning | `@oversightIgnore` lists a token that is not a rule name |
| `deprecated-tag` | info | a `@deprecated` tag is present |
| `prop-shape-unrecognized` | error | the prop payload is missing the fields the prop rules read |
| `ref-unresolved` | warning | a `$ref` on an otherwise-readable component did not resolve |

When `prop-shape-unrecognized` fires, `prop-descriptions-missing` and `required-prop-undocumented` do not run. Both read `props[n].description` and `props[n].required`, and a build where those fields have moved would otherwise report every prop in the library as undocumented. The check asks whether the field names still exist anywhere in the manifest, so a prop carrying an empty description still counts as undocumented and is still reported. Set `--rule prop-shape-unrecognized=warning` to keep building through one.

The repo README covers [why these are lint rules](../../README.md#why-these-are-lint-rules), including why this one is an `error`.

## Troubleshooting

### `docgen-missing`

`docgen-missing` means the extractor returned no docs for the component's file, so its props and JSDoc never reach the manifest. An agent sees the component with no documented props. In order of likelihood:

1. **`reactDocgen` isn't `react-docgen-typescript`.** Set `typescript.reactDocgen: 'react-docgen-typescript'` in `.storybook/main.ts` so JSDoc on components and props is extracted. This one does not apply if `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` is on. Either flag selects the extractor on its own and `typescript.reactDocgen` is never read, so changing it has no effect. Check `meta.docgen` in the manifest for which extractor actually ran.
2. **Your root `tsconfig.json` is solution-style.** The default `npm create vite` (react-ts) scaffold ships a root that only delegates to project references and owns no files:

   ```jsonc
   // tsconfig.json
   { "files": [], "references": [{ "path": "./tsconfig.app.json" } /* , … */] }
   ```

   Storybook's manifest docgen (`@storybook/react`) resolves the nearest tsconfig at your project root and builds its TypeScript program from it. A solution-style root contributes no files of its own, so the program is empty and extraction returns nothing, even for a fully-typed, fully-documented component. Give that root config your sources:

   ```jsonc
   // tsconfig.json
   { "extends": "./tsconfig.app.json", "include": ["src"] }
   ```

3. **`reactDocgenTypescriptOptions.tsconfigPath` won't fix this.** There are two docgen paths and they don't share a tsconfig: Storybook's Docs UI honors `typescript.reactDocgenTypescriptOptions.tsconfigPath`, but the manifest docgen that Oversight reads uses `findTsconfigPath(cwd)` and ignores it. So that override can make your Docs prop tables render while this finding still fires. Fix the tsconfig your project _root_ resolves to (point 2).
4. **Your component's default export is an expression.** `export default Checkbox as WithSlotMarker<typeof Checkbox>` and `export default Object.assign(TabNav, {Link})` both break the link between the export and the declaration your JSDoc sits on. `react-docgen-typescript` then reports `found no component docs` for that file and extracts nothing, so props go with the description. Give the documented thing a name and export that:

   ```ts
   import CheckboxImpl from './Checkbox';

   /** An accessible, native checkbox component */
   const Checkbox = CheckboxImpl;
   export default Checkbox;
   ```

   Moving the JSDoc onto the barrel's `export {default} from './Checkbox'`, or onto a bare `export default Checkbox` re-export, does not work. The doc comment has to sit on a declaration.

   `react-component-meta` has the same blind spot with a quieter symptom: props extract normally and only the description comes out empty, so you get `component-description-missing` instead of this rule. `react-docgen` resolves both forms and is unaffected.

### `component-description-missing` on a documented component

Most `component-description-missing` findings mean no description was written. When the JSDoc is there and the extractor is `react-component-meta`, check [item 4 under `docgen-missing`](#docgen-missing): an expression default export loses only the description under that extractor, so the failure lands on this rule instead. The fix there applies.

## Authoring MCP-legible docs

Put a JSDoc block above the component and on each prop; no addon-specific tags. Where two components are confusable, end the description with a redirect the MCP passes through verbatim:

```ts
/**
 * A committed-selection box: tick one or more items and submit them together,
 * rather than applying each change the moment it flips.
 * For a setting that applies the moment it flips, use
 * [Toggle](?path=/docs/forms-toggle--docs) instead.
 */
```

The `[Toggle](?path=…)` link is validated by `docs-link-dangling` and is made clickable in the addon's panel.

### Exempting a component

`@oversightIgnore` keeps a component in the manifest (agents still see its docs) but exempts it from lint rules (bare for all rules, or scoped):

```ts
/**
 * An internal token catalog; coverage rules don't apply.
 *
 * @oversightIgnore docgen-missing, story-extraction-error
 */
```

This is deliberately different from Storybook's `!manifest` tag, which removes the component from the manifest, and therefore from agents, entirely. Use `!manifest` to hide, `@oversightIgnore` to exempt.

Unrecognized rule names in the list are themselves flagged (`unknown-ignore-rule`) rather than silently exempting nothing. For an entry whose docgen extraction failed (no component JSDoc reaches the manifest), put `@oversightIgnore` on the JSDoc above the stories file's `meta`, the one case where story-meta JSDoc is sanctioned.

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
