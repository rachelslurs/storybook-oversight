---
'storybook-addon-oversight': patch
---

A `?path=` redirect in a component description is a link on the Docs block, not plain text. The block passed no link component, and the renderer falls back to the bare label when it has none, so the same redirect navigated from the panel and did nothing on a Docs page. The block links by URL: the manager's version SPA-navigates through `api.selectStory`, which is manager-api and unreachable from the preview iframe the block renders in.
