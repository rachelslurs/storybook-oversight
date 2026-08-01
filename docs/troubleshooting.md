# Troubleshooting

Every rule and its default severity is in [Rules](./rules.md).

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

## `component-description-missing` on a documented component

Most `component-description-missing` findings mean no description was written. When the JSDoc is there and the extractor is `react-component-meta`, check [item 4 under `docgen-missing`](#docgen-missing): an expression default export loses only the description under that extractor, so the failure lands on this rule instead. The fix there applies.
