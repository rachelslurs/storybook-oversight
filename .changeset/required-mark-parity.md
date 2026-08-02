---
'storybook-addon-oversight': patch
---

The asterisk after a required prop reads as the one the args table puts after a prop name: same color, same mono face, same `Required` tooltip on a help cursor.

Spans in the report take the size of what they sit in on a Docs page. The page sizes every span it does not recognize at 16px, so the asterisk rendered larger than the prop name it marks, and the clean state's emoji larger than the line it sits on.
