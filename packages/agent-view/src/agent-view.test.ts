/**
 * What Storybook's MCP server renders from a components manifest.
 *
 * These tests are a record, not a specification. Oversight does not own this
 * output and cannot fix it here; the point is to hold it still, so that a change
 * to what an agent receives shows up as a failing test rather than as a rule
 * whose justification quietly stopped being true.
 *
 * Read the snapshots as the deliverable. Read the assertions as the claims
 * `docs/agent-view.md` is allowed to make.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { STORYBOOK_MCP_INSTRUCTIONS } from '@storybook/mcp';

import { filesFor, getDocumentation, getStoryDocumentation, listAllDocumentation } from './driver.ts';
import * as variant from './variants.ts';

const require = createRequire(import.meta.url);

/** Truncation applied to every description in the selection list. */
const SUMMARY_LIMIT = 90;

const render = (manifest: unknown, extra: Record<string, unknown> = {}) =>
  getDocumentation(filesFor(manifest, extra), variant.ENTRY_ID);

const list = (manifest: unknown) => listAllDocumentation(filesFor(manifest));

describe('the version these results describe', () => {
  it('measures the copy of @storybook/mcp that addon-mcp ships', () => {
    const pinned = require('@storybook/addon-mcp/package.json').dependencies['@storybook/mcp'];
    const resolved = require('@storybook/mcp/package.json').version;

    // Not a style check. If addon-mcp moves to a different @storybook/mcp, every
    // snapshot below describes a formatter no agent is running any more.
    expect(resolved).toBe(pinned);
  });

  it('holds the instructions the server sends alongside the data', () => {
    // The payload is only half of what reaches the agent. The other half is this
    // instruction block, and "if it is not documented, it does not exist" is what
    // makes an omitted field consequential rather than merely absent.
    expect(STORYBOOK_MCP_INSTRUCTIONS).toContain('Never hallucinate component properties');
    expect(STORYBOOK_MCP_INSTRUCTIONS).toContain('If it is not documented, it does not exist');
    expect(STORYBOOK_MCP_INSTRUCTIONS).toMatchSnapshot();
  });
});

describe('a healthy component', () => {
  it('renders its description, stories and props', async () => {
    const { text, isError } = await render(variant.healthy());

    expect(isError).toBe(false);
    expect(text).toContain('## Props');
    expect(text).toMatchSnapshot();
  });
});

describe('three failure modes that render identically', () => {
  it('cannot be told apart in the tool result', async () => {
    const failed = variant.extractionFailed();
    const missing = variant.noDocgen();
    const empty = variant.noProps();

    // The control: the three manifests really are different documents. Without
    // this the matching output below would prove only that the mutators ran.
    expect(JSON.stringify(failed)).not.toBe(JSON.stringify(missing));
    expect(JSON.stringify(missing)).not.toBe(JSON.stringify(empty));

    const [a, b, c] = await Promise.all([render(failed), render(missing), render(empty)]);

    expect(a.text).toBe(b.text);
    expect(b.text).toBe(c.text);
    expect([a.isError, b.isError, c.isError]).toEqual([false, false, false]);
    expect(a.text).toMatchSnapshot();
  });

  it('differs from the healthy render, so the comparison can fail', async () => {
    const healthy = await render(variant.healthy());
    const broken = await render(variant.extractionFailed());

    expect(broken.text).not.toBe(healthy.text);
    expect(healthy.text).toContain('## Props');
    expect(broken.text).not.toContain('## Props');
  });

  it('never shows the diagnosis the manifest recorded', async () => {
    const manifest = variant.extractionFailed();
    const recorded = manifest.components[variant.ENTRY_ID]!.error!.message;

    const { text, isError } = await render(manifest);

    expect(recorded).toBe('We could not detect the component from your story file.');
    expect(text).not.toContain(recorded);
    expect(text).not.toContain('DocgenError');
    expect(isError).toBe(false);
  });
});

describe('a missing component description', () => {
  it('leaves a bare line in the selection list', async () => {
    const { text } = await list(variant.noDescription());

    expect(text).toContain(`- Button (${variant.ENTRY_ID})`);
    expect(text).not.toContain(`- Button (${variant.ENTRY_ID}):`);
  });

  it('is unmarked in the documentation for that component', async () => {
    const { text } = await render(variant.noDescription());

    expect(text).not.toContain('Triggers an action when pressed');
    // Nothing stands in for the absent prose: no placeholder, no empty heading.
    expect(text).toMatchSnapshot();
  });
});

