---
'storybook-addon-oversight': minor
'oversight-lint': minor
---

Read a component's description from the manifest entry only, never from the docgen payload.

`component-description-missing` used to stay silent for components an agent is shown no description for. The rules read `entry.description` and fell back to the payload's when it was empty, while `@storybook/mcp` reads the entry alone and renders an empty one as nothing.

The entry's description is the field the server renders, and Storybook fills it from the story-meta JSDoc when there is one and from the payload description otherwise, in both cases keeping the prose and moving every JSDoc tag into `jsDocTags`. So the fallback read a field no reader is shown, and where the payload was the source it read that payload's stripped tags back in. Where a component was documented by tags alone the entry's description came out empty, and the fallback handed the rule a bare `@deprecated` or a block of `@param`, which it took for prose.

A whitespace-only description now reports too. Storybook trims before it writes, so this reaches manifests from other producers and `v: 1` leaves, which ref resolution lifts untouched.

Reported findings change. Any component whose description reaches the manifest only through the payload now reports `component-description-missing`, and `docs-link-dangling` scans the entry's description alone, which is the copy `get-documentation` renders. Over the primer-react manifest captured on 2026-07-29 (Storybook 10.5.3, `react-docgen`, `v: 0`, 245 entries), measured on 2026-08-08, that is eight more components: 190 findings to 198.

The rule's hint changes with it, from "Add a JSDoc block above the component" to "Add prose to the component JSDoc block, outside any tag." The components this newly reports have a JSDoc block already; what they lack is prose outside the tags.
