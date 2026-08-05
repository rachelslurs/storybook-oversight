// A test fixture, not demo surface. `tags` below keeps it out of the sidebar,
// out of autodocs and out of the components manifest, so the demo Storybook a
// visitor sees and the manifest `oversight-lint` reads are both unchanged.
//
// What it is for: the block's unit tests mock `@storybook/addon-docs/blocks`, so
// they render no `DocsContent` ancestor and a `Heading` more generous than the
// real one. Both are the reason a suite stayed green while the heading painted
// the wrong color on a real Docs page. This mounts the container the way
// `.storybook/preview.ts` configures it, over the real addon-docs blocks, in a
// real browser, and reads the color off `getComputedStyle`.
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentType, PropsWithChildren } from 'react';
import { expect, within } from 'storybook/test';
import { ensure, themes } from 'storybook/theming';
import type { StorybookTheme } from 'storybook/theming';

// Card is the component whose findings are known: `required-prop-undocumented`
// (error) and `prop-descriptions-missing` (warning), from two deliberately
// undocumented props in `stories/Card/Card.tsx`.
const COMPONENT_ID = 'data-display-card';

/**
 * The one seam. `DocsContainer` reads `resolveOf("meta").preparedMeta.parameters`
 * for the toc, `OversightDocsContainer` calls `resolveOf` to decide whether the
 * page documents a component, and `useOf` inside the block reads
 * `csfFile.meta.id`. Nothing here renders; everything below the container is the
 * real component.
 */
const docsContext = {
  channel: { on: () => {}, off: () => {}, once: () => {}, emit: () => {} },
  projectAnnotations: { parameters: {} },
  resolveOf: (type: string) => {
    if (type !== 'meta') throw new Error(`this fixture resolves only "meta", asked for "${type}"`);
    return {
      type: 'meta',
      csfFile: { meta: { id: COMPONENT_ID, parameters: {} } },
      preparedMeta: { parameters: {} },
    };
  },
};

type ContainerProps = PropsWithChildren<{ context: unknown; theme?: unknown }>;

const meta = {
  title: 'Internal/Docs Block',
  // `!dev` hides it from the sidebar, `!autodocs` gives it no Docs page of its
  // own, `!manifest` keeps it out of components.json. Storybook's defaults are
  // [dev, test, manifest], so `test` survives and the story still runs here.
  tags: ['!dev', '!autodocs', '!manifest'],
  parameters: {
    // The demo's own layout padding would offset nothing that matters here.
    layout: 'fullscreen',
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

type StoryCtx = { parameters: { docs?: { container?: unknown } } };

function DocsPageFixture({
  theme,
  container: Container,
}: {
  theme: unknown;
  container: ComponentType<ContainerProps>;
}) {
  return (
    <Container context={docsContext} theme={theme}>
      <h1>Card</h1>
    </Container>
  );
}

/**
 * Renders whatever `.storybook/preview.ts` set as `docs.container`, so this
 * exercises the global opt-in a consumer wires rather than a direct import.
 * The theme is passed explicitly instead of inherited from the preview, so the
 * two cases stay deterministic whether or not STORYBOOK_DARK is set.
 */
function renderWith(theme: unknown, context: StoryCtx) {
  const container = context.parameters.docs?.container as ComponentType<ContainerProps> | undefined;
  // Failing loudly beats rendering nothing: without the container this file
  // would assert against a blank canvas and only the findings would notice.
  if (!container) throw new Error('parameters.docs.container is unset; .storybook/preview.ts should set it');
  return <DocsPageFixture theme={theme} container={container} />;
}

/**
 * The theme tokens are hex and `getComputedStyle` returns `rgb()`, so one side
 * has to be converted. The unit tests hand-roll that because happy-dom echoes
 * whatever the stylesheet declared; here there is a real browser, so let it do
 * its own serialization and compare two strings it produced.
 */
function asPainted(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  document.body.appendChild(probe);
  const painted = getComputedStyle(probe).color;
  probe.remove();
  return painted;
}

/** Every non-report state `ReportView` can render, by its heading text. */
const EMPTY_STATES = [
  'Loading the components manifest…',
  'Manifest could not be parsed',
  'Components manifest unavailable',
  'No manifest entry for this component.',
  'Select a story to see its coverage.',
];

async function assertDocsBlock(canvasElement: HTMLElement, theme: StorybookTheme) {
  const canvas = within(canvasElement);

  // Card's two known findings, from the undocumented props in Card.tsx. The
  // rule id is the row header, so it is also the row's accessible name.
  // Assertions read the whole row's text: the block appends the prop names in
  // a separate element from the message, so no single node holds the sentence.
  const findingRow = async (rule: string) => (await canvas.findByRole('rowheader', { name: rule })).closest('tr');

  const required = await findingRow('required-prop-undocumented');
  await expect(required?.textContent).toContain('error');
  await expect(required?.textContent).toContain('Card has required prop without documentation.');
  await expect(required?.textContent).toContain('title');

  const descriptions = await findingRow('prop-descriptions-missing');
  await expect(descriptions?.textContent).toContain('warning');
  await expect(descriptions?.textContent).toContain('Card has 2 undocumented props.');
  await expect(descriptions?.textContent).toContain('elevated');

  // Findings being present is not proof the manifest arrived, but an empty
  // state still renders a heading, so the color assertions below would pass on
  // a run where the fetch 404'd. Rule the empty states out by name.
  for (const state of EMPTY_STATES) {
    await expect(canvas.queryByText(state)).not.toBeInTheDocument();
  }

  // The point of running this in a browser at all. On a real Docs page the
  // heading descends from addon-docs' `DocsContent`, whose
  // `& :where(h2:not(...))` rule sets `color: theme.color.defaultText` at (0,1,0),
  // the same specificity as `SectionHeading`'s own emotion class, leaving
  // stylesheet insertion order to decide. Assert the ancestor is really there,
  // then read what actually won.
  // Matched by suffix, not exact text: the real `Heading` nests addon-docs'
  // copy-the-URL anchor inside the h2, so the accessible name is "Copy heading
  // URL to address bar Oversight". The unit tests' mock renders a bare h2 and
  // reads it as plain "Oversight", which is the mock being more generous than
  // the component in one more way than #75 listed.
  const heading = canvas.getByRole('heading', { name: /Oversight$/ });
  const docsContent = canvasElement.querySelector('.sbdocs-content');
  await expect(docsContent).toBeInTheDocument();
  await expect(docsContent?.contains(heading)).toBe(true);

  const painted = getComputedStyle(heading).color;
  // Equal to the block's own token, and specifically not the value DocsContent
  // would impose. The two differ in both themes, so this discriminates, and
  // `textMutedColor` differs between themes, so the dark case is a real check
  // on inheritance rather than a restatement of the light one.
  await expect(painted).toBe(asPainted(theme.textMutedColor));
  await expect(painted).not.toBe(asPainted(theme.color.defaultText));
}

export const Light: Story = {
  render: function RenderLight(_args, context) {
    return renderWith(themes.light, context);
  },
  play: async ({ canvasElement }) => {
    await assertDocsBlock(canvasElement, ensure(themes.light));
  },
};

export const Dark: Story = {
  render: function RenderDark(_args, context) {
    return renderWith(themes.dark, context);
  },
  play: async ({ canvasElement }) => {
    await assertDocsBlock(canvasElement, ensure(themes.dark));
  },
};
