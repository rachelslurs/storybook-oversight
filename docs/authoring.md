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

## Put the guidance in the first 90 characters

Selection happens on `list-all-documentation`, and that tool truncates every description to 90 characters. `get-documentation` shows the description in full, but an agent calls it only after it has already chosen. Whatever distinguishes this component from a similar one has to survive the cut, so lead with it.

The example above spends its first 90 characters on the situation the component is for, which is the part that has to arrive. See [What the agent actually receives](./agent-view.md#truncation-and-caps) for the measurement.

## Redirect between components that get confused

Where two components are confusable, add a redirect, as the example above does. The `[Toggle](?path=…)` link is validated by `docs-link-dangling` and is made clickable in the addon's panel.

Put it early if it is meant to steer selection. A redirect written at the end of a description longer than 90 characters is truncated out of the selection list, so it reaches an agent only once that agent has already picked this component. That is still useful, since it tells it to switch, but it is a correction rather than a signpost.

Those links hardcode manifest ids, so renaming a story title leaves every link to it dead. Only the description is scanned for them, so a `?path=` link in an `@example` is neither validated nor made clickable.

## Document every prop, required ones first

Put a JSDoc comment on each prop. A prop with no description still reaches the agent by name, type and optionality; only the prose is lost, so the gap is what the prop is for rather than whether it exists.

The severity split between `required-prop-undocumented` and `prop-descriptions-missing` is a judgment about which gap costs more, not a measurement of how an agent behaves without the prose. [Why these are lint rules](./why-lint-rules.md) says what that judgment rests on.

The gap that is not visible at all is an entry with no props recorded. There the whole props section is absent, and the server tells the agent nothing rather than telling it something incomplete. [`props-unrecorded`](./troubleshooting.md#props-unrecorded) covers that case.

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
