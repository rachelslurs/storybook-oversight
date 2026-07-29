---
'oversight-lint': patch
'storybook-addon-oversight': patch
---

Clamp the manifest error embedded in `docgen-missing` and `story-extraction-error` finding messages to its first line. A multi-line error (a stack trace, an embedded source file) no longer leaks into the panel or the CLI output through the finding text.
