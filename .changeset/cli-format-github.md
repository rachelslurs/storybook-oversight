---
'oversight-lint': minor
---

Add `--format <text|json|github>`. The new `github` format emits GitHub Actions workflow-command annotations (`::error`/`::warning`/`::notice`, titled `oversight/<rule>` and anchored to the stories file) so findings surface as annotations on the run and the pull request's Checks tab, and inline on the Files-changed tab when the anchored line is in the diff. `--json` now aliases `--format json`; findings have no line numbers, so annotations default to the top of the stories file, capped at GitHub's ~10-per-type-per-step limit.
