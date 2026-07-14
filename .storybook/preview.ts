import type { Preview } from '@storybook/react-vite';
// Tailwind v4 utilities for the demo components (see .storybook/tailwind.css).
import './tailwind.css';
// Relative import of the built block. A published consumer instead writes:
//   import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';
import { OversightDocsContainer } from '../dist/blocks.js';

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
