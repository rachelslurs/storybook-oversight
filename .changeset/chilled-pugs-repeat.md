---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Read the docgen payload Storybook's MCP serves, when an entry carries more than one.

An entry can in principle record `reactDocgen` and `reactDocgenTypescript` together. The rules read the second where `@storybook/mcp` reads the first, so the two would disagree about a component's description and props, and every prop finding would describe a payload no agent receives. The order now matches the server's.

No manifest measured carries both keys: not the demo build, not the fixtures, and not the eight real design-system manifests behind the audit. This is a guard against a build that starts emitting both rather than a fix for one that does, so no reported finding changes.
