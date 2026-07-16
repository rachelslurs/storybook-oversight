# oversight-lint

## 0.1.0

### Minor Changes

- dc6adc2: Initial release. Lints a Storybook MCP components manifest in CI over the same rules as `storybook-addon-oversight`: reads the built `components.json`, reports findings grouped by component, and exits 0 (clean), 1 (findings or over `--max-warnings`), or 2 (could not run). Supports `--json`, `--rule` overrides, `oversight.config.json`, and a GitHub Actions job-summary table.
