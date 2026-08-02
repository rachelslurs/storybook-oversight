---
'storybook-addon-oversight': patch
---

A link in a description that names its own origin is left alone on the Docs block. It was rebased onto the Storybook root like a `?path=` redirect, so `[MDN](https://developer.mozilla.org/...)` resolved to `<storybook-origin>/https://developer.mozilla.org/...` and took the whole tab there. Relative targets still rebase, including the `?path=` forms carrying `&args=` or a `#hash`, which resolve against `iframe.html` and load the preview frame as the page if left alone. Absolute targets carry `rel="noopener noreferrer"`, so a private Storybook host stays out of the Referer sent to a cited site.

Each table in a report is a named region with a tab stop. Nothing inside them takes focus, so a table with more columns than room was one a keyboard could neither reach nor scroll.

A components manifest that is served but will not parse reports that, rather than the hint to enable the manifest feature. The server answered, so the feature is on, and the cause now reaches the console instead of nowhere.
