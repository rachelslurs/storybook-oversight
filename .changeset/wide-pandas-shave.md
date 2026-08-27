---
'oversight-lint': patch
---

Stylish output wraps to the terminal width. The terminal used to break a long message at column 0, which left the severity and rule columns unfindable a few findings down the page; a continuation now indents to the message column. Output written to a pipe or a file stays unwrapped.

The severity column is padded once for the whole report rather than once per section. A section holding only errors started its rule column three columns left of a section holding a warning.

`--format json`, `--format github` and the Actions job summary are unchanged.
