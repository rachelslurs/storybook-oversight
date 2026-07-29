---
'oversight-lint': patch
'storybook-addon-oversight': patch
---

Clamp the `@deprecated` value in the `deprecated-tag` finding message to its first non-empty line. A multi-line note used to split the CLI step-summary table row, and a whitespace-only body rendered as `X is marked @deprecated:  .`. That body now reads as a bare tag. The full tag value is still available on the report's `tags`.
