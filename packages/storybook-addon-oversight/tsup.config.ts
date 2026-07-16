import { defineConfig, type Options } from 'tsup';

const NODE_TARGET = 'node20.19'; // Minimum Node version supported by Storybook 10

const commonConfig: Options = {
  // Don't wipe dist mid-watch; prebuild clears it for one-shot builds.
  // See https://github.com/egoist/tsup/issues/1270
  clean: false,
  format: ['esm'],
  treeshake: true,
  splitting: true,
  // Provided by Storybook — externalize, don't bundle or declare as deps.
  external: ['react', 'react-dom', '@storybook/icons'],
};

export default defineConfig([
  {
    ...commonConfig,
    entry: ['src/manager.tsx'],
    platform: 'browser',
    // Storybook re-bundles manager entries; esnext is fine here.
    target: 'esnext',
    // Build the manager with the CLASSIC JSX runtime. Storybook's manager
    // globalizes `react` but not `react/jsx-runtime`, so the automatic runtime
    // would bundle a `react/jsx-runtime` from the consumer's React (potentially
    // a different major than the manager's React 18) and crash. Classic
    // transform routes JSX through the globalized `react` via the injected shim.
    //
    // The jsx mode is forced via tsconfig (esbuild reads `jsx` from it); the
    // `jsx: 'transform'` esbuild option can't override tsconfig because it
    // equals esbuild's own default. The shim supplies `React` for the emitted
    // `React.createElement` calls.
    tsconfig: 'tsconfig.manager.json',
    esbuildOptions(options) {
      options.inject = [...(options.inject ?? []), 'src/react-shim.ts'];
    },
  },
  {
    // The opt-in Docs block consumers import from `storybook-addon-oversight/blocks`.
    // Unlike manager entries (which Storybook re-bundles), this is a plain import
    // resolved by the consumer's Vite build — so every `storybook/*` and
    // `@storybook/*` import must be EXTERNAL, not bundled. Bundling `storybook/theming`
    // would give the block a second emotion instance that never receives the preview's
    // ThemeProvider context (theme.typography → undefined at render).
    ...commonConfig,
    entry: ['src/blocks.tsx'],
    platform: 'browser',
    target: 'esnext',
    dts: true,
    external: ['react', 'react-dom', /^storybook\//, /^@storybook\//],
  },
  {
    ...commonConfig,
    entry: ['src/preset.ts'],
    platform: 'node',
    target: NODE_TARGET,
  },
]);
