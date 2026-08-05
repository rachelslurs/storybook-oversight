import { defineConfig } from 'vitest/config';

// The unit run, and the default for a bare `vitest run` or `vitest` in watch.
// Each package keeps its own `vitest.config.ts` (node, opt-in DOM per file) and
// its own `test` script; this only gathers them so one command covers all three.
//
// The story project lives in `vitest.storybook.config.ts` rather than as a
// fourth entry here. Vitest resolves every project before `--project` filtering
// applies, so a storybook project in this file would load `.storybook/main.ts`
// and the addon's built `dist/preset.js` on a unit-only run, and fail outright
// on a checkout where the addon has not been built.
export default defineConfig({
  test: {
    projects: ['packages/*'],
  },
});
