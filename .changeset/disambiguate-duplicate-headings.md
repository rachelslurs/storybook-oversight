---
'oversight-lint': patch
---

Distinguish the group heading for manifest entries that share a component name. Findings group per entry, so a component with several stories files used to render repeated identical headings: primer-react printed three byte-identical `AnchoredOverlay` blocks, and 92 of its 236 headings were adjacent duplicates. When another entry in the manifest carries the same name, the heading and the Actions step summary's Component cell now append the entry's stories file, as in `Features (src/Dialog/Dialog.features.stories.tsx)`; the entry id stands in when a colliding entry records no stories file. Unique names keep the bare heading. Labelling only: the grouping, the counts, and `--json` are unchanged.
