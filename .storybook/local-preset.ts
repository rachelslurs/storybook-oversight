import { fileURLToPath } from 'node:url';

/**
 * Load the built addon's manager entry into this test Storybook. The addon is
 * bundled to ./dist (run `pnpm build` / `pnpm build:watch`), so Storybook loads
 * the same artifact a published consumer would.
 */
export function managerEntries(entry: string[] = []): string[] {
  return [...entry, fileURLToPath(import.meta.resolve('../dist/manager.js'))];
}

// The addon has no preview entry; the Docs block is wired in preview.ts instead.
export * from '../dist/preset.js';
