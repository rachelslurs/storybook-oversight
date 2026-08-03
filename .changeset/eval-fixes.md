---
'storybook-addon-oversight': patch
'oversight-lint': patch
---

A file that parses but is not a components manifest exits 2 instead of reporting no findings at exit 0. A job pointed at a stale path passed forever while linting nothing, and the path is a string in a config. A manifest that records no entries still exits 0.

A GitHub annotation points at the file it is about. Every rule but `story-extraction-error` reports the component's own source, and anchoring on the stories file put the annotation on a file that does not contain the problem, or outside the diff entirely.

New rule, `props-unrecorded` (warning): an entry that records no props at all, so the MCP describes the component as taking none. Extraction can drop a prop that carries no JSDoc, which makes an undocumented prop absent exactly when it is undocumented, so `prop-descriptions-missing` cannot see it. `children` typed through a spread is the common case. A component that genuinely takes no props exempts itself with `@oversightIgnore props-unrecorded`.
