/**
 * Whether a story or docs index id belongs to a component id. Storybook builds
 * both as `<component id>--<name>`, and the bare component id itself also
 * matches.
 *
 * One rule, two readers: the panel pairs the selected story with its manifest
 * entry, and the synthesized manifest's tag filter pairs index entries with
 * service components. They must not drift, or the panel's story selection and
 * the filter would disagree about which component an id names.
 */
export function belongsToComponent(entryId: string, componentId: string): boolean {
  return entryId === componentId || entryId.startsWith(`${componentId}--`);
}
