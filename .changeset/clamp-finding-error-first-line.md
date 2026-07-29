---
'oversight-lint': patch
'storybook-addon-oversight': patch
---

Clamp the manifest error embedded in `docgen-missing` and `story-extraction-error` finding messages to its first non-empty line so a multi-line error (a stack trace, an embedded source file) no longer leaks into the panel or the CLI through the finding text. The full error moves to a new `error` field on those diagnostics, included in `--format json` output.
