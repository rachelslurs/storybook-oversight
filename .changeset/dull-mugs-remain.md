---
'storybook-addon-oversight': minor
---

Narrow the Storybook peer range to `^10.5.0`. It claimed `^10.3.0`, and on 10.3 and 10.4 the Docs block throws while rendering and takes the whole Docs page down with it, so the page shows nothing at all rather than showing without the block. Nothing about that failure points at this addon.

The range had been wrong since it was first written: the commit that introduced `^10.3.0` fails the same way on 10.3.0, so no version of this addon has ever worked there. Narrowing the range is what is true today, not a change in support. Whether 10.3 and 10.4 can be made to work is #93.
