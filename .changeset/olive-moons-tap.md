---
'oversight-core': patch
'oversight-lint': patch
'storybook-addon-oversight': patch
---

The `extractor-drift` mismatch message states which extractor the manifest
records and which one the project expects, and stops there. Earlier releases
appended "prop docs may be incomplete", an outcome the rule cannot establish,
since one message serves every pairing of recorded and expected extractor in both
directions. Measured on 245 components built both ways, react-component-meta
extracts 1539 props against react-docgen's 877, and 693 documented against 379,
so the warning told a migrating project the opposite of what happens.

Both sides of the comparison are trimmed. An `expectedExtractor` or a
`meta.docgen` carrying a trailing newline, which is how a value read from a file
or an unquoted shell variable arrives, passed the emptiness check and then
compared unequal against a manifest recording the same extractor, naming both
sides identically in the warning.

Projects on `features.experimentalDocgenServer` should state
`react-component-meta`, as with `features.experimentalReactComponentMeta`. Both
flags pick the extractor themselves and leave `typescript.reactDocgen` unread.
