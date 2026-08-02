---
'storybook-addon-oversight': patch
---

The Docs block now opens with a section heading rather than a caption bar inside the box, so it reads as part of the page. It is the Docs page's own heading component, so it carries the same copy-the-URL control every other heading there has, and it holds `id="oversight"` for a fixed `#oversight` anchor on any component's Docs page. Arriving on that anchor does not scroll the page, which is true of every anchor on a Docs page.
