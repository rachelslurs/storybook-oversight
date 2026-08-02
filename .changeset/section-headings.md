---
'storybook-addon-oversight': patch
---

Each section label in a report is a heading. `Description`, `Manifest`, `Props` and `Extraction` were bold text and nothing more, so heading navigation skipped the whole report on both surfaces.

They also take the size of the section they sit in. The Docs page sizes every div it does not recognize at 16px, the same rule that was already answered for spans, so a label read a size larger there than on the panel.
