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
 * A missing file answers 500 with the command that fixes it. `manifestSource`
 * branches only on `!response.ok`, so a 404 and a 500 render the same
 * "Components manifest unavailable" state and fail the same assertion; the
 * difference is that the 500's body reaches the failure output, where a bare 404
 * would leave the reader to work out why no findings rendered.
 */
const STATIC_ROOT = new URL('storybook-static/', import.meta.url);

function serveComponentsManifest(): Plugin {
  return {
    name: 'oversight:serve-components-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent(req.url?.split('?')[0] ?? '');
        if (path.endsWith('/manifests/components.json')) {
          if (!existsSync(MANIFEST)) {
            res.statusCode = 500;
            res.end('storybook-static/manifests/components.json is missing. Run `pnpm build-storybook` first.');
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(readFileSync(MANIFEST));
          return;
        }
        // A v:1 index (built with STORYBOOK_DOCGEN_SERVER=1) defers payloads
        // to `services/**.json` beside it, and the block fetches them relative
        // to the manifest URL. Without this branch Vite's SPA fallback answers
        // each ref with the HTML shell, every entry degrades to refErrors, and
        // findFindingRow blames a renamed story title instead of the refs.
        const service = path.match(/\/(services\/.+\.json)$/)?.[1];
        if (service && !service.split('/').includes('..')) {
          const leaf = fileURLToPath(new URL(service, STATIC_ROOT));
          if (!existsSync(leaf)) {
            res.statusCode = 404;
            res.end(`storybook-static/${service} is missing. The built manifest's refs and the build disagree.`);
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(readFileSync(leaf));
          return;
        }
        return next();
      });
    },
  };
}

// Kept out of `vitest.config.ts` so the unit run never reaches it. Vitest
// resolves the whole config before `--project` filtering, and evaluating
// `storybookTest` loads `.storybook/main.ts`, which loads the addon's built
// `dist/preset.js`. Sharing one config file meant a unit-only run died on a
// checkout where the addon had not been built yet.
//
// Named `vitest.storybook.config.ts`, not `vite.config.ts` as #75 proposed:
// Storybook's Vite builder auto-loads a root `vite.config.ts`, so that name
// would have this file and `.storybook/main.ts` loading each other.
//
// `storybookTest` returns a promise, hence the async factory.
export default defineConfig(async () => ({
  plugins: [
    // `disableAddonDocs` defaults to true, which drops the MDX plugin and
    // `storybook:package-deduplication`. The docs block is the thing under test
    // here, so keep the plugin set the demo build actually uses.
    ...(await storybookTest({ configDir: '.storybook', disableAddonDocs: false })),
    serveComponentsManifest(),
  ],
  // Discovered on first use otherwise, which reloads the page mid-run and fails
  // the story that triggered it with a "Failed to fetch dynamically imported
  // module" that looks nothing like the real assertion.
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
}));
