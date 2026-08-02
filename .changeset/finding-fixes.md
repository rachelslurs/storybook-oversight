---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Every finding carries the one-line fix for its rule, on a new `fix` field, distilled from `docs/troubleshooting.md`. It lives with the rules, so the panel, the Docs block and the CLI all give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect.

In the panel and the Docs block the findings read as a table: severity, rule, then what happened with the fix beneath it. Both tables in a report share one treatment.

`component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.
