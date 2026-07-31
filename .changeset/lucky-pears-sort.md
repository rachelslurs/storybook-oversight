---
'oversight-core': patch
'oversight-lint': patch
'storybook-addon-oversight': patch
---

A JSDoc tag whose value is `null` now reads as a bare tag rather than the token `"null"`. `@oversightIgnore: null` exempted nothing and reported `null` as an unknown rule, and `@deprecated: null` rendered as `marked @deprecated: null`.

Three strings lost an em dash. The `oversight` help header now opens `oversight: lint a Storybook MCP components manifest`, `component-description-missing` reads `...has no component description, so the MCP and Docs tab describe it as nothing.`, and `unknown-ignore-rule` ends `...: <rules>. Nothing is exempted by them.` Anything matching on those message strings needs updating.

Docs only: Prettier reflows markdown to one line per paragraph, both READMEs link `oversight-lint-action`, and the repo's prose drops its em dashes.
