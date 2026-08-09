import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

// Resolve an addon/framework to an absolute path so Storybook works with pnpm's
// non-hoisted node_modules layout.
function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

/**
 * The extractor an env var selects, if any.
 *
 * Both variables pick a different extractor, so setting both states two answers
 * to one question. A precedence rule would resolve it silently and the build
 * would record an extractor nobody chose, which is worth more noise than it
 * costs: `scripts/build-fixtures.js` writes the result into committed fixtures.
 */
function docgenFeatures(): Pick<StorybookConfig, 'features'> | Record<string, never> {
  const docgenServer = process.env.STORYBOOK_DOCGEN_SERVER === '1';
  const reactComponentMeta = process.env.STORYBOOK_REACT_COMPONENT_META === '1';
  if (docgenServer && reactComponentMeta) {
    throw new Error('STORYBOOK_DOCGEN_SERVER and STORYBOOK_REACT_COMPONENT_META each select an extractor. Set one.');
  }
  if (docgenServer) return { features: { experimentalDocgenServer: true } };
  if (reactComponentMeta) return { features: { experimentalReactComponentMeta: true } };
  return {};
}

const config: StorybookConfig = {
  // Keep the demo's chrome clean (no "what's new" toast) for a public showcase.
  core: { disableWhatsNewNotifications: true },
  // `STORYBOOK_DOCGEN_SERVER=1` in front of any storybook command runs the demo
  // with the docgen server on: dev serves no manifest (the addon reads the
  // service API instead), and a build writes the v:1 ref manifest. The default
  // stays off so the published demo matches what most consumers run.
  // `STORYBOOK_REACT_COMPONENT_META=1` runs the same demo through
  // react-component-meta without the docgen server, which is the extractor the
  // `v0-react-component-meta` fixture records. Without a toggle that fixture can
  // only be produced by editing this file, which is how it drifted from the
  // sources it claims to be a build of.
  ...docgenFeatures(),
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.@(ts|tsx)'],
  addons: [
    getAbsolutePath('@storybook/addon-docs'),
    // Serves /manifests/components.json in dev, the manifest Oversight lints.
    getAbsolutePath('@storybook/addon-mcp'),
    // The workspace addon, resolved by package name (the real consumer path).
    // pnpm links packages/storybook-addon-oversight into node_modules; Storybook
    // loads its built manager + preset from there. Run `pnpm build:addon` first.
    getAbsolutePath('storybook-addon-oversight'),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
  // Set the extractor so JSDoc on components and props is extracted into the
  // manifest. Stating the same value as expectedExtractor (manager.ts or the
  // CLI flag) enables Oversight's extractor-drift rule.
  typescript: {
    reactDocgen: 'react-docgen-typescript',
    reactDocgenTypescriptOptions: {
      shouldExtractLiteralValuesFromEnum: true,
      shouldRemoveUndefinedFromOptional: true,
      // Keep each component's own API; drop props inherited from node_modules.
      propFilter: (prop) => (prop.parent ? !/node_modules/.test(prop.parent.fileName) : true),
    },
  },
  // Tailwind v4 for the demo components (scoped to this Storybook's Vite build;
  // the published addon uses storybook/theming and is unaffected).
  async viteFinal(config) {
    config.plugins = [...(config.plugins ?? []), tailwindcss()];
    return config;
  },
};

export default config;
