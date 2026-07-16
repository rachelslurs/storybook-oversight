import type { Preview } from '@storybook/react-vite';
// Tailwind v4 utilities for the demo components (see .storybook/tailwind.css).
import './tailwind.css';
// The Docs block, imported the way a published consumer does (resolved through
// the workspace-linked addon's `./blocks` export). Run `pnpm build:addon` first.
import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';

const preview: Preview = {
  parameters: {
    // One-line global opt-in: the Oversight coverage block renders at the bottom
    // of every component Docs page. Delete this line to remove it everywhere.
    docs: { container: OversightDocsContainer },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
  // Give every component an autodocs page so the Docs-block surface is visible.
  tags: ['autodocs'],
};

export default preview;
