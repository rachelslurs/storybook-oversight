# storybook-addon-oversight

## 0.3.1

### Patch Changes

- 88e8873: A JSDoc tag whose value is `null` now reads as a bare tag rather than the token `"null"`. `@oversightIgnore: null` exempted nothing and reported `null` as an unknown rule, and `@deprecated: null` rendered as `marked @deprecated: null`.

  Three strings lost an em dash. The `oversight` help header now opens `oversight: lint a Storybook MCP components manifest`, `component-description-missing` reads `...has no component description, so the MCP and Docs tab describe it as nothing.`, and `unknown-ignore-rule` ends `...: <rules>. Nothing is exempted by them.` Anything matching on those message strings needs updating.

  Docs only: Prettier reflows markdown to one line per paragraph, both READMEs link `oversight-lint-action`, and the repo's prose drops its em dashes.

- f2c1a2f: The `extractor-drift` mismatch message states which extractor the manifest records and which one the project expects, and stops there. Earlier releases appended "prop docs may be incomplete", an outcome the rule cannot establish, since one message serves every pairing of recorded and expected extractor in both directions. Measured on 245 components built both ways, react-component-meta extracts 1539 props against react-docgen's 877, and 693 documented against 379, so the warning told a migrating project the opposite of what happens.

  Both sides of the comparison are trimmed. An `expectedExtractor` or a `meta.docgen` carrying a trailing newline, which is how a value read from a file or an unquoted shell variable arrives, passed the emptiness check and then compared unequal against a manifest recording the same extractor, naming both sides identically in the warning.

  Projects on `features.experimentalDocgenServer` should state `react-component-meta`, as with `features.experimentalReactComponentMeta`. Both flags pick the extractor themselves and leave `typescript.reactDocgen` unread.

## 0.3.0

### Minor Changes

- 740165c: `oversight-lint` reads the ref-based (`v: 1`) components manifest that `experimentalDocgenServer` emits. Its entries defer their payloads to per-component files under `services/core/`, and the normalizer threw on that shape, so the manifest was refused at exit 2. Refs now resolve relative to the manifest: on the same six components built inline and behind refs, the findings are identical.

  The panel and the docs block still read the inline manifest only. That flag disables the dev manifest by design, so giving those surfaces a data source is separate work. What they gain here is the shared finding core: the new rule below, and prop coverage that stays quiet when the payload behind it is not trustworthy.

  Format detection branches on the manifest's `v` field. `meta.docgen` cannot do it: `experimentalDocgenServer` and `experimentalReactComponentMeta` both report `react-component-meta` while producing different shapes. A version this build does not know is refused by version number instead of reaching the normalizer.

  Two new rules. `prop-shape-unrecognized` (error) fires when the prop payload is missing the fields the prop rules read: `prop-descriptions-missing` and `required-prop-undocumented` then do not run, and the panel says prop coverage is unavailable rather than showing a figure drawn from the same fields. A build where those fields moved would otherwise report every prop in the library as undocumented. It is an error because it stands in for `required-prop-undocumented`, which is an error, and reporting it as a warning would let `--max-warnings`, unlimited by default, pass a build that had been failing. Set `--rule prop-shape-unrecognized=warning` to keep building through one.

  `ref-unresolved` (warning) fires per component when a `$ref` on an otherwise readable entry does not resolve. It collapses like the other repo-wide rules, so a layout change upstream reports once rather than once per component.

  Both prop fields are checked by type across the whole manifest, so a prop carrying an empty description still counts as undocumented and is still reported.

  Ref targets are confined to the build output. The ref grammar refuses absolute paths, URL schemes, and any path climbing more than one level. The filesystem loader resolves symlinks before reading, requires a regular file, and caps the size, so a link cannot carry a legal-looking path outside the tree or hang the run on a device file. A ref climbs one level only when the index sits in `manifests/`, since that directory is the only reason the level exists.

  A v:1 manifest no longer leads its CLI output with the raw normalizer error. That message is kept for shapes nothing can describe, where it is the only information available.

## 0.2.3

### Patch Changes

