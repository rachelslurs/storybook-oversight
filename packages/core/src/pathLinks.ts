/**
 * The single grammar for Storybook `?path=/(docs|story)/<id>` link targets,
 * shared by the panel's link parser (`markdown.storybookPathId`) and the
 * linter's dangling-link scan (`docs-link-dangling`) so the two can't drift
 * about which targets are valid.
 */
const SEGMENT = String.raw`\?path=\/(?:docs|story)\/([^/?&#)\s]+)`;

/**
 * A fresh **global** matcher for scanning prose for every `?path=` target.
 * Returns a new RegExp each call — a shared global regex carries `lastIndex`
 * state, and though `String.matchAll` clones it, per-call instances keep other
 * uses (`.exec`, `.test`) safe.
 */
export function pathLinkPattern(): RegExp {
  return new RegExp(SEGMENT, 'g');
}

/** The story/docs id from a single target, or null if it isn't a `?path=` link. */
export function parsePathTargetId(target: string): string | null {
  const match = new RegExp(`^${SEGMENT}$`).exec(target);
  return match ? match[1] : null;
}
