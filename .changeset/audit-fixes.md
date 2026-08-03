---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Crossing `--max-warnings` says so. The run failed with output identical to a passing one, so a CI job stopped on the ceiling named nothing that had stopped it.

The GitHub step summary renders a message as text. It is markdown rendered against a repository, so `@deprecated` in a `deprecated-tag` message linked to a GitHub account of that name, and `#12` would have linked to an issue.

`docgen-missing`'s hint names the causes in the order they are worth checking. It named `typescript.reactDocgen` alone, which told a project that had already set it correctly to set it again, under a message about something else. A story whose `meta` names no component is documented in `docs/troubleshooting.md` as the fifth cause, the one whose fix is in the stories file.
