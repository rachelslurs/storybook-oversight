---
'storybook-addon-oversight': patch
---

The Docs block renders a component's description the way the panel does, as the prose itself. It showed a "Documented" verdict instead, on the reasoning that the Docs page prints the description higher up. That copy is the plain one: a `docs-link-dangling` finding strikes each dead `?path=` link where it appears in the description, and on this surface that marking had nowhere to land.
