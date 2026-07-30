# oversight-lint

## 0.4.1

### Patch Changes

- 5baf09f: `summarizeError` now skips a message's leading `File: <path>` location line and a bare `Error:` label when picking the line it appends, and `firstNonEmptyLine` treats a lone carriage return as a line break. In the audited manifests those prelude lines vary per entry while the diagnosis follows them, so the CLI's collapsed mass-failure rows fragmented one diagnosis across per-path signatures or pooled it into a "distinct errors" row with the diagnosis absent from the output. Collapse rows, finding messages, and the addon panel's extraction and story failure lines now lead with the diagnosis; the full error text still rides on the JSON `error` field.
- 1b1e6ef: Distinguish the group heading for manifest entries that share a component name. Findings group per entry, so a component with several stories files used to render repeated identical headings: primer-react printed three byte-identical `AnchoredOverlay` blocks, and 92 of its 236 headings were adjacent duplicates. When another entry in the manifest carries the same name, the heading and the Actions step summary's Component cell now append the entry's stories file, as in `Features (src/Dialog/Dialog.features.stories.tsx)`. An entry falls back to its entry id when it records no usable stories file or when a same-named entry records the same one, decided per entry so one entry cannot change how its siblings read; entries named `Manifest` are always labelled, since manifest-level findings own that heading. Unique names keep the bare heading. The stories file is clamped to one line and its cell escaped, so a newline or a pipe in a manifest `path` can no longer split a heading or a step-summary row, and a non-string `path` no longer throws where a stack trace would replace the exit-2 malformed-manifest message. Labelling only: the grouping, the counts, and `--json` are unchanged.

## 0.4.0

### Minor Changes

- 22951bd: Say what was linted, and collapse mass extraction failures. The stylish output now opens with the manifest path and its recorded extractor, and the tally counts affected manifest entries; JSON output gains `summary.manifest` (`path`, `docgen`, `entries`). When a rule's `docgen-missing` or `story-extraction-error` findings touch at least 10 distinct entries and at least half the manifest's entries, the text output and the Actions step summary render one row per error signature (signatures on fewer than 10 entries pool into one leftovers row) instead of the per-entry lines, while `--format json` keeps every finding. Extraction-failure messages now lead with the manifest error's `name` and append the message's first line when it adds information; the full error text stays on the finding's `error` field, and the name rides along on `errorName`. The addon panel's Extraction and Stories sections use the same name-led summary, hence the patch.

### Patch Changes

- 0f12767: Clamp the `@deprecated` value in the `deprecated-tag` finding message to its first non-empty line. A multi-line note used to split the CLI step-summary table row, and a whitespace-only body rendered as `X is marked @deprecated:  .`. That body now reads as a bare tag, and a note ending in a period no longer renders a doubled period. When the clamp drops continuation lines, the finding's `error` field carries the full note, included in `--format json`. Component names are also clamped to their first non-empty line, so a newline in a manifest name cannot split any finding message.
- 56bc132: The missing-manifest message now states which Storybook versions can produce a
  components manifest: 10.3 and later emit one when `features.componentsManifest`
  is enabled in `.storybook/main.ts` (installing `@storybook/addon-mcp` enables
  it), 10.1 and 10.2 only behind `features.experimentalComponentsManifest`
  (unsupported), and below 10.1 no configuration produces one. It previously
  advised enabling `@storybook/addon-mcp` alone, advice that cannot work below
  10.3. The CLI README now states the supported range, and records that
  `docs-link-dangling` validates the description-redirect convention and stays
  silent in repos that do not use it.

## 0.3.0

### Minor Changes

- 82615a3: `extractor-drift` now runs only when an expectation is stated via `--expected-extractor`, the config file, or the addon config; null, empty, and whitespace values read as no expectation. The rule previously compared against a built-in `react-docgen-typescript` default, which warned on projects that never configured an extractor. The manifest side no longer defaults either: a non-empty `meta.docgen` is used verbatim, otherwise the extractor is inferred from the payload key every extracted entry shares (flag-built 10.2 manifests carry `meta: null` while still recording the extractor per entry), and when neither says anything the rule reports that the manifest does not record which extractor ran. The CLI rejects an empty `--expected-extractor` and an `extractor-drift` severity override with no expectation, instead of silently disabling the rule. The mismatch message now reads `...expects "X"; prop docs may be incomplete.` The unread `NormalizedComponent.extractor` field is removed from `oversight-core`.

## 0.2.1

### Patch Changes

- 37817cc: Clamp the manifest error embedded in `docgen-missing` and `story-extraction-error` finding messages to its first non-empty line so a multi-line error (a stack trace, an embedded source file) no longer leaks into the panel or the CLI through the finding text. The full error moves to a new `error` field on those diagnostics, included in `--format json` output.

## 0.2.0

### Minor Changes

- 38aa5bb: Add `--format <text|json|github>`. The new `github` format emits GitHub Actions workflow-command annotations (`::error`/`::warning`/`::notice`, titled `oversight/<rule>` and anchored to the stories file) so findings surface as annotations on the run and the pull request's Checks tab. `--json` now aliases `--format json`; findings have no line numbers, so each annotation anchors to the top of the stories file, capped at GitHub's ~10-per-type-per-step limit.

## 0.1.0

### Minor Changes

- dc6adc2: Initial release. Lints a Storybook MCP components manifest in CI over the same rules as `storybook-addon-oversight`: reads the built `components.json`, reports findings grouped by component, and exits 0 (clean), 1 (findings or over `--max-warnings`), or 2 (could not run). Supports `--json`, `--rule` overrides, `oversight.config.json`, and a GitHub Actions job-summary table.
