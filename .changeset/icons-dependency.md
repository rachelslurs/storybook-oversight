---
'storybook-addon-oversight': patch
---

`@storybook/icons` is a runtime dependency, the addon's first. The tick and cross in the props table come from it, and the preview bundle externalizes `@storybook/*` without the manager's globals, so the Docs block would otherwise rely on a consumer's install hoisting it.
