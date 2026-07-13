import type { Preview } from '@storybook/react-vite';
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
