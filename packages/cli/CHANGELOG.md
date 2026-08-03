# oversight-lint

## 0.6.0

### Minor Changes

- One word per thing. A rule dictates a finding, whose parts are a severity, a rule name, a message and a hint. Finding is the only word for it now: the type was `Diagnostic`, the tally said "problems", and prose said "issues". `oversight-core` is the rules engine.

  Two strings consumers might match on changed. The tally line reads `✖ 5 findings (2 errors, 2 warnings, 1 info)` where it read `5 problems`, and `component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.`

  The rule reference moved to `docs/rules.md` in the repository, so this package's README links out for it where it used to carry it inline.

### Patch Changes

- Every finding carries the one-line hint for its rule, on a new `hint` field distilled from `docs/troubleshooting.md`. It prints as a dimmed `hint:` line under each finding, as the `hint` field in `--format json`, as the second line of each `--format github` annotation, and in the Message column of the Actions step summary. `deprecated-tag` has none: it reports a fact rather than a defect.

- A file that parses but is not a components manifest exits 2 instead of reporting no findings at exit 0. A job pointed at a stale path passed forever while linting nothing, and that path is a string in a config. A manifest that records no entries is still a real manifest and still exits 0.

- A GitHub annotation points at the file it is about, at a path the repository has. Every rule but `story-extraction-error` reports the component's own source, and anchoring on the stories file put the annotation on a file that does not contain the problem, or outside the diff entirely. The path resolves from the checkout root as well, so a Storybook living in a package directory annotates `storybook/src/Avatar/Avatar.tsx` rather than `src/Avatar/Avatar.tsx`. GitHub drops an annotation whose path it cannot resolve without reporting anything, and no working-directory setting changes that.

  A failed extraction records no source path of its own, so `docgen-missing` anchors on the stories file and takes the same prefix, read off the entries that did extract.

- Crossing `--max-warnings` says so, on stderr, naming the count and the ceiling. The run failed with output identical to a passing one, so a CI job stopped on the ceiling named nothing that had stopped it.

- The Actions step summary renders a message as text. It is markdown rendered against a repository, so `@deprecated` in a `deprecated-tag` message linked to a GitHub account of that name and `#12` would have linked to an issue. Mention-shaped and reference-shaped tokens go in as code spans, which GitHub's autolinker leaves alone.

- Every run prints `oversight-lint <version>` on stderr. `--format github` prints only workflow commands and `--format json` only JSON, so a CI log had no way to say which version produced it.

- New rule, `props-unrecorded` (warning): an entry that records no props at all, so the MCP describes the component as taking none. Extraction can drop a prop carrying no JSDoc, which makes an undocumented prop absent exactly when it is undocumented, so `prop-descriptions-missing` cannot see it; `children` typed through a spread is the common case. The manifest cannot tell that apart from a component that genuinely takes no props, so the rule fires on both and its hint names `@oversightIgnore props-unrecorded` for the second.

- `docgen-missing`'s hint names its causes in the order they are worth checking. It named `typescript.reactDocgen` alone, which told a project that had already set it correctly to set it again, under a message about something else. A story whose `meta` names no component is one of those causes and is the fifth entry under that rule in `docs/troubleshooting.md`, the only one whose fix is in the stories file.

- `unknown-ignore-rule` reads correctly for one token: `Nothing is exempted by it`, where the plural read as a typo inside a message reporting someone else's typo. Its hint is number-neutral, since one string per rule cannot agree with a message naming one token or several.

- Source paths in messages are the ones the repository knows. `react-docgen-typescript` prefixes its declaration paths with the project directory's own name, so a file the repository knows as `stories/Badge/Badge.tsx` arrived as `my-project/stories/Badge/Badge.tsx` and every message naming a path named one that does not exist. The segment is detected once across the whole manifest, and only where dropping it lands exactly on the stories file's own directory, so a project whose sources genuinely sit under a nested directory keeps it.

## 0.6.0-beta.2

### Patch Changes

- df251d6: `@deprecated` in a job-summary message renders as text. Escaping it as an entity did not work: `&#64;deprecated` decodes before GitHub's autolinker runs, so it still linked to an account of that name. Mention-shaped and reference-shaped tokens go in as code spans, which the autolinker leaves alone.

  Every run prints `oversight-lint <version>` on stderr. `--format github` prints only workflow commands and `--format json` only JSON, so a CI log had no way to say which version produced it, and confirming a release meant inferring it from behavior.

  `props-unrecorded`'s hint names the escape hatch. The manifest cannot tell a component whose prop was dropped from one that takes none, so the rule fires on both, and the hint told the reader holding the false positive to document a prop that does not exist without mentioning `@oversightIgnore props-unrecorded`.

  `unknown-ignore-rule`'s hint no longer says "the token" under a message naming several. A hint is one string per rule, so it reads number-neutral instead.