- 26a6dec: Read the `reactComponentMeta` payload key. A manifest built with `features.experimentalReactComponentMeta` carries its docgen under that key, which the normalizer did not recognize, so every component was reported as a failed extraction. On a six-component manifest that meant six `docgen-missing` errors and a non-zero exit on a manifest that was complete. The extractor is also inferred from the key when `meta.docgen` is unrecorded.

## 0.2.2

### Patch Changes

- 5baf09f: `summarizeError` now skips a message's leading `File: <path>` location line and a bare `Error:` label when picking the line it appends, and `firstNonEmptyLine` treats a lone carriage return as a line break. In the audited manifests those prelude lines vary per entry while the diagnosis follows them, so the CLI's collapsed mass-failure rows fragmented one diagnosis across per-path signatures or pooled it into a "distinct errors" row with the diagnosis absent from the output. Collapse rows, finding messages, and the addon panel's extraction and story failure lines now lead with the diagnosis; the full error text still rides on the JSON `error` field.

## 0.2.1

### Patch Changes

- 22951bd: Say what was linted, and collapse mass extraction failures. The stylish output now opens with the manifest path and its recorded extractor, and the tally counts affected manifest entries; JSON output gains `summary.manifest` (`path`, `docgen`, `entries`). When a rule's `docgen-missing` or `story-extraction-error` findings touch at least 10 distinct entries and at least half the manifest's entries, the text output and the Actions step summary render one row per error signature (signatures on fewer than 10 entries pool into one leftovers row) instead of the per-entry lines, while `--format json` keeps every finding. Extraction-failure messages now lead with the manifest error's `name` and append the message's first line when it adds information; the full error text stays on the finding's `error` field, and the name rides along on `errorName`. The addon panel's Extraction and Stories sections use the same name-led summary, hence the patch.
- 0f12767: Clamp the `@deprecated` value in the `deprecated-tag` finding message to its first non-empty line. A multi-line note used to split the CLI step-summary table row, and a whitespace-only body rendered as `X is marked @deprecated:  .`. That body now reads as a bare tag, and a note ending in a period no longer renders a doubled period. When the clamp drops continuation lines, the finding's `error` field carries the full note, included in `--format json`. Component names are also clamped to their first non-empty line, so a newline in a manifest name cannot split any finding message.

## 0.2.0

### Minor Changes

- 82615a3: `extractor-drift` now runs only when an expectation is stated via `--expected-extractor`, the config file, or the addon config; null, empty, and whitespace values read as no expectation. The rule previously compared against a built-in `react-docgen-typescript` default, which warned on projects that never configured an extractor. The manifest side no longer defaults either: a non-empty `meta.docgen` is used verbatim, otherwise the extractor is inferred from the payload key every extracted entry shares (flag-built 10.2 manifests carry `meta: null` while still recording the extractor per entry), and when neither says anything the rule reports that the manifest does not record which extractor ran. The CLI rejects an empty `--expected-extractor` and an `extractor-drift` severity override with no expectation, instead of silently disabling the rule. The mismatch message now reads `...expects "X"; prop docs may be incomplete.` The unread `NormalizedComponent.extractor` field is removed from `oversight-core`.

## 0.1.5

### Patch Changes

- 37817cc: Clamp the manifest error embedded in `docgen-missing` and `story-extraction-error` finding messages to its first non-empty line so a multi-line error (a stack trace, an embedded source file) no longer leaks into the panel or the CLI through the finding text. The full error moves to a new `error` field on those findings, included in `--format json` output.

## 0.1.4

### Patch Changes

- dc6adc2: Republish from the new `storybook-oversight` monorepo. No API or behavior change: the addon now builds over a shared `oversight-core` package, alongside the new `oversight-lint` CLI, and its repository metadata points at the renamed repo.

# v0.1.3 (Thu Jul 16 2026)

#### 🐛 Bug Fix

