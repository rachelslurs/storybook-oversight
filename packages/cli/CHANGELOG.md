# oversight-lint

## 0.2.0

### Minor Changes

- 38aa5bb: Add `--format <text|json|github>`. The new `github` format emits GitHub Actions workflow-command annotations (`::error`/`::warning`/`::notice`, titled `oversight/<rule>` and anchored to the stories file) so findings surface as annotations on the run and the pull request's Checks tab. `--json` now aliases `--format json`; findings have no line numbers, so each annotation anchors to the top of the stories file, capped at GitHub's ~10-per-type-per-step limit.

## 0.1.0

### Minor Changes

- dc6adc2: Initial release. Lints a Storybook MCP components manifest in CI over the same rules as `storybook-addon-oversight`: reads the built `components.json`, reports findings grouped by component, and exits 0 (clean), 1 (findings or over `--max-warnings`), or 2 (could not run). Supports `--json`, `--rule` overrides, `oversight.config.json`, and a GitHub Actions job-summary table.
