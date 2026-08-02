---
'storybook-addon-oversight': patch
---

Two messages read better. A component with no description gets "None. Add JSDoc above the component in `<file>`", rather than a sentence that repeated, word for word, the consequence the finding directly below it already gives. A manifest whose prop payload the rules cannot read says "The prop rules did not run", rather than describing our own state in our own word for the data.
