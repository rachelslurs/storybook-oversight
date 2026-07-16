/**
 * Node-side preset for Oversight. Currently a no-op; this file is the future
 * home of manifest-serving logic.
 *
 * Prefer named exports for Storybook preset hooks (`viteFinal`,
 * `experimental_serverChannel`, …) — that is the documented shape. A default
 * export also works: root `preset.js` forwards both (`export { default }` +
 * `export *`), because `export *` alone would silently drop `default`.
 *
 * The root `preset.js` and `manager.js` stubs must stay even while this is
 * empty: the addon is registered by absolute path in
 * `storybook/.storybook/main.ts`, so Storybook resolves `<packageDir>/preset`
 * and `<packageDir>/manager` as plain file paths.
 */
export default {};
