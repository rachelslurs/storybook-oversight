# Authoring MCP-legible docs

Put a JSDoc block above the component and on each prop; no addon-specific tags. Where two components are confusable, end the description with a redirect the MCP passes through verbatim:

```ts
/**
 * A committed-selection box: tick one or more items and submit them together,
 * rather than applying each change the moment it flips.
 * For a setting that applies the moment it flips, use
 * [Toggle](?path=/docs/forms-toggle--docs) instead.
 */
```

The `[Toggle](?path=…)` link is validated by `docs-link-dangling` and is made clickable in the addon's panel.

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
