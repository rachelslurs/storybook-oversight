---
'oversight-lint': patch
---

The missing-manifest message now states which Storybook versions can produce a
components manifest: 10.3 and later build one as `componentsManifest`, 10.1 and
10.2 only behind the `experimentalComponentsManifest` flag, and below 10.1 no
configuration produces one. It previously advised enabling `@storybook/addon-mcp`,
which cannot emit a manifest below 10.3. The CLI README now states the supported
range, and records that `docs-link-dangling` validates the description-redirect
convention and stays silent in repos that do not use it.
