# Authoring MCP-legible docs

An agent picks a component out of the manifest before it writes any code, and the description is what it picks on. These are the practices that get that description into the manifest and make it worth reading once it arrives.

For a finding you already have, [Troubleshooting](./troubleshooting.md) covers each rule.

## Put the doc comment on a declaration

`react-docgen-typescript` and `react-component-meta` both read the comment from the declaration the default export resolves to. An export that is an expression breaks that trail, and so does moving the comment onto a barrel's re-export. Give the documented thing a name and export the name:

```ts
import CheckboxImpl from './Checkbox';

/** An accessible, native checkbox component */
const Checkbox = CheckboxImpl;
export default Checkbox;
```

`react-docgen` resolves both forms. Under the other two the symptom differs by extractor, and [`docgen-missing`](./troubleshooting.md#docgen-missing) has both.

## Say when to use it, not what it is

The most useful thing you can hand an agent is which component to use. A description that names the situation the component is for gives it something to match on. One that restates the component's own name gives it nothing.

```ts
/**
 * A committed-selection box: tick one or more items and submit them together,
 * rather than applying each change the moment it flips.
 * For a setting that applies the moment it flips, use
 * [Toggle](?path=/docs/forms-toggle--docs) instead.
 */
```

No addon-specific tags. Selection guidance is a plain sentence in the description, typical Storybook practice, and `get-documentation` passes it through verbatim.

## Redirect between components that get confused

Where two components are confusable, end the description with a redirect, as the example above does. The `[Toggle](?path=…)` link is validated by `docs-link-dangling` and is made clickable in the addon's panel.

Those links hardcode manifest ids, so renaming a story title leaves every link to it dead. Only the description is scanned for them, so a `?path=` link in an `@example` is neither validated nor made clickable.

## Document every prop, required ones first

Put a JSDoc comment on each prop. An agent has to supply the required ones and will guess at any it cannot read, which is why `required-prop-undocumented` is an error where a missing optional description is a warning.

## Exempting a component

`@oversightIgnore` keeps a component in the manifest (agents still see its docs) but exempts it from lint rules (bare for all rules, or scoped):

```ts
/**
 * An internal token catalog; coverage rules don't apply.
 *
 * @oversightIgnore docgen-missing, story-extraction-error
 */
```

This is deliberately different from Storybook's `!manifest` tag, which removes the component from the manifest, and therefore from agents, entirely. Use `!manifest` to hide, `@oversightIgnore` to exempt.

Unrecognized rule names in the list are themselves flagged (`unknown-ignore-rule`) rather than silently exempting nothing. For an entry whose docgen extraction failed (no component JSDoc reaches the manifest), put `@oversightIgnore` on the JSDoc above the stories file's `meta`, the one case where story-meta JSDoc is sanctioned.
