# oversight-core

## 0.0.2

### Patch Changes

- 88e8873: A JSDoc tag whose value is `null` now reads as a bare tag rather than the token `"null"`. `@oversightIgnore: null` exempted nothing and reported `null` as an unknown rule, and `@deprecated: null` rendered as `marked @deprecated: null`.

  Three strings lost an em dash. The `oversight` help header now opens `oversight: lint a Storybook MCP components manifest`, `component-description-missing` reads `...has no component description, so the MCP and Docs tab describe it as nothing.`, and `unknown-ignore-rule` ends `...: <rules>. Nothing is exempted by them.` Anything matching on those message strings needs updating.

  Docs only: Prettier reflows markdown to one line per paragraph, both READMEs link `oversight-lint-action`, and the repo's prose drops its em dashes.

- f2c1a2f: The `extractor-drift` mismatch message states which extractor the manifest records and which one the project expects, and stops there. Earlier releases appended "prop docs may be incomplete", an outcome the rule cannot establish, since one message serves every pairing of recorded and expected extractor in both directions. Measured on 245 components built both ways, react-component-meta extracts 1539 props against react-docgen's 877, and 693 documented against 379, so the warning told a migrating project the opposite of what happens.

  Both sides of the comparison are trimmed. An `expectedExtractor` or a `meta.docgen` carrying a trailing newline, which is how a value read from a file or an unquoted shell variable arrives, passed the emptiness check and then compared unequal against a manifest recording the same extractor, naming both sides identically in the warning.

  Projects on `features.experimentalDocgenServer` should state `react-component-meta`, as with `features.experimentalReactComponentMeta`. Both flags pick the extractor themselves and leave `typescript.reactDocgen` unread.

## 0.0.1

### Patch Changes

- 5baf09f: `summarizeError` now skips a message's leading `File: <path>` location line and a bare `Error:` label when picking the line it appends, and `firstNonEmptyLine` treats a lone carriage return as a line break. In the audited manifests those prelude lines vary per entry while the diagnosis follows them, so the CLI's collapsed mass-failure rows fragmented one diagnosis across per-path signatures or pooled it into a "distinct errors" row with the diagnosis absent from the output. Collapse rows, finding messages, and the addon panel's extraction and story failure lines now lead with the diagnosis; the full error text still rides on the JSON `error` field.
