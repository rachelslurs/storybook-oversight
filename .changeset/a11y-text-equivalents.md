---
'storybook-addon-oversight': patch
---

Everything a report says with a glyph says it in words too. A dangling `?path=` link in a description was struck through and marked with a warning sign that carried no label, so the mark meant nothing to a screen reader, while the same mark on the ids in a finding message did carry one. Both go through one component now. The tab's count badge read as "Oversight 2"; it reads as "Oversight 2 findings".
