---
'oversight-lint': patch
---

Correct what the README says `--format github` annotations anchor to. They land on the component's source file, falling back to the stories file for extraction failures and for entries that record no source. The previous text said every finding anchored to the stories file.