describe('a prop with no description', () => {
  it('keeps its name, type and optionality', async () => {
    const { text } = await render(variant.propDescriptionMissing('size'));

    expect(text).toContain('size?:');
    expect(text).not.toContain('Control height and padding');
    // The other props keep their JSDoc blocks, so only the one field is gone.
    expect(text).toContain('Content rendered inside the button.');
  });

  it('is still named when the prop is required', async () => {
    const { text } = await render(variant.requiredPropUndocumented('variant'));

    expect(text).toContain('variant:');
    expect(text).not.toContain("Visual style: 'primary'");
  });
});

describe('a prop whose required and type never reached the manifest', () => {
  it('is rendered as a required prop of type any', async () => {
    const { text } = await render(variant.propMetadataUnrecorded('size'));

    // Not an omission. The manifest said nothing and the server states something.
    expect(text).toContain('size: any;');
    expect(text).not.toContain('size?:');
  });
});

describe('a story whose snippet never extracted', () => {
  it('disappears from the component documentation', async () => {
    const healthy = await render(variant.healthy());
    const { text } = await render(variant.storyExtractionFailed());

    expect(healthy.text).toContain('### Primary');
    expect(text).not.toContain('### Primary');
  });

  it('returns an empty string that is not flagged as an error', async () => {
    const files = filesFor(variant.storyExtractionFailed());
    const { text, isError } = await getStoryDocumentation(files, variant.ENTRY_ID, 'Primary');

    expect(text).toBe('');
    expect(isError).toBe(false);
  });

  it('still renders when the story kept its snippet, error and all', async () => {
    // The disappearance above follows from the missing snippet, not from the
    // error. A story recording both is served as though nothing went wrong, so
    // `story-extraction-error` covers two projections rather than one.
    const manifest = variant.storyErrorWithSnippet();
    const { text } = await render(manifest);

    expect(text).toContain('### Primary');
    expect(text).not.toContain('Expected story to be a function');
  });
});

describe('the selection list', () => {
  it('truncates a description past the summary limit', async () => {
    const description = variant.healthy().components[variant.ENTRY_ID]!.description ?? '';
    const { text } = await list(variant.healthy());

    expect(description.length).toBeGreaterThan(SUMMARY_LIMIT);
    expect(text).toContain(`${description.slice(0, SUMMARY_LIMIT)}...`);
    expect(text).toMatchSnapshot();
  });

  it('wraps one component across several lines when its description has newlines', async () => {
    const { text } = await list(variant.healthy());
    const entryLines = text.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));

    // Truncation counts characters of the raw string, newlines included, so an
    // entry is not one line and cannot be parsed as one.
    expect(entryLines.length).toBeGreaterThan(1);
    expect(entryLines[0]).toMatch(/^- Button \(actions-button\): /);
    expect(entryLines[1]).not.toMatch(/^- /);
  });

  it('drops a redirect written at the end of a long description', async () => {
    const description = variant.healthy().components[variant.ENTRY_ID]!.description ?? '';
    const { text: listed } = await list(variant.healthy());
    const { text: documented } = await render(variant.healthy());

    // The convention `docs/authoring.md` prescribes, and the rule that validates it.
    expect(description).toContain('?path=/docs/data-display-card--docs');
    expect(description.length).toBeGreaterThan(SUMMARY_LIMIT);

    // It survives only where selection has already happened.
    expect(listed).not.toContain('?path=');
    expect(documented).toContain('?path=/docs/data-display-card--docs');
  });

  it('keeps a redirect that fits inside the summary limit', async () => {
    const short = 'Use for the main action. For a container, see [Card](?path=/docs/x--docs).';
    expect(short.length).toBeLessThanOrEqual(SUMMARY_LIMIT);

    const { text } = await list(variant.shortDescription(short));

    expect(text).toContain('?path=/docs/x--docs');
  });
});

describe('a deprecated component', () => {
  it('says nothing about the tag', async () => {
    const { text } = await render(variant.deprecated());

    // Component-level JSDoc tags are dropped, so `deprecated-tag` reports something
    // an agent reading the manifest through the MCP never learns.
    expect(text).not.toContain('deprecated');
    expect(text).not.toContain('Use Action instead');
  });
});

describe('a v:1 manifest', () => {
  it('projects the same text as the inline form once its refs resolve', async () => {
    const { manifest, files } = variant.refManifest();

    const resolved = await render(manifest, files);
    const inline = await render(variant.healthy());

    expect(resolved.isError).toBe(false);
    expect(resolved.text).toBe(inline.text);
  });

  it('fails the whole call when a ref dangles', async () => {
    const { manifest } = variant.refManifest();

    const { text, isError } = await render(manifest, {});

    // The opposite of the v:0 failure modes above: loud, and the component is lost
    // rather than served as a healthy one with nothing in it.
    expect(isError).toBe(true);
    expect(text).toContain('404 Not Found');
  });
});
