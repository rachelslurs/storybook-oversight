---
'storybook-addon-oversight': patch
---

Source paths drop the project-directory segment `react-docgen-typescript` prefixes them with, so a file the repo knows as `stories/Badge/Badge.tsx` is named that way rather than `my-project/stories/Badge/Badge.tsx`. The entry's own recorded path is the evidence, so a project whose sources genuinely sit under a nested directory keeps it.
