---
'storybook-addon-oversight': patch
---

Ship type declarations for the `manager` and `preset` entry points. Both resolved to JavaScript with no types, so anything reading the package's type surface saw two of its three entries as untyped. `blocks`, the entry consumers actually import, was already typed and is unchanged.
