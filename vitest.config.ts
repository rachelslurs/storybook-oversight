import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import type { Plugin } from 'vitest/config';
import { defineConfig } from 'vitest/config';

const MANIFEST = fileURLToPath(new URL('storybook-static/manifests/components.json', import.meta.url));

/**
 * Serves the components manifest to the story run, the way Storybook's own
 * core-server serves it at `/manifests/:name.json`. The block resolves its fetch
 * against `document.baseURI` (`blocks.tsx`), which under Vitest is the browser
 * runner's page rather than `iframe.html`, so match on the tail of the path
 * rather than an absolute one.
 *
 * A missing manifest answers 500, never 404. `manifestSource` reads a 404 as
 * "the components-manifest feature is off" and the block renders an empty state,
 * which still contains a heading, so the color assertions would pass on a run
 * where no finding ever rendered. 500 fails the test that depends on it.
 */
function serveComponentsManifest(): Plugin {
  return {
    name: 'oversight:serve-components-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.split('?')[0]?.endsWith('/manifests/components.json')) return next();
        if (!existsSync(MANIFEST)) {
          res.statusCode = 500;
          res.end('storybook-static/manifests/components.json is missing. Run `pnpm build-storybook` first.');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(readFileSync(MANIFEST));
      });
    },
  };
}

// Named `vitest.config.ts`, not `vite.config.ts` as #75 proposed. Storybook's
// Vite builder auto-loads the project-root `vite.config.ts`, and `storybookTest`
// loads `.storybook/main.ts`, which would load that same root config and call
// `storybookTest` again. The builder never looks at this filename.
//
// `storybookTest` returns a promise, hence the async factory.
export default defineConfig(async () => ({
  test: {
    projects: [
      // Each package keeps its own `vitest.config.ts` (node, opt-in DOM per
      // file) and its own `test` script; this only gathers them under one run
      // so a single exit code covers the unit tests and the story run together.
      'packages/*',
      {
        plugins: [
          // `disableAddonDocs` defaults to true, which drops the MDX plugin and
          // `storybook:package-deduplication`. The docs block is the thing under
          // test here, so keep the plugin set the demo build actually uses.
          ...(await storybookTest({ configDir: '.storybook', disableAddonDocs: false })),
          serveComponentsManifest(),
        ],
        // Discovered on first use otherwise, which reloads the page mid-run and
        // fails the story that triggered it with a "Failed to fetch dynamically
        // imported module" that looks nothing like the real assertion.
        optimizeDeps: { include: ['storybook/test'] },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: 'playwright',
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
}));
