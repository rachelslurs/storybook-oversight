# storybook-addon-oversight

## 0.4.0

### Minor Changes

- 63d3fb4: One word per thing. The two surfaces are the addons panel and the Docs block, which the addon called the manager panel and the Docs-page block in places. A rule dictates a finding, whose parts are a severity, a rule name, a message and a hint. Finding is the only word for it now: the type was `Diagnostic`, the CLI tally said "problems", and prose said "issues". `oversight-core` is the rules engine.

  The CLI's tally line reads `✖ 5 findings (2 errors, 2 warnings, 1 info)` where it read `5 problems`. Anything matching on that word needs updating.

  The addon README heading is now `Optional: enable the Docs block`, so `#optional-enable-the-docs-page-block` no longer resolves.

### Patch Changes

- 07b4225: Everything a report says with a glyph says it in words too. A dangling `?path=` link in a description was struck through and marked with a warning sign that carried no label, so the mark meant nothing to a screen reader, while the same mark on the ids in a finding message did carry one. Both go through one component now. The tab's count badge read as "Oversight 2"; it reads as "Oversight 2 findings".
- 744b0e2: Crossing `--max-warnings` says so. The run failed with output identical to a passing one, so a CI job stopped on the ceiling named nothing that had stopped it.

  The GitHub step summary renders a message as text. It is markdown rendered against a repository, so `@deprecated` in a `deprecated-tag` message linked to a GitHub account of that name, and `#12` would have linked to an issue.

  `docgen-missing`'s hint names the causes in the order they are worth checking. It named `typescript.reactDocgen` alone, which told a project that had already set it correctly to set it again, under a message about something else. A story whose `meta` names no component is documented in `docs/troubleshooting.md` as the fifth cause, the one whose fix is in the stories file.

- a46a9ec: Section headings follow the theme on both surfaces. They set no color of their own, and the section painting the background behind them set none either, so they fell back to the browser's black: legible on a light page, and all but invisible in the Docs block on a dark one.
- 770ac85: A `docs-link-dangling` finding sets each manifest id it names as code, struck through in the same negative as the dead links in the description, with a mark carrying the reason for anyone who cannot see the strikethrough.
- 3db6ac9: The Docs block renders a component's description the way the panel does, as the prose itself. It showed a "Documented" verdict instead, on the reasoning that the Docs page prints the description higher up. That copy is the plain one: a `docs-link-dangling` finding strikes each dead `?path=` link where it appears in the description, and on this surface that marking had nowhere to land.
- 81e40b8: A `?path=` redirect in a component description is a link on the Docs block, not plain text. The block passed no link component, and the renderer falls back to the bare label when it has none, so the same redirect navigated from the panel and did nothing on a Docs page. The block links by URL: the manager's version SPA-navigates through `api.selectStory`, which is manager-api and unreachable from the preview iframe the block renders in.
- 48badba: A file that parses but is not a components manifest exits 2 instead of reporting no findings at exit 0. A job pointed at a stale path passed forever while linting nothing, and the path is a string in a config. A manifest that records no entries still exits 0.

  A GitHub annotation points at the file it is about, and at a path the repository has. Every rule but `story-extraction-error` reports the component's own source, and anchoring on the stories file put the annotation on a file that does not contain the problem, or outside the diff entirely. The path is now resolved from the checkout root as well, so a Storybook living in a package directory annotates `storybook/src/Avatar/Avatar.tsx` rather than `src/Avatar/Avatar.tsx`; GitHub drops an annotation whose path it cannot resolve without reporting anything, and no working-directory setting changes that.

  New rule, `props-unrecorded` (warning): an entry that records no props at all, so the MCP describes the component as taking none. Extraction can drop a prop that carries no JSDoc, which makes an undocumented prop absent exactly when it is undocumented, so `prop-descriptions-missing` cannot see it. `children` typed through a spread is the common case. A component that genuinely takes no props exempts itself with `@oversightIgnore props-unrecorded`.

