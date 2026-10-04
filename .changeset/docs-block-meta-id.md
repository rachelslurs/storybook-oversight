---
'storybook-addon-oversight': patch
---

The `<Oversight />` Docs block now finds the manifest entry for a component whose stories meta sets an `id` with uppercase letters or punctuation, such as `id: "Button"`. It showed "No manifest entry for this component." on that component's Docs page while the addon panel showed its findings. The block now sanitizes the meta `id` the same way Storybook does when it builds story ids. Fixes #121.
