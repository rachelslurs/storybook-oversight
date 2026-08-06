/**
 * Node-side preset for Oversight.
 *
 * Prefer named exports for Storybook preset hooks (`viteFinal`,
 * `experimental_serverChannel`, …), which is the documented shape. A default
 * export also works: root `preset.js` forwards both (`export { default }` +
 * `export *`), because `export *` alone would silently drop `default`.
 *
 * The root `preset.js` and `manager.js` stubs must stay even while this holds
 * only the check below: the addon is registered by absolute path in
 * `storybook/.storybook/main.ts`, so Storybook resolves `<packageDir>/preset`
 * and `<packageDir>/manager` as plain file paths.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';

const SPEC = '@storybook/addon-docs/package.json';

/**
 * Find `@storybook/addon-docs` resolving to more than one copy.
 *
 * Two copies render the Docs page blank. `storybook/theming` is emotion and its
 * theme context is per module instance, so when the Docs block resolves
 * addon-docs from its own location and the preview resolves it from the
 * project's, the components the block renders read an undefined theme and throw
 * during render. That takes the whole page rather than degrading to a page
 * without the block.
 *
 * Worth a check rather than a docs note because the resulting errors name
 * neither this addon nor the duplicate: they are `TypeError: Cannot read
 * properties of undefined` from inside addon-docs. Nothing points at the cause,
 * and it reads like a Storybook version incompatibility. Reading it that way is
 * what put a wrong peer range in `0.6.0`.
 *
 * Two vantage points, because that is the condition that matters: what this
 * package resolves and what the project resolves. Paths rather than versions, so
 * two installs of the same version are caught too, since they fail identically.
 */
function findDuplicateAddonDocs(): { fromAddon: string; fromProject: string } | null {
  const resolveFrom = (base: string) => {
    try {
      return createRequire(base).resolve(SPEC);
    } catch {
      // Not installed, or an exports map without `./package.json`. Either way
      // there is nothing to compare.
      return null;
    }
  };

  const fromAddon = resolveFrom(import.meta.url);
  const fromProject = resolveFrom(join(process.cwd(), 'noop.js'));

  if (!fromAddon || !fromProject || fromAddon === fromProject) return null;
  return { fromAddon, fromProject };
}

function versionAt(manifestPath: string): string {
  try {
    return createRequire(import.meta.url)(manifestPath).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Runs when Storybook loads this preset, which is before anything renders, so
 * the warning reaches the terminal ahead of the blank page it explains.
 *
 * Wrapped whole, and it warns rather than throwing: a diagnostic that stops a
 * Storybook from starting is worse than the problem it reports. The logger is a
 * parameter so the behavior is testable without capturing global console.
 */
export function warnOnDuplicateAddonDocs(log: (message: string) => void = console.warn): void {
  try {
    const duplicate = findDuplicateAddonDocs();
    if (!duplicate) return;

    log(
      'storybook-addon-oversight: @storybook/addon-docs resolves to two different copies.\n' +
        `  ${versionAt(duplicate.fromProject)}  ${duplicate.fromProject}  (your project)\n` +
        `  ${versionAt(duplicate.fromAddon)}  ${duplicate.fromAddon}  (this addon)\n` +
        '  Docs pages will render blank, with "Cannot read properties of undefined" raised\n' +
        '  from inside addon-docs, because each copy carries its own theme context.\n' +
        '  Install one copy: match your Storybook packages to a single version, or add an\n' +
        '  override. https://github.com/rachelslurs/storybook-oversight/issues/93',
    );
  } catch {
    // Never the reason a Storybook fails to start.
  }
}

warnOnDuplicateAddonDocs();

export default {};
