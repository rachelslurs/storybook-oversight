import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

// Resolve an addon/framework to an absolute path so Storybook works with pnpm's
// non-hoisted node_modules layout.
function getAbsolutePath(value: string): string {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../stories/**/*.mdx', '../stories/**/*.stories.@(ts|tsx)'],
  addons: [
    getAbsolutePath('@storybook/addon-docs'),
    // Serves /manifests/components.json in dev — the manifest Oversight lints.
    getAbsolutePath('@storybook/addon-mcp'),
    // Loads the built addon from ./dist (see .storybook/local-preset.ts).
    fileURLToPath(import.meta.resolve('./local-preset.ts')),
  ],
  framework: getAbsolutePath('@storybook/react-vite'),
  // Oversight's default expectedExtractor is react-docgen-typescript; match it so
  // JSDoc on components and props is extracted into the manifest.
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
