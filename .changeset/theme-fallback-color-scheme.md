---
'storybook-addon-oversight': patch
---

The Docs block's theme fallback follows the browser's color preference instead of assuming light. It only applies when the surrounding theme context does not resolve; a themed Storybook is inherited as before.
