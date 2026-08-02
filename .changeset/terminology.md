---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

One word per thing. The two surfaces are the addons panel and the Docs block, which the addon called the manager panel and the Docs-page block in places. A rule dictates a finding, whose parts are a severity, a rule name, a message and a hint. Finding is the only word for it now: the type was `Diagnostic`, the CLI tally said "problems", and prose said "issues". `oversight-core` is the rules engine.

The CLI's tally line reads `✖ 5 findings (2 errors, 2 warnings, 1 info)` where it read `5 problems`. Anything matching on that word needs updating.

The addon README heading is now `Optional: enable the Docs block`, so `#optional-enable-the-docs-page-block` no longer resolves.
