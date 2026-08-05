---
'storybook-addon-oversight': minor
---

The panel and the Docs block now read the manifest wherever it lives. A v:1 ref-based manifest (what `experimentalDocgenServer` builds write) resolves its per-component refs over fetch, and in dev under that flag, where the manifest route 404s on purpose, both surfaces read the component index from Storybook's in-runtime service API instead. Projects without the flag keep the exact fetch path they had.
