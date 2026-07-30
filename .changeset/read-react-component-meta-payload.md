---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

Read the `reactComponentMeta` payload key. A manifest built with `features.experimentalReactComponentMeta` carries its docgen under that key, which the normalizer did not recognize, so every component was reported as a failed extraction. On a six-component manifest that meant six `docgen-missing` errors and a non-zero exit on a manifest that was complete. The extractor is also inferred from the key when `meta.docgen` is unrecorded.
