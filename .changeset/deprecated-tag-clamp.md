---
'oversight-lint': patch
'storybook-addon-oversight': patch
---

Clamp the `@deprecated` value in the `deprecated-tag` finding message to its first non-empty line. A multi-line note used to split the CLI step-summary table row, and a whitespace-only body rendered as `X is marked @deprecated:  .`. That body now reads as a bare tag, and a note ending in a period no longer renders a doubled period. When the clamp drops continuation lines, the finding's `error` field carries the full note, included in `--format json`. Component names are also clamped to their first non-empty line, so a newline in a manifest name cannot split any finding message.
