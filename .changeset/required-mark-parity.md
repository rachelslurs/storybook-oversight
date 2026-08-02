---
'storybook-addon-oversight': patch
---

The asterisk after a required prop takes the args table's own treatment: mono, with a `Required` tooltip on a help cursor. It keeps the theme-adaptive negative rather than the one Storybook uses there, which holds `#FF4400` for both themes and reads at 3.45:1 on a light Docs page.

Spans in the report take the size of what they sit in on a Docs page. The page sizes every span it does not recognize at 16px, so the asterisk rendered larger than the prop name it marks, and the clean state's emoji larger than the line it sits on.