## 0.6.0-beta.1

### Patch Changes

- 744b0e2: Crossing `--max-warnings` says so. The run failed with output identical to a passing one, so a CI job stopped on the ceiling named nothing that had stopped it.

  The GitHub step summary renders a message as text. It is markdown rendered against a repository, so `@deprecated` in a `deprecated-tag` message linked to a GitHub account of that name, and `#12` would have linked to an issue.

  `docgen-missing`'s hint names the causes in the order they are worth checking. It named `typescript.reactDocgen` alone, which told a project that had already set it correctly to set it again, under a message about something else. A story whose `meta` names no component is documented in `docs/troubleshooting.md` as the fifth cause, the one whose fix is in the stories file.

- 48badba: A file that parses but is not a components manifest exits 2 instead of reporting no findings at exit 0. A job pointed at a stale path passed forever while linting nothing, and the path is a string in a config. A manifest that records no entries still exits 0.

  A GitHub annotation points at the file it is about, and at a path the repository has. Every rule but `story-extraction-error` reports the component's own source, and anchoring on the stories file put the annotation on a file that does not contain the problem, or outside the diff entirely. The path is now resolved from the checkout root as well, so a Storybook living in a package directory annotates `storybook/src/Avatar/Avatar.tsx` rather than `src/Avatar/Avatar.tsx`; GitHub drops an annotation whose path it cannot resolve without reporting anything, and no working-directory setting changes that.

  New rule, `props-unrecorded` (warning): an entry that records no props at all, so the MCP describes the component as taking none. Extraction can drop a prop that carries no JSDoc, which makes an undocumented prop absent exactly when it is undocumented, so `prop-descriptions-missing` cannot see it. `children` typed through a spread is the common case. A component that genuinely takes no props exempts itself with `@oversightIgnore props-unrecorded`.

- 4ed2892: A finding names the props it is about on both surfaces. The panel and the Docs block said how many props were undocumented while the props table below said which were, so reading one meant crossing it against the other. The CLI has always named them.

  The hint opens below its trigger. The Hint column is the last one and its heading sits directly over the first row's lightbulb, so the note covered the word naming what it was.

  `unknown-ignore-rule` says "Nothing is exempted by it" for a single token, which read as a typo inside the message reporting someone else's typo.

## 0.6.0-beta.0

### Minor Changes

- 63d3fb4: One word per thing. The two surfaces are the addons panel and the Docs block, which the addon called the manager panel and the Docs-page block in places. A rule dictates a finding, whose parts are a severity, a rule name, a message and a hint. Finding is the only word for it now: the type was `Diagnostic`, the CLI tally said "problems", and prose said "issues". `oversight-core` is the rules engine.

  The CLI's tally line reads `✖ 5 findings (2 errors, 2 warnings, 1 info)` where it read `5 problems`. Anything matching on that word needs updating.

  The addon README heading is now `Optional: enable the Docs block`, so `#optional-enable-the-docs-page-block` no longer resolves.

### Patch Changes

