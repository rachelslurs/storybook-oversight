---
'oversight-lint': minor
'storybook-addon-oversight': minor
---

`extractor-drift` now runs only when an expectation is stated via `--expected-extractor`, the config file, or the addon config. The rule previously compared against a built-in `react-docgen-typescript` default and warned on projects that never configured an extractor. A manifest that records no `meta.docgen` (or ships `meta: null`) now normalizes to an unknown extractor; with a stated expectation the rule reports the unrecorded extractor instead of reading the absence as a match.
