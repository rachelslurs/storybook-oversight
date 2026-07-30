---
'storybook-addon-oversight': minor
'oversight-lint': minor
---

`oversight-lint` reads the ref-based (`v: 1`) components manifest that
`experimentalDocgenServer` emits. Its entries defer their payloads to
per-component files under `services/core/`, and the normalizer threw on that
shape, so the manifest was refused at exit 2. Refs now resolve relative to the
manifest: on the same six components built inline and behind refs, the
diagnostics are identical.

The panel and the docs block still read the inline manifest only. That flag
disables the dev manifest by design, so giving those surfaces a data source is
separate work. What they gain here is the shared diagnostic core: the new rule
below, and prop coverage that stays quiet when the payload behind it is not
trustworthy.

Format detection branches on the manifest's `v` field. `meta.docgen` cannot do it:
`experimentalDocgenServer` and `experimentalReactComponentMeta` both report
`react-component-meta` while producing different shapes. A version this build does
not know is refused by version number instead of reaching the normalizer.

New rule `manifest-shape-unrecognized` (warning) reports a part of the manifest
that did not arrive in the expected shape: a `$ref` that did not resolve, or a
prop payload missing the fields the prop rules read. In the second case
`prop-descriptions-missing` and `required-prop-undocumented` do not run, and the
panel says prop coverage is unavailable rather than showing a figure drawn from
the same fields. A build where those fields moved would otherwise report every
prop in the library as undocumented, or stop gating CI without saying so. Both
fields are checked by type across the whole manifest, so a prop carrying an empty
description still counts as undocumented and is still reported.

Ref targets are confined to the build output. The ref grammar refuses absolute
paths, URL schemes, and any path climbing more than one level, and the filesystem
loader resolves symlinks before reading so a link cannot carry a legal-looking
path outside that tree, or hang the run on a device file.

A v:1 manifest no longer leads its CLI output with the raw normalizer error. That
message is kept for shapes nothing can describe, where it is the only information
available.
