/// <reference types="vite/client" />
import type { Preview } from '@storybook/react-vite';
import { themes } from 'storybook/theming';
// Tailwind v4 utilities for the demo components (see .storybook/tailwind.css).
import './tailwind.css';
// The Docs block, imported the way a published consumer does (resolved through
// the workspace-linked addon's `./blocks` export). Run `pnpm build:addon` first.
import { OversightDocsContainer } from 'storybook-addon-oversight/blocks';

// `STORYBOOK_DARK=1 pnpm storybook` renders the Docs pages dark. Text that sets
// no color of its own falls back to black, which reads on a white page and
// disappears here, so this is how that gets looked at. The Vite builder exposes
// STORYBOOK_-prefixed vars on import.meta.env, not on process.env.
const docsTheme = import.meta.env.STORYBOOK_DARK ? themes.dark : undefined;

const preview: Preview = {
  parameters: {
    // One-line global opt-in: the Oversight coverage block renders at the bottom
    // of every component Docs page. Delete this line to remove it everywhere.
    docs: { container: OversightDocsContainer, theme: docsTheme },
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
