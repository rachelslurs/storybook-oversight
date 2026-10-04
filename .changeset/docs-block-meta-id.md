---
'storybook-addon-oversight': patch
---

The `<Oversight />` Docs block now finds the manifest entry for a component whose stories meta sets an `id` that Storybook rewrites when it builds story ids, such as `id: "Button"` or `id: "Primary Button"`. It showed "No manifest entry for this component." on that component's Docs page while the addon panel showed its findings. The block now sanitizes the meta `id` the same way Storybook does. Fixes #121.
