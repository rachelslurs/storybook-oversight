/**
 * One healthy component, and one variant per failure mode.
 *
 * Every variant mutates the same entry, so a difference in the rendered output is
 * attributable to the single field that changed. Comparing two different demo
 * components would not be: they differ in name, prop count and prose as well as
 * in the defect, and any of those moves the text.
 *
 * The healthy entry is the real `actions-button` entry from a `storybook build`
 * of the demo, with only its absolute `filePath` replaced, so the baseline is a
 * manifest Storybook actually produced rather than one written by hand.
 */
import { readFileSync } from 'node:fs';

export type Prop = {
  name?: string;
  description?: string;
  required?: boolean;
  type?: unknown;
  defaultValue?: unknown;
};

export type Payload = {
  description?: string;
  filePath?: string;
  tags?: Record<string, unknown>;
  props?: Record<string, Prop>;
};

export type Story = { id?: string; name?: string; snippet?: string; error?: unknown };

export type Entry = {
  id: string;
  name: string;
  path?: string;
  description?: string;
  import?: string;
  jsDocTags?: Record<string, unknown>;
  reactDocgenTypescript?: Payload;
  reactDocgen?: Payload;
  reactComponentMeta?: Payload;
  stories?: Story[];
  error?: { name: string; message: string };
};

export type Manifest = { v: number; meta?: unknown; components: Record<string, Entry> };

/** The id of the single component every variant is built from. */
export const ENTRY_ID = 'actions-button';

const FIXTURE = readFileSync(new URL('../test/fixtures/healthy.json', import.meta.url), 'utf8');

/** A fresh copy of the healthy manifest. Never share one between variants. */
export function healthy(): Manifest {
  return JSON.parse(FIXTURE) as Manifest;
}

function mutate(change: (entry: Entry) => void): Manifest {
  const manifest = healthy();
  change(manifest.components[ENTRY_ID]!);
  return manifest;
}

/** The payload the healthy fixture carries, whichever extractor recorded it. */
export function payloadOf(entry: Entry): Payload {
  const payload = entry.reactDocgenTypescript ?? entry.reactDocgen ?? entry.reactComponentMeta;
  if (!payload) throw new Error('the healthy fixture lost its docgen payload');
  return payload;
}

function dropPayload(entry: Entry): void {
  delete entry.reactDocgenTypescript;
  delete entry.reactDocgen;
  delete entry.reactComponentMeta;
}

/** `docgen-missing`, with the diagnosis Storybook recorded on the entry. */
export function extractionFailed(): Manifest {
  return mutate((entry) => {
    dropPayload(entry);
    delete entry.description;
    entry.error = {
      name: 'DocgenError',
      message: 'We could not detect the component from your story file.',
    };
  });
}

/** No payload and no diagnosis: the same rule, without the error field. */
export function noDocgen(): Manifest {
  return mutate((entry) => {
    dropPayload(entry);
    delete entry.description;
  });
}

/** `props-unrecorded`. The payload survived; it just records no props. */
export function noProps(): Manifest {
  return mutate((entry) => {
    payloadOf(entry).props = {};
    delete entry.description;
    delete payloadOf(entry).description;
  });
}

/** `component-description-missing`. Props intact, prose gone. */
export function noDescription(): Manifest {
  return mutate((entry) => {
    delete entry.description;
    delete payloadOf(entry).description;
  });
}

/** `prop-descriptions-missing`, on one optional prop. */
export function propDescriptionMissing(prop = 'size'): Manifest {
  return mutate((entry) => {
    const target = payloadOf(entry).props?.[prop];
    if (!target) throw new Error(`the healthy fixture has no prop "${prop}"`);
    delete target.description;
  });
}

/** `required-prop-undocumented`, on the one required prop. */
export function requiredPropUndocumented(prop = 'variant'): Manifest {
  return mutate((entry) => {
    const target = payloadOf(entry).props?.[prop];
    if (!target) throw new Error(`the healthy fixture has no prop "${prop}"`);
    if (target.required !== true) throw new Error(`prop "${prop}" is not required`);
    delete target.description;
  });
}

/**
 * A prop whose `required` and `type` never reached the manifest. No rule covers
 * this; the interest is entirely in what the server renders for it.
 */
export function propMetadataUnrecorded(prop = 'size'): Manifest {
  return mutate((entry) => {
    const target = payloadOf(entry).props?.[prop];
    if (!target) throw new Error(`the healthy fixture has no prop "${prop}"`);
    delete target.required;
    delete target.type;
    delete target.defaultValue;
  });
}

/** `story-extraction-error`. The story is recorded, but its snippet is not. */
export function storyExtractionFailed(): Manifest {
  return mutate((entry) => {
    const story = entry.stories?.[0];
    if (!story) throw new Error('the healthy fixture has no stories');
    delete story.snippet;
    story.error = { name: 'SyntaxError', message: 'Expected story to be a function' };
  });
}

/** The same rule, where extraction recorded an error but kept the snippet. */
export function storyErrorWithSnippet(): Manifest {
  return mutate((entry) => {
    const story = entry.stories?.[0];
    if (!story) throw new Error('the healthy fixture has no stories');
    if (!story.snippet) throw new Error('the healthy fixture story has no snippet');
    story.error = { name: 'SyntaxError', message: 'Expected story to be a function' };
  });
}

/** `deprecated-tag`, carried where the manifest records component tags. */
export function deprecated(): Manifest {
  return mutate((entry) => {
    entry.jsDocTags = { ...entry.jsDocTags, deprecated: ['Use Action instead.'] };
    payloadOf(entry).tags = { ...payloadOf(entry).tags, deprecated: 'Use Action instead.' };
  });
}

/** A description short enough to survive the selection list's truncation. */
export function shortDescription(text: string): Manifest {
  return mutate((entry) => {
    entry.description = text;
    payloadOf(entry).description = text;
  });
}

/**
 * The same component as a v:1 index entry pointing at externalised leaves.
 * Returns the manifest and the files its `$ref`s resolve to, so a caller can
 * withhold one and make the ref dangle.
 *
 * The `{ components: { <id>: ... } }` envelope each leaf carries is called out
 * in Storybook's docgen server RFC as an internal construct rather than a public
 * API, so this fixture is built on something free to change without notice. It
 * is written by hand for that reason: a real `experimentalDocgenServer` build
 * would tie the whole file to that shape instead of these two functions.
 */
export function refManifest(): { manifest: Manifest; files: Record<string, unknown> } {
  const entry = healthy().components[ENTRY_ID]!;
  const payload = payloadOf(entry);
  const docgenPath = `./services/core/docgen/${ENTRY_ID}.json`;
  const storyDocsPath = `./services/core/story-docs/${ENTRY_ID}.json`;

  const index = {
    v: 1,
    components: {
      [ENTRY_ID]: {
        id: entry.id,
        name: entry.name,
        description: entry.description,
        docgen: { $ref: `../services/core/docgen/${ENTRY_ID}.json#/components/${ENTRY_ID}` },
        stories: { $ref: `../services/core/story-docs/${ENTRY_ID}.json#/components/${ENTRY_ID}` },
      },
    },
  } as unknown as Manifest;

  return {
    manifest: index,
    files: {
      [docgenPath]: { components: { [ENTRY_ID]: { reactComponentMeta: { props: payload.props } } } },
      [storyDocsPath]: {
        components: { [ENTRY_ID]: { stories: entry.stories, import: entry.import } },
      },
    },
  };
}