- b959c99: Every finding carries the one-line hint for its rule, on a new `hint` field, distilled from `docs/troubleshooting.md`. It lives with the rules rather than in a renderer, so the panel and the Docs block give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect. The field is `hint` rather than `fix` because ESLint's `fix` is a machine-applicable edit that `--fix` applies, and this is a sentence to read.

  `oversight-lint` prints it too: a dimmed `hint:` line under each finding, the `hint` field in `--format json`, the second line of each `--format github` annotation, and the Message column of the Actions step summary.

  In the panel and the Docs block the findings read as a table: rule, severity, message, and a hint the last column reveals from a lightbulb, on pointer or on keyboard focus. The lightbulb names itself with the hint text, so the fix is read out whether or not it is opened. Its columns name it, so it stands without a heading, the way the props table does. Both tables in a report share one treatment and one text size, and each scrolls inside its own box rather than spilling out of the section on a narrow panel.

  `component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.

## 0.5.1

### Patch Changes

- 88e8873: A JSDoc tag whose value is `null` now reads as a bare tag rather than the token `"null"`. `@oversightIgnore: null` exempted nothing and reported `null` as an unknown rule, and `@deprecated: null` rendered as `marked @deprecated: null`.

  Three strings lost an em dash. The `oversight` help header now opens `oversight: lint a Storybook MCP components manifest`, `component-description-missing` reads `...has no component description, so the MCP and Docs tab describe it as nothing.`, and `unknown-ignore-rule` ends `...: <rules>. Nothing is exempted by them.` Anything matching on those message strings needs updating.

  Docs only: Prettier reflows markdown to one line per paragraph, both READMEs link `oversight-lint-action`, and the repo's prose drops its em dashes.

- f2c1a2f: The `extractor-drift` mismatch message states which extractor the manifest records and which one the project expects, and stops there. Earlier releases appended "prop docs may be incomplete", an outcome the rule cannot establish, since one message serves every pairing of recorded and expected extractor in both directions. Measured on 245 components built both ways, react-component-meta extracts 1539 props against react-docgen's 877, and 693 documented against 379, so the warning told a migrating project the opposite of what happens.

  Both sides of the comparison are trimmed. An `expectedExtractor` or a `meta.docgen` carrying a trailing newline, which is how a value read from a file or an unquoted shell variable arrives, passed the emptiness check and then compared unequal against a manifest recording the same extractor, naming both sides identically in the warning.

  Projects on `features.experimentalDocgenServer` should state `react-component-meta`, as with `features.experimentalReactComponentMeta`. Both flags pick the extractor themselves and leave `typescript.reactDocgen` unread.

## 0.5.0

### Minor Changes

- 740165c: `oversight-lint` reads the ref-based (`v: 1`) components manifest that `experimentalDocgenServer` emits. Its entries defer their payloads to per-component files under `services/core/`, and the normalizer threw on that shape, so the manifest was refused at exit 2. Refs now resolve relative to the manifest: on the same six components built inline and behind refs, the findings are identical.

  The panel and the docs block still read the inline manifest only. That flag disables the dev manifest by design, so giving those surfaces a data source is separate work. What they gain here is the shared finding core: the new rule below, and prop coverage that stays quiet when the payload behind it is not trustworthy.

  Format detection branches on the manifest's `v` field. `meta.docgen` cannot do it: `experimentalDocgenServer` and `experimentalReactComponentMeta` both report `react-component-meta` while producing different shapes. A version this build does not know is refused by version number instead of reaching the normalizer.

  Two new rules. `prop-shape-unrecognized` (error) fires when the prop payload is missing the fields the prop rules read: `prop-descriptions-missing` and `required-prop-undocumented` then do not run, and the panel says prop coverage is unavailable rather than showing a figure drawn from the same fields. A build where those fields moved would otherwise report every prop in the library as undocumented. It is an error because it stands in for `required-prop-undocumented`, which is an error, and reporting it as a warning would let `--max-warnings`, unlimited by default, pass a build that had been failing. Set `--rule prop-shape-unrecognized=warning` to keep building through one.

  `ref-unresolved` (warning) fires per component when a `$ref` on an otherwise readable entry does not resolve. It collapses like the other repo-wide rules, so a layout change upstream reports once rather than once per component.

  Both prop fields are checked by type across the whole manifest, so a prop carrying an empty description still counts as undocumented and is still reported.

  Ref targets are confined to the build output. The ref grammar refuses absolute paths, URL schemes, and any path climbing more than one level. The filesystem loader resolves symlinks before reading, requires a regular file, and caps the size, so a link cannot carry a legal-looking path outside the tree or hang the run on a device file. A ref climbs one level only when the index sits in `manifests/`, since that directory is the only reason the level exists.

  A v:1 manifest no longer leads its CLI output with the raw normalizer error. That message is kept for shapes nothing can describe, where it is the only information available.

## 0.4.2

### Patch Changes

- 26a6dec: Read the `reactComponentMeta` payload key. A manifest built with `features.experimentalReactComponentMeta` carries its docgen under that key, which the normalizer did not recognize, so every component was reported as a failed extraction. On a six-component manifest that meant six `docgen-missing` errors and a non-zero exit on a manifest that was complete. The extractor is also inferred from the key when `meta.docgen` is unrecorded.

## 0.4.1

### Patch Changes

- 5baf09f: `summarizeError` now skips a message's leading `File: <path>` location line and a bare `Error:` label when picking the line it appends, and `firstNonEmptyLine` treats a lone carriage return as a line break. In the audited manifests those prelude lines vary per entry while the diagnosis follows them, so the CLI's collapsed mass-failure rows fragmented one diagnosis across per-path signatures or pooled it into a "distinct errors" row with the diagnosis absent from the output. Collapse rows, finding messages, and the addon panel's extraction and story failure lines now lead with the diagnosis; the full error text still rides on the JSON `error` field.
- 1b1e6ef: Distinguish the group heading for manifest entries that share a component name. Findings group per entry, so a component with several stories files used to render repeated identical headings: primer-react printed three byte-identical `AnchoredOverlay` blocks, and 92 of its 236 headings were adjacent duplicates. When another entry in the manifest carries the same name, the heading and the Actions step summary's Component cell now append the entry's stories file, as in `Features (src/Dialog/Dialog.features.stories.tsx)`. An entry falls back to its entry id when it records no usable stories file or when a same-named entry records the same one, decided per entry so one entry cannot change how its siblings read; entries named `Manifest` are always labelled, since manifest-level findings own that heading. Unique names keep the bare heading. The stories file is clamped to one line and its cell escaped, so a newline or a pipe in a manifest `path` can no longer split a heading or a step-summary row, and a non-string `path` no longer throws where a stack trace would replace the exit-2 malformed-manifest message. Labelling only: the grouping, the counts, and `--json` are unchanged.

## 0.4.0

### Minor Changes

- 22951bd: Say what was linted, and collapse mass extraction failures. The stylish output now opens with the manifest path and its recorded extractor, and the tally counts affected manifest entries; JSON output gains `summary.manifest` (`path`, `docgen`, `entries`). When a rule's `docgen-missing` or `story-extraction-error` findings touch at least 10 distinct entries and at least half the manifest's entries, the text output and the Actions step summary render one row per error signature (signatures on fewer than 10 entries pool into one leftovers row) instead of the per-entry lines, while `--format json` keeps every finding. Extraction-failure messages now lead with the manifest error's `name` and append the message's first line when it adds information; the full error text stays on the finding's `error` field, and the name rides along on `errorName`. The addon panel's Extraction and Stories sections use the same name-led summary, hence the patch.

### Patch Changes

- 0f12767: Clamp the `@deprecated` value in the `deprecated-tag` finding message to its first non-empty line. A multi-line note used to split the CLI step-summary table row, and a whitespace-only body rendered as `X is marked @deprecated:  .`. That body now reads as a bare tag, and a note ending in a period no longer renders a doubled period. When the clamp drops continuation lines, the finding's `error` field carries the full note, included in `--format json`. Component names are also clamped to their first non-empty line, so a newline in a manifest name cannot split any finding message.
- 56bc132: The missing-manifest message now states which Storybook versions can produce a components manifest: 10.3 and later emit one when `features.componentsManifest` is enabled in `.storybook/main.ts` (installing `@storybook/addon-mcp` enables it), 10.1 and 10.2 only behind `features.experimentalComponentsManifest` (unsupported), and below 10.1 no configuration produces one. It previously advised enabling `@storybook/addon-mcp` alone, advice that cannot work below 10.3. The CLI README now states the supported range, and records that `docs-link-dangling` validates the description-redirect convention and stays silent in repos that do not use it.

## 0.3.0

### Minor Changes

- 82615a3: `extractor-drift` now runs only when an expectation is stated via `--expected-extractor`, the config file, or the addon config; null, empty, and whitespace values read as no expectation. The rule previously compared against a built-in `react-docgen-typescript` default, which warned on projects that never configured an extractor. The manifest side no longer defaults either: a non-empty `meta.docgen` is used verbatim, otherwise the extractor is inferred from the payload key every extracted entry shares (flag-built 10.2 manifests carry `meta: null` while still recording the extractor per entry), and when neither says anything the rule reports that the manifest does not record which extractor ran. The CLI rejects an empty `--expected-extractor` and an `extractor-drift` severity override with no expectation, instead of silently disabling the rule. The mismatch message now reads `...expects "X"; prop docs may be incomplete.` The unread `NormalizedComponent.extractor` field is removed from `oversight-core`.

## 0.2.1

### Patch Changes

- 37817cc: Clamp the manifest error embedded in `docgen-missing` and `story-extraction-error` finding messages to its first non-empty line so a multi-line error (a stack trace, an embedded source file) no longer leaks into the panel or the CLI through the finding text. The full error moves to a new `error` field on those findings, included in `--format json` output.

## 0.2.0

### Minor Changes

- 38aa5bb: Add `--format <text|json|github>`. The new `github` format emits GitHub Actions workflow-command annotations (`::error`/`::warning`/`::notice`, titled `oversight/<rule>` and anchored to the stories file) so findings surface as annotations on the run and the pull request's Checks tab. `--json` now aliases `--format json`; findings have no line numbers, so each annotation anchors to the top of the stories file, capped at GitHub's ~10-per-type-per-step limit.

## 0.1.0

### Minor Changes

- dc6adc2: Initial release. Lints a Storybook MCP components manifest in CI over the same rules as `storybook-addon-oversight`: reads the built `components.json`, reports findings grouped by component, and exits 0 (clean), 1 (findings or over `--max-warnings`), or 2 (could not run). Supports `--json`, `--rule` overrides, `oversight.config.json`, and a GitHub Actions job-summary table.
