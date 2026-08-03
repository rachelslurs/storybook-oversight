---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Every finding carries the one-line hint for its rule, on a new `hint` field, distilled from `docs/troubleshooting.md`. It lives with the rules rather than in a renderer, so the panel and the Docs block give the same answer, and a rule added to the union has to say what to do about itself or fail to compile. `deprecated-tag` has none: it reports a fact rather than a defect. The field is `hint` rather than `fix` because ESLint's `fix` is a machine-applicable edit that `--fix` applies, and this is a sentence to read.

`oversight-lint` prints it too: a dimmed `hint:` line under each finding, the `hint` field in `--format json`, the second line of each `--format github` annotation, and the Message column of the Actions step summary.

In the panel and the Docs block the findings read as a table: rule, severity, message, and a hint the last column reveals from a lightbulb. The lightbulb names itself with the hint text, so the fix is read out whether or not it is opened. Its columns name it, so it stands without a heading, the way the props table does. Both tables in a report share one treatment and one text size, and each scrolls inside its own box rather than spilling out of the section on a narrow panel.

`component-description-missing` reads `<name> has no description for the MCP or the Docs page to show.` Anything matching on that message string needs updating.
