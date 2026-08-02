---
'storybook-addon-oversight': patch
---

Every row in a report's tables says what it is about. The prop name and the rule name were plain cells, so a screen reader reading the Documented column announced the column and the verdict and never which prop, and a finding's message and hint said as little. Both are row headings now, in the same treatment the cells beside them take.

The tick and the cross name the prop with it: `children is documented` where they read `documented`, which only repeated the column heading announced right before them.
