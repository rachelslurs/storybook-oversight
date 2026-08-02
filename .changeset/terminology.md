---
'storybook-addon-oversight': patch
---

One word per thing. The two surfaces are the addons panel and the Docs block, which the addon called the manager panel and the Docs-page block in places. A rule fires a finding, whose parts are a severity, a rule name, a message and a fix; "diagnostics" and "issues" were standing in for findings in prose. `oversight-core` stays the diagnostic engine, which is the thing that produces them.

The addon README heading is now `Optional: enable the Docs block`, so `#optional-enable-the-docs-page-block` no longer resolves.
