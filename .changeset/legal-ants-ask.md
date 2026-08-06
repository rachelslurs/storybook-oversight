---
'storybook-addon-oversight': patch
---

Warn at startup when `@storybook/addon-docs` resolves to more than one copy. Two copies render every Docs page blank, because each carries its own theme context and the components this addon's block renders read an undefined theme and throw during render. The errors that produces are `TypeError: Cannot read properties of undefined` from inside addon-docs, naming neither this addon nor the duplicate, so the symptom reads like a Storybook version incompatibility. That misreading is what put a wrong peer range in `0.6.0`.

The preset now compares what this package resolves against what the project resolves and, when they differ, prints both paths, both versions and how to fix it. It warns rather than throwing: a diagnostic should not be the reason a Storybook fails to start.
