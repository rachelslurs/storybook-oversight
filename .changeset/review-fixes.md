---
'storybook-addon-oversight': patch
---

The Docs container passes the theme it is given through to Storybook's own container, instead of dropping it and reverting every Docs page to light. Only one Oversight block per page claims the `#oversight` anchor. A `docs-link-dangling` finding no longer truncates a manifest id that is a prefix of another id it names. The source-path chip uses Storybook's own inline-code styling rather than a copy of it, and the `loading` state renders like every other nothing-to-show state instead of shifting the panel's layout mid-load.
