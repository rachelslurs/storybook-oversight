# Rules

A rule is one check. It fires when the manifest meets its condition, and dictates the finding that results: its severity, the message naming what happened, and a one-line hint. `deprecated-tag` is the exception and carries no hint, reporting a fact rather than a defect. Which component the finding is about, and the specifics the message names, come from the manifest. [Troubleshooting](./troubleshooting.md) is the long form of those fixes.

`oversight-lint` and `storybook-addon-oversight` run the same rules from `oversight-core`, at these default severities:

| Rule | Default severity | Fires when |
| --- | --- | --- |
| `docgen-missing` | error | an entry has no docgen payload (extraction failed) |
| `story-extraction-error` | warning | a story's snippet/docgen extraction failed (`stories[].error`) |
| `extractor-drift` | warning | `meta.docgen` ≠ the expected extractor, or unrecorded; runs only when an expectation is configured |
| `component-description-missing` | warning | no component description |
| `prop-descriptions-missing` | warning | props without JSDoc descriptions |
| `required-prop-undocumented` | error | required props without JSDoc descriptions |
| `props-unrecorded` | warning | the entry records no props at all, so the MCP describes the component as taking none |
| `docs-link-dangling` | error | a prose `?path=/docs\|story/…` link targets an id whose component prefix isn't in the manifest |
| `unknown-ignore-rule` | warning | `@oversightIgnore` lists a token that is not a rule name |
| `deprecated-tag` | info | a `@deprecated` tag is present |
| `prop-shape-unrecognized` | error | the prop payload is missing the fields the prop rules read |
| `ref-unresolved` | warning | a `$ref` on an otherwise-readable component did not resolve |

A required prop with no description trips both prop rules, once as a warning naming every undocumented prop and once as an error naming the required ones. The sets overlap by design: `prop-descriptions-missing` is the whole list, and the error is the subset an agent has to supply a value for. Turning `required-prop-undocumented` off keeps those props in the warning rather than dropping them from the report.

When `prop-shape-unrecognized` fires, `prop-descriptions-missing` and `required-prop-undocumented` do not run. Both read `props[n].description` and `props[n].required`, and a build where those fields have moved would otherwise report every prop in the library as undocumented. The check asks whether the field names still exist anywhere in the manifest, so a prop carrying an empty description still counts as undocumented and is still reported. To keep building through one, set it to `warning`: `--rule prop-shape-unrecognized=warning` on the CLI, or the `rules` map in `.storybook/manager.ts` for the panel.

## Changing a severity

Every rule takes an override, and the table above is what runs when you configure nothing. The accepted values are `error`, `warning`, `info`, and `off`.

The panel reads them from `.storybook/manager.ts`:

```ts
addons.setConfig({
  'storybook-addon-oversight': {
    rules: { 'deprecated-tag': 'off', 'prop-descriptions-missing': 'error' },
  },
});
```

`oversight-lint` reads them from `oversight.config.json`, or from `--rule <name>=<severity>`, which is repeatable and takes precedence over the file:

```json
{ "rules": { "deprecated-tag": "off", "prop-descriptions-missing": "error" } }
```

A value outside those four is ignored and the rule keeps its default, so an ESLint-style `"warn"` reads as no override rather than as a mistake.

`off` stops a rule across the whole manifest. To keep a rule running and exempt one component from it, use [`@oversightIgnore`](./authoring.md#exempting-a-component).

[Why these are lint rules](./why-lint-rules.md) covers the four that need judgment a raw view can't give you, including why `prop-shape-unrecognized` is an `error`.

[Troubleshooting](./troubleshooting.md) has a fix for every rule above. [Authoring MCP-legible docs](./authoring.md) covers writing the docs that keep most of them from firing.
