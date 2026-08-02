---
'storybook-addon-oversight': patch
---

Warning and error text follows the theme. It used the palette's text-tone colors, which hold one value for both themes, so a struck manifest id in a `docs-link-dangling` finding sat at 1.64:1 on a dark Docs page and the mark beside it at 2.83:1. Both take the semantic foreground scale now, the one Storybook's own badges use, and the struck id takes the tint that goes with it rather than the Docs page's code background.
