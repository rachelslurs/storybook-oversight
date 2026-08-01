# Troubleshooting

What to do about each finding. Every rule and its default severity is in [Rules](./rules.md), and [Authoring MCP-legible docs](./authoring.md) covers writing the JSDoc that keeps most of these from firing.

## `docgen-missing`

`docgen-missing` means the extractor returned no docs for the component's file, so its props and JSDoc never reach the manifest. An agent sees the component with no documented props. In order of likelihood:

1. **`reactDocgen` isn't `react-docgen-typescript`.** Set `typescript.reactDocgen: 'react-docgen-typescript'` in `.storybook/main.ts` so JSDoc on components and props is extracted. This one does not apply if `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` is on. Either flag selects the extractor on its own and `typescript.reactDocgen` is never read, so changing it has no effect. Check `meta.docgen` in the manifest for which extractor actually ran.
2. **Your root `tsconfig.json` is solution-style.** The default `npm create vite` (react-ts) scaffold ships a root that only delegates to project references and owns no files:

   ```jsonc
   // tsconfig.json
   { "files": [], "references": [{ "path": "./tsconfig.app.json" } /* , … */] }
   ```

   Storybook's manifest docgen (`@storybook/react`) resolves the nearest tsconfig at your project root and builds its TypeScript program from it. A solution-style root contributes no files of its own, so the program is empty and extraction returns nothing, even for a fully-typed, fully-documented component. Give that root config your sources:

   ```jsonc
   // tsconfig.json
   { "extends": "./tsconfig.app.json", "include": ["src"] }
   ```

3. **`reactDocgenTypescriptOptions.tsconfigPath` won't fix this.** There are two docgen paths and they don't share a tsconfig: Storybook's Docs UI honors `typescript.reactDocgenTypescriptOptions.tsconfigPath`, but the manifest docgen that Oversight reads uses `findTsconfigPath(cwd)` and ignores it. So that override can make your Docs prop tables render while this finding still fires. Fix the tsconfig your project _root_ resolves to (point 2).
4. **Your component's default export is an expression.** `export default Checkbox as WithSlotMarker<typeof Checkbox>` and `export default Object.assign(TabNav, {Link})` both break the link between the export and the declaration your JSDoc sits on. `react-docgen-typescript` then reports `found no component docs` for that file and extracts nothing, so props go with the description. Give the documented thing a name and export that:

   ```ts
   import CheckboxImpl from './Checkbox';

   /** An accessible, native checkbox component */
   const Checkbox = CheckboxImpl;
   export default Checkbox;
   ```

   Moving the JSDoc onto the barrel's `export {default} from './Checkbox'`, or onto a bare `export default Checkbox` re-export, does not work. The doc comment has to sit on a declaration.

   `react-component-meta` has the same blind spot with a quieter symptom: props extract normally and only the description comes out empty, so you get `component-description-missing` instead of this rule. `react-docgen` resolves both forms and is unaffected.

## `component-description-missing`

Most of the time no description was written. Put a JSDoc block above the component.

When the JSDoc is there and the extractor is `react-component-meta`, check [item 4 under `docgen-missing`](#docgen-missing): an expression default export loses only the description under that extractor, so the failure lands on this rule instead.

## `prop-descriptions-missing` and `required-prop-undocumented`

The props reached the manifest, without descriptions. Put a JSDoc comment on each one. `required-prop-undocumented` is the error of the two because an agent has to supply a required prop and will guess at an undocumented one.

Both rules stop running when `prop-shape-unrecognized` fires, so fix that first if you see it.

## `extractor-drift`

The manifest records an extractor other than the one you expected, or records none at all. It runs only when an expectation is configured, so the finding means the configured value and the built manifest disagree.

Check `meta.docgen` in the manifest for what actually ran, then set the expectation to match: `expectedExtractor` in `.storybook/manager.ts` for the panel, `--expected-extractor` or the config file for the CLI. With `features.experimentalReactComponentMeta` or `features.experimentalDocgenServer` enabled the value is `react-component-meta`, because either flag picks the extractor itself.

## `docs-link-dangling`

A `?path=` redirect in a component description points at an id that is not in the manifest. Renaming a story title leaves every link to it dead, which is the usual cause. Point the link at a current id, or drop it.

Only the description is scanned. A `?path=` link in an `@example` or another tag is not checked and does not fire this.

## `story-extraction-error`

One story's snippet or docgen extraction failed, and the manifest records it on `stories[].error`. `--format json` carries the full text on the finding's `error` field, which says more than the summary line does.

## `prop-shape-unrecognized` and `ref-unresolved`

Both mean the payload is not the shape the prop rules read, and both report what they expected against what they got. `prop-shape-unrecognized` is manifest-wide, so a build has moved the fields every entry shares. `ref-unresolved` is one component, so a `$ref` on an otherwise-readable entry did not resolve.

A manifest version this build does not know is refused outright rather than guessed at, so a finding here means the shape changed inside a version that is still recognized.

## `unknown-ignore-rule`

An `@oversightIgnore` list contains a token that is not a rule name, usually a typo. Nothing is exempted by that token. Check it against [Rules](./rules.md).

## `deprecated-tag`

A component carries `@deprecated`. Nothing is broken; the rule reports it at `info` so a deprecated component is visible in the same place as everything else.
