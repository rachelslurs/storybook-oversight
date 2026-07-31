---
'oversight-core': patch
'oversight-lint': patch
'storybook-addon-oversight': patch
---

The `extractor-drift` mismatch message no longer appends "prop docs may be
incomplete". It states which extractor the manifest records and which one the
project expects, and stops there. The claim named an outcome the rule cannot
establish: one message serves every pairing of recorded and expected extractor in
both directions. Measured on 245 components built both ways, react-component-meta
extracts 1539 props against react-docgen's 877, and 693 documented against 379,
so the warning told a migrating project the opposite of what happens.

`expectedExtractor` under `features.experimentalDocgenServer` is now documented:
state `react-component-meta`, as with `features.experimentalReactComponentMeta`.
Both flags pick the extractor themselves and leave `typescript.reactDocgen`
unread.
