---
'storybook-addon-oversight': minor
'oversight-lint': minor
---

Read the ref-based (`v: 1`) components manifest that `experimentalDocgenServer`
emits. Its entries defer their payloads to per-component files under
`services/core/`, and the normalizer threw on that shape, so `oversight-lint`
refused the manifest at exit 2 and the panel showed a parse error. Refs now
resolve relative to the manifest, and findings come out the same as for an inline
manifest: on the same six components built both ways, the diagnostics are
identical.

Format detection branches on the manifest's `v` field. `meta.docgen` cannot do it:
`experimentalDocgenServer` and `experimentalReactComponentMeta` both report
`react-component-meta` while producing different shapes. A version this build does
not know is refused by version number instead of reaching the normalizer.

New rule `manifest-shape-unrecognized` (warning) reports a part of the manifest
that did not arrive in the expected shape: a `$ref` that did not resolve, or a
prop payload missing the fields the prop rules read. In the second case
`prop-descriptions-missing` and `required-prop-undocumented` do not run, because a
build where those fields moved would otherwise report every prop in the library as
undocumented. The check asks whether the field names still exist anywhere in the
manifest, so a prop with an empty description still counts as undocumented and is
still reported.

A v:1 manifest no longer leads its CLI output with the raw normalizer error. That
message is kept for shapes nothing can describe, where it is the only information
available.
