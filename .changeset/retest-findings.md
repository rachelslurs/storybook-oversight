---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

`@deprecated` in a job-summary message renders as text. Escaping it as an entity did not work: `&#64;deprecated` decodes before GitHub's autolinker runs, so it still linked to an account of that name. Mention-shaped and reference-shaped tokens go in as code spans, which the autolinker leaves alone.

Every run prints `oversight-lint <version>` on stderr. `--format github` prints only workflow commands and `--format json` only JSON, so a CI log had no way to say which version produced it, and confirming a release meant inferring it from behavior.

`props-unrecorded`'s hint names the escape hatch. The manifest cannot tell a component whose prop was dropped from one that takes none, so the rule fires on both, and the hint told the reader holding the false positive to document a prop that does not exist without mentioning `@oversightIgnore props-unrecorded`.

`unknown-ignore-rule`'s hint no longer says "the token" under a message naming several. A hint is one string per rule, so it reads number-neutral instead.
