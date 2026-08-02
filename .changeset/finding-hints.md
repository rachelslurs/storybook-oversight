---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Every finding carries the one-line hint for its rule, on a new `hint` field, distilled from `docs/troubleshooting.md`. It lives with the rules, so the panel, the Docs block and the CLI all give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect. The field is `hint` rather than `fix` because ESLint's `fix` is a machine-applicable edit that `--fix` applies, and this is a sentence to read.

In the panel and the Docs block the findings read as a table: severity, rule, message, and hint. Both tables in a report share one treatment, and each scrolls inside its own box rather than spilling out of the section on a narrow panel.

`component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.
