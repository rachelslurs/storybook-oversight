---
'storybook-addon-oversight': minor
'oversight-lint': minor
---

Read a component's description from the manifest entry only, never from the docgen payload.

`component-description-missing` used to stay silent for components an agent is shown no description for. The rules read `entry.description` and fell back to the payload's when it was empty, while `@storybook/mcp` reads the entry alone and renders an empty one as nothing.

The two fields are not independent copies. Storybook builds the entry's description out of the payload's, keeping the prose and moving every JSDoc tag into `jsDocTags`, so the payload only ever holds the same prose plus the tag lines. Falling back to it restored the tags. Where a component was documented by tags alone, the entry's description came out empty and the fallback handed the rule a bare `@deprecated` or a block of `@param`, which it took for prose.

Reported findings change. Any component whose description reaches the manifest only through the payload now reports `component-description-missing`, and `docs-link-dangling` scans the entry's description alone, which is the copy `get-documentation` renders. Over the primer-react manifest captured on 2026-07-29 (Storybook 10.5.3, `react-docgen`, `v: 0`, 245 entries), measured on 2026-08-08, that is eight more components: 190 findings to 198.
