---
'oversight-lint': patch
---

Group collapsed mass-failure rows by the error's name instead of the composed one-line summary. The composed summary appends the message's first line, which for extraction failures is each entry's own file path, so one diagnosis fragmented across rows or pooled into a "distinct errors" row with the diagnosis absent from the output. A row now shows the clamped error name and appends the message's first line only when every finding in the group shares it.
