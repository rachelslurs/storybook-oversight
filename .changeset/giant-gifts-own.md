---
'storybook-addon-oversight': minor
---

Narrow the Storybook peer range to `^10.5.0`. It claimed `^10.3.0`, and on 10.3 and 10.4 the Docs block throws during render and takes the whole Docs page down with it, so the page shows nothing at all. Nothing about that failure points at this addon, and the range was telling those consumers they were supported. A new CI job pins the declared floor and renders a real Docs page against it, which is what found this.
