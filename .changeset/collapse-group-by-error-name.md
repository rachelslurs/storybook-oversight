---
'oversight-core': patch
'oversight-lint': patch
'storybook-addon-oversight': patch
---

`summarizeError` now skips a message's leading `File: <path>` location line and a bare `Error:` label when picking the line it appends, and `firstNonEmptyLine` treats a lone carriage return as a line break. In the audited manifests those prelude lines vary per entry while the diagnosis follows them, so the CLI's collapsed mass-failure rows fragmented one diagnosis across per-path signatures or pooled it into a "distinct errors" row with the diagnosis absent from the output. Collapse rows, finding messages, and the addon panel's extraction and story failure lines now lead with the diagnosis; the full error text still rides on the JSON `error` field.
