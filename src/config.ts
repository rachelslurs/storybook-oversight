import type { LintOptions } from './core';

/**
 * The consumer-facing config object, shared by both surfaces: the manager
 * panel (`addons.setConfig({ [ADDON_ID]: … })` in `.storybook/manager.ts`)
 * and the docs block (`parameters: { oversight: … }`). It extends the pure
 * `src/core` `LintOptions` with addon-level display flags that never reach the
 * linter — so `src/core` stays a Storybook-free, plain-data linter.
 */
export type OversightConfig = LintOptions & {
  /**
   * Show the "manifest debugger" footer link (deep-linked to the current
   * component). Defaults to `true`; set `false` to hide it on every surface.
   */
  debuggerLink?: boolean;
};

/** Display default for {@link OversightConfig.debuggerLink} — the footer link
 *  shows unless a consumer explicitly opts out. */
export const DEFAULT_DEBUGGER_LINK = true;