- docs: note experimentalDocgenServer is not yet supported [#15](https://github.com/rachelslurs/storybook-addon-oversight/pull/15) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- test: add a happy-dom harness and ReportView render tests ([@rachelslurs](https://github.com/rachelslurs))
- test: characterize that normalize throws on the ref-based index ([@rachelslurs](https://github.com/rachelslurs))
- style: left-align the status messages and drop em dashes ([@rachelslurs](https://github.com/rachelslurs))
- fix: state the real cause when the components manifest is unavailable ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.2 (Thu Jul 16 2026)

#### 🐛 Bug Fix

- fix: show an error state instead of hanging when the manifest can't be parsed [#14](https://github.com/rachelslurs/storybook-addon-oversight/pull/14) ([@rachelslurs](https://github.com/rachelslurs))
- docs: troubleshoot docgen-missing + add issue templates [#10](https://github.com/rachelslurs/storybook-addon-oversight/pull/10) ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.1 (Wed Jul 15 2026)

#### 🐛 Bug Fix

- fix: build manager with classic JSX runtime to avoid dual-React crash [#8](https://github.com/rachelslurs/storybook-addon-oversight/pull/8) ([@rachelslurs](https://github.com/rachelslurs))
- chore: regenerate block and drift screenshots for the a11y update [#7](https://github.com/rachelslurs/storybook-addon-oversight/pull/7) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- docs: add blog post link to README for additional context ([@rachelslurs](https://github.com/rachelslurs))
- ci: use GH_TOKEN so Auto can push past the main ruleset ([@rachelslurs](https://github.com/rachelslurs))
- ci: add CODEOWNERS so rulesets can require my review ([@rachelslurs](https://github.com/rachelslurs))
- ci: give Auto a GitHub-linked author for release commits ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.0 (Tue Jul 14 2026)

#### 🚀 Enhancement

- chore: update binary assets for findings and oversight panel [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- fix(a11y): make severity colors WCAG AA and lighten the panel [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: restructure README opening and add an animated hero [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: apply writing-style edits to README and Overview [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs(demo): add a Findings-section crop to the Overview [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs(demo): make Panel a valid @oversightIgnore example, drop unknown-ignore-rule [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- feat: surface findings as named lint rules in the panel and docs block [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: scope the "authoring" section to authoring, not all linting [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))

#### 🐛 Bug Fix

- fix: center the Overview icon [#5](https://github.com/rachelslurs/storybook-addon-oversight/pull/5) ([@rachelslurs](https://github.com/rachelslurs))
- docs: expand the demo Overview (screenshots + icon + light theme) [#4](https://github.com/rachelslurs/storybook-addon-oversight/pull/4) ([@rachelslurs](https://github.com/rachelslurs))
- style: polish the demo components with Tailwind [#3](https://github.com/rachelslurs/storybook-addon-oversight/pull/3) ([@rachelslurs](https://github.com/rachelslurs))
- ci: host the demo Storybook on GitHub Pages [#2](https://github.com/rachelslurs/storybook-addon-oversight/pull/2) ([@rachelslurs](https://github.com/rachelslurs))
- ci: PR-based, label-driven release workflow [#1](https://github.com/rachelslurs/storybook-addon-oversight/pull/1) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- docs: remove em-dashes from the Overview and README ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.0.1 (Mon Jul 13 2026)

#### ⚠️ Pushed to `main`

- docs: add logo to the README and a favicon to the demo Storybook ([@rachelslurs](https://github.com/rachelslurs))
- chore: add the addon icon and point the catalog at it ([@rachelslurs](https://github.com/rachelslurs))
- chore: wire up CI, Auto release, and prepublish checks ([@rachelslurs](https://github.com/rachelslurs))
- docs: write the README ([@rachelslurs](https://github.com/rachelslurs))
- feat(demo): add a demo Storybook that dogfoods the addon ([@rachelslurs](https://github.com/rachelslurs))
- feat(blocks): add the Docs-page coverage block ([@rachelslurs](https://github.com/rachelslurs))
- feat(manager): add the Oversight panel ([@rachelslurs](https://github.com/rachelslurs))
- feat(core): normalize and lint the Storybook components manifest ([@rachelslurs](https://github.com/rachelslurs))
- build: configure package, TypeScript, tsup, vitest, and ESLint ([@rachelslurs](https://github.com/rachelslurs))
- Initial commit ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))
