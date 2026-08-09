---
'oversight-lint': minor
---

Add `oversight agent-view <id> [manifest]`, which prints what Storybook's MCP server serves for one component or docs entry.

A finding says a component's docs are missing and nothing shows what that costs. The command prints the two surfaces an agent reads: the `get-documentation` markdown for the entry, and its whole bullet in `list-all-documentation`. An entry carrying an extraction error, an entry with no docgen payload, and an entry whose payload records no props all come back with no `## Props` section and no trace of the diagnosis, so the served text is identical for a `docgen-missing` error and a `props-unrecorded` warning.

The manifest argument resolves the chain a lint run uses, positional then config file then `storybook-static/manifests/components.json`, so the common invocation is the id alone. Findings do not reach the exit code: 0 once the text is printed, 2 when it could not be, which covers an id the manifest does not hold and a `$ref` that failed. Both served sections are fenced with tildes, sized past any fence the served text carries, since that text holds triple-backtick blocks and its own `#` heading.

The manifest reaches the server unresolved. `@storybook/mcp` follows a `v: 1` `$ref` itself, and a ref that fails there fails the whole call, where resolving first would render a healthy-looking component with nothing in it.

The text comes from the `@storybook/mcp` found through the `@storybook/addon-mcp` nearest the manifest, which can be an install sitting above a downloaded build directory rather than the inspected project's own, falling back to this package's copy. The header names the version and which of the two rendered. Loading a copy runs its code, so pointing the command at a build directory you do not control executes that project's `@storybook/mcp`.

`@storybook/mcp` is a runtime dependency of this package now, its first, pinned exactly. Bundling it instead so the package returns to zero runtime dependencies is tracked separately.