- b959c99: Every finding carries the one-line hint for its rule, on a new `hint` field, distilled from `docs/troubleshooting.md`. It lives with the rules rather than in a renderer, so the panel and the Docs block give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect. The field is `hint` rather than `fix` because ESLint's `fix` is a machine-applicable edit that `--fix` applies, and this is a sentence to read.

  `oversight-lint` prints it too: a dimmed `hint:` line under each finding, the `hint` field in `--format json`, the second line of each `--format github` annotation, and the Message column of the Actions step summary.

  In the panel and the Docs block the findings read as a table: rule, severity, message, and a hint the last column reveals from a lightbulb, on pointer or on keyboard focus. The lightbulb names itself with the hint text, so the fix is read out whether or not it is opened. Its columns name it, so it stands without a heading, the way the props table does. Both tables in a report share one treatment and one text size, and each scrolls inside its own box rather than spilling out of the section on a narrow panel.

  `component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.

- 3c77733: A link in a description that names its own origin is left alone on the Docs block. It was rebased onto the Storybook root like a `?path=` redirect, so `[MDN](https://developer.mozilla.org/...)` resolved to `<storybook-origin>/https://developer.mozilla.org/...` and took the whole tab there. Relative targets still rebase, including the `?path=` forms carrying `&args=` or a `#hash`, which resolve against `iframe.html` and load the preview frame as the page if left alone. Absolute targets carry `rel="noopener noreferrer"`, so a private Storybook host stays out of the Referer sent to a cited site.

  Each table in a report is a named region with a tab stop. Nothing inside them takes focus, so a table with more columns than room was one a keyboard could neither reach nor scroll.

  A components manifest that is served but will not parse reports that, rather than the hint to enable the manifest feature. The server answered, so the feature is on, and the cause now reaches the console instead of nowhere.

- 8cc7bf0: Warning and error text follows the theme. It used the palette's text-tone colors, which hold one value for both themes, so a struck manifest id in a `docs-link-dangling` finding sat at 1.64:1 on a dark Docs page and the mark beside it at 2.83:1. Both take the semantic foreground scale now, the one Storybook's own badges use, and the struck id takes the tint that goes with it rather than the Docs page's code background.
- 99542b3: A report reads as one surface. Its sections were separated by a rule each, which drew three boxes inside the box the panel and the Docs block already draw. The headings carry the division instead, on the space between sections alone.
- 6d1b785: The Docs block now opens with a section heading rather than a caption bar inside the box, so it reads as part of the page. It is the Docs page's own heading component, so it carries the same copy-the-URL control every other heading there has, and it holds `id="oversight"` for a fixed `#oversight` anchor on any component's Docs page. Arriving on that anchor does not scroll the page, which is true of every anchor on a Docs page.
- 8dd7498: The panel's nothing-to-show states now use Storybook's own `EmptyTabContent`, so an empty Oversight tab reads like every other empty tab in the addons panel. The Docs block keeps its inline message, which suits the page it sits under.
- 4ed2892: A finding names the props it is about on both surfaces. The panel and the Docs block said how many props were undocumented while the props table below said which were, so reading one meant crossing it against the other. The CLI has always named them.

  The hint opens below its trigger. The Hint column is the last one and its heading sits directly over the first row's lightbulb, so the note covered the word naming what it was.

  `unknown-ignore-rule` says "Nothing is exempted by it" for a single token, which read as a typo inside the message reporting someone else's typo.

- c8fc29a: The props table stands without a heading over it. Its first column is headed `Prop`, which said the same thing twice. The heading stays on the two cases that have no table to say it: a component with no props extracted, and a manifest whose prop payload was not recognized.
- f14ac96: The Props section lists every prop in a table, in the treatment the Controls panel gives its own: a muted heading over each column, a rule between rows, and no cell borders or striping on either surface. Each row says whether the prop is required, in a word, and whether it is documented, as a tick or a cross carrying its own label rather than a glyph and a color alone.
- 0386b24: A component with no description reads _None_, in italics, and stops. It named the file the component sits in, which the finding below it already answers with what to do. A clean component reads `no findings` 👏 and stops too.
- 41cff01: A manifest whose prop payload the rules cannot read says "The prop rules did not run", rather than describing our own state in our own word for the data.
- 8a9a8a1: A report opens with the component's description, then its findings, then its props. The findings used to come first, which asked the reader to judge what was wrong with a component before seeing what it says it is.
- df251d6: `@deprecated` in a job-summary message renders as text. Escaping it as an entity did not work: `&#64;deprecated` decodes before GitHub's autolinker runs, so it still linked to an account of that name. Mention-shaped and reference-shaped tokens go in as code spans, which the autolinker leaves alone.

  Every run prints `oversight-lint <version>` on stderr. `--format github` prints only workflow commands and `--format json` only JSON, so a CI log had no way to say which version produced it, and confirming a release meant inferring it from behavior.

  `props-unrecorded`'s hint names the escape hatch. The manifest cannot tell a component whose prop was dropped from one that takes none, so the rule fires on both, and the hint told the reader holding the false positive to document a prop that does not exist without mentioning `@oversightIgnore props-unrecorded`.

  `unknown-ignore-rule`'s hint no longer says "the token" under a message naming several. A hint is one string per rule, so it reads number-neutral instead.

- f96e071: The Docs container passes the theme it is given through to Storybook's own container, instead of dropping it and reverting every Docs page to light. Only one Oversight block per page claims the `#oversight` anchor. A `docs-link-dangling` finding no longer truncates a manifest id that is a prefix of another id it names. The `loading` state renders like every other nothing-to-show state instead of shifting the panel's layout mid-load.
- 396b740: Every row in a report's tables says what it is about. The prop name and the rule name were plain cells, so a screen reader reading the Documented column announced the column and the verdict and never which prop, and a finding's message and hint said as little. Both are row headings now, in the same treatment the cells beside them take.

  The tick and the cross name the prop with it: `children is documented` where they read `documented`, which only repeated the column heading announced right before them.

- 903a80c: A findings row leads with its rule, then the severity. The rule already headed the row, so it now sits where a row heading belongs, as the prop name does in the table below it.

  The mark beside a struck manifest id is separated from the id by a space. Read aloud they were adjacent, so `data-display-ghost--docs` and the mark's `not in the manifest` ran together as one word. The description already spaced them this way.

- 1752dd9: Each section label in a report is a heading. `Description`, `Manifest`, `Props` and `Extraction` were bold text and nothing more, so heading navigation skipped the whole report on both surfaces.

  They also take the size of the section they sit in. The Docs page sizes every div it does not recognize at 16px, the same rule that was already answered for spans, so a label read a size larger there than on the panel.

- 8a9e806: Spans in the report take the size of what they sit in on a Docs page. The page sizes every span it does not recognize at 16px, so the clean state's emoji rendered larger than the line it sits on.

## 0.4.0-beta.2

### Patch Changes

- df251d6: `@deprecated` in a job-summary message renders as text. Escaping it as an entity did not work: `&#64;deprecated` decodes before GitHub's autolinker runs, so it still linked to an account of that name. Mention-shaped and reference-shaped tokens go in as code spans, which the autolinker leaves alone.

  Every run prints `oversight-lint <version>` on stderr. `--format github` prints only workflow commands and `--format json` only JSON, so a CI log had no way to say which version produced it, and confirming a release meant inferring it from behavior.

  `props-unrecorded`'s hint names the escape hatch. The manifest cannot tell a component whose prop was dropped from one that takes none, so the rule fires on both, and the hint told the reader holding the false positive to document a prop that does not exist without mentioning `@oversightIgnore props-unrecorded`.

  `unknown-ignore-rule`'s hint no longer says "the token" under a message naming several. A hint is one string per rule, so it reads number-neutral instead.

## 0.4.0-beta.1

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

## 0.4.0-beta.0

### Minor Changes

- 63d3fb4: One word per thing. The two surfaces are the addons panel and the Docs block, which the addon called the manager panel and the Docs-page block in places. A rule dictates a finding, whose parts are a severity, a rule name, a message and a hint. Finding is the only word for it now: the type was `Diagnostic`, the CLI tally said "problems", and prose said "issues". `oversight-core` is the rules engine.

  The CLI's tally line reads `✖ 5 findings (2 errors, 2 warnings, 1 info)` where it read `5 problems`. Anything matching on that word needs updating.

  The addon README heading is now `Optional: enable the Docs block`, so `#optional-enable-the-docs-page-block` no longer resolves.

### Patch Changes

- 07b4225: Everything a report says with a glyph says it in words too. A dangling `?path=` link in a description was struck through and marked with a warning sign that carried no label, so the mark meant nothing to a screen reader, while the same mark on the ids in a finding message did carry one. Both go through one component now. The tab's count badge read as "Oversight 2"; it reads as "Oversight 2 findings".
- a46a9ec: Section headings follow the theme on both surfaces. They set no color of their own, and the section painting the background behind them set none either, so they fell back to the browser's black: legible on a light page, and all but invisible in the Docs block on a dark one.
- 770ac85: A `docs-link-dangling` finding sets each manifest id it names as code, struck through in the same negative as the dead links in the description, with a mark carrying the reason for anyone who cannot see the strikethrough.
- 3db6ac9: The Docs block renders a component's description the way the panel does, as the prose itself. It showed a "Documented" verdict instead, on the reasoning that the Docs page prints the description higher up. That copy is the plain one: a `docs-link-dangling` finding strikes each dead `?path=` link where it appears in the description, and on this surface that marking had nowhere to land.
- 81e40b8: A `?path=` redirect in a component description is a link on the Docs block, not plain text. The block passed no link component, and the renderer falls back to the bare label when it has none, so the same redirect navigated from the panel and did nothing on a Docs page. The block links by URL: the manager's version SPA-navigates through `api.selectStory`, which is manager-api and unreachable from the preview iframe the block renders in.
- b959c99: Every finding carries the one-line hint for its rule, on a new `hint` field, distilled from `docs/troubleshooting.md`. It lives with the rules rather than in a renderer, so the panel and the Docs block give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect. The field is `hint` rather than `fix` because ESLint's `fix` is a machine-applicable edit that `--fix` applies, and this is a sentence to read.

  `oversight-lint` prints it too: a dimmed `hint:` line under each finding, the `hint` field in `--format json`, the second line of each `--format github` annotation, and the Message column of the Actions step summary.

  In the panel and the Docs block the findings read as a table: rule, severity, message, and a hint the last column reveals from a lightbulb, on pointer or on keyboard focus. The lightbulb names itself with the hint text, so the fix is read out whether or not it is opened. Its columns name it, so it stands without a heading, the way the props table does. Both tables in a report share one treatment and one text size, and each scrolls inside its own box rather than spilling out of the section on a narrow panel.

  `component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.

- 3c77733: A link in a description that names its own origin is left alone on the Docs block. It was rebased onto the Storybook root like a `?path=` redirect, so `[MDN](https://developer.mozilla.org/...)` resolved to `<storybook-origin>/https://developer.mozilla.org/...` and took the whole tab there. Relative targets still rebase, including the `?path=` forms carrying `&args=` or a `#hash`, which resolve against `iframe.html` and load the preview frame as the page if left alone. Absolute targets carry `rel="noopener noreferrer"`, so a private Storybook host stays out of the Referer sent to a cited site.

  Each table in a report is a named region with a tab stop. Nothing inside them takes focus, so a table with more columns than room was one a keyboard could neither reach nor scroll.

  A components manifest that is served but will not parse reports that, rather than the hint to enable the manifest feature. The server answered, so the feature is on, and the cause now reaches the console instead of nowhere.

- 8cc7bf0: Warning and error text follows the theme. It used the palette's text-tone colors, which hold one value for both themes, so a struck manifest id in a `docs-link-dangling` finding sat at 1.64:1 on a dark Docs page and the mark beside it at 2.83:1. Both take the semantic foreground scale now, the one Storybook's own badges use, and the struck id takes the tint that goes with it rather than the Docs page's code background.
- 99542b3: A report reads as one surface. Its sections were separated by a rule each, which drew three boxes inside the box the panel and the Docs block already draw. The headings carry the division instead, on the space between sections alone.
- 6d1b785: The Docs block now opens with a section heading rather than a caption bar inside the box, so it reads as part of the page. It is the Docs page's own heading component, so it carries the same copy-the-URL control every other heading there has, and it holds `id="oversight"` for a fixed `#oversight` anchor on any component's Docs page. Arriving on that anchor does not scroll the page, which is true of every anchor on a Docs page.
- 8dd7498: The panel's nothing-to-show states now use Storybook's own `EmptyTabContent`, so an empty Oversight tab reads like every other empty tab in the addons panel. The Docs block keeps its inline message, which suits the page it sits under.
- c8fc29a: The props table stands without a heading over it. Its first column is headed `Prop`, which said the same thing twice. The heading stays on the two cases that have no table to say it: a component with no props extracted, and a manifest whose prop payload was not recognized.
- f14ac96: The Props section lists every prop in a table, in the treatment the Controls panel gives its own: a muted heading over each column, a rule between rows, and no cell borders or striping on either surface. Each row says whether the prop is required, in a word, and whether it is documented, as a tick or a cross carrying its own label rather than a glyph and a color alone.
- 0386b24: A component with no description reads _None_, in italics, and stops. It named the file the component sits in, which the finding below it already answers with what to do. A clean component reads `no findings` 👏 and stops too.
- 41cff01: A manifest whose prop payload the rules cannot read says "The prop rules did not run", rather than describing our own state in our own word for the data.
- 8a9a8a1: A report opens with the component's description, then its findings, then its props. The findings used to come first, which asked the reader to judge what was wrong with a component before seeing what it says it is.
- f96e071: The Docs container passes the theme it is given through to Storybook's own container, instead of dropping it and reverting every Docs page to light. Only one Oversight block per page claims the `#oversight` anchor. A `docs-link-dangling` finding no longer truncates a manifest id that is a prefix of another id it names. The `loading` state renders like every other nothing-to-show state instead of shifting the panel's layout mid-load.
- 396b740: Every row in a report's tables says what it is about. The prop name and the rule name were plain cells, so a screen reader reading the Documented column announced the column and the verdict and never which prop, and a finding's message and hint said as little. Both are row headings now, in the same treatment the cells beside them take.

  The tick and the cross name the prop with it: `children is documented` where they read `documented`, which only repeated the column heading announced right before them.

- 903a80c: A findings row leads with its rule, then the severity. The rule already headed the row, so it now sits where a row heading belongs, as the prop name does in the table below it.

  The mark beside a struck manifest id is separated from the id by a space. Read aloud they were adjacent, so `data-display-ghost--docs` and the mark's `not in the manifest` ran together as one word. The description already spaced them this way.

- 1752dd9: Each section label in a report is a heading. `Description`, `Manifest`, `Props` and `Extraction` were bold text and nothing more, so heading navigation skipped the whole report on both surfaces.

  They also take the size of the section they sit in. The Docs page sizes every div it does not recognize at 16px, the same rule that was already answered for spans, so a label read a size larger there than on the panel.

- 8a9e806: Spans in the report take the size of what they sit in on a Docs page. The page sizes every span it does not recognize at 16px, so the clean state's emoji rendered larger than the line it sits on.

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
