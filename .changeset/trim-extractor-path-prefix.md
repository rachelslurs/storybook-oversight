---
'storybook-addon-oversight': patch
---

Source paths drop the project-directory segment `react-docgen-typescript` prefixes them with, so a file the repo knows as `stories/Badge/Badge.tsx` is named that way rather than `my-project/stories/Badge/Badge.tsx`. The segment is detected once across the whole manifest, and only where dropping it lands exactly on the stories file's own directory, so a project whose sources genuinely sit under a nested directory keeps it and a manifest never reports two different path roots in one run.
