// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import { ReportView } from './ReportView';
import { buildReport, resolveManifestRefs } from 'oversight-core';
import type { RawManifest } from 'oversight-core';

// ReportView's `styled` components read `theme.*`, so every render needs a
// ThemeProvider (the same trick blocks.tsx uses for the docs block).
function renderView(ui: ReactElement) {
  return renderWith(ensure(themes.light), ui);
}

function renderWith(theme: ReturnType<typeof ensure>, ui: ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
}

/** The findings and the props both render a table, so tests name the one they mean. */
function propsTable(container: HTMLElement) {
  return [...container.querySelectorAll('table')].find((table) =>
    [...table.querySelectorAll('th')].some((th) => th.textContent?.trim() === 'Documented'),
  );
}

const DEBUGGER_URL = 'http://localhost/manifests/components.html';

/** A computed color, as whatever notation the DOM hands back, lowercased. */
function paintedColor(el: Element, property: 'color' | 'backgroundColor'): string {
  return getComputedStyle(el)[property].toLowerCase();
}

afterEach(cleanup);

describe('ReportView status states', () => {
  it('loading shows a manifest-loading message', () => {
    const { container } = renderView(<ReportView status="loading" debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('Loading the components manifest');
  });

  it('error shows the parse-error state, not an infinite spinner (guards #11)', () => {
    const { container } = renderView(<ReportView status="error" debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('Manifest could not be parsed');
    expect(container.textContent).toContain('browser console');
    expect(container.textContent).not.toContain('Loading the components manifest');
  });

  it('unavailable without a reason falls back to the addon-mcp hint', () => {
    const { container } = renderView(<ReportView status="unavailable" debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('Components manifest unavailable');
    expect(container.textContent).toContain('@storybook/addon-mcp');
  });

  it('unavailable with a reason shows the real cause, not the addon-mcp hint (guards #12)', () => {
    const reason =
      'Manifest "components" is not available in dev when experimentalDocgenServer is enabled. ' +
      'It is written on "storybook build", not served in dev.';
    const { container } = renderView(
      <ReportView status="unavailable" debuggerUrl={DEBUGGER_URL} unavailableReason={reason} />,
    );
    expect(container.textContent).toContain('experimentalDocgenServer');
    expect(container.textContent).toContain('storybook build');
    expect(container.textContent).not.toContain('@storybook/addon-mcp');
  });

  it('no-story and no-entry show their prompts', () => {
    const noStory = renderView(<ReportView status="no-story" debuggerUrl={DEBUGGER_URL} />);
    expect(noStory.container.textContent).toContain('Select a story');
    cleanup();
    const noEntry = renderView(<ReportView status="no-entry" debuggerUrl={DEBUGGER_URL} />);
    expect(noEntry.container.textContent).toContain('No manifest entry');
  });

  // The docs block renders title+description inline, not as an empty-tab state.
  // Splitting the states by variant left this branch uncovered, because the
  // pre-existing error/unavailable tests default to the panel.
  it('the docs block keeps a described state inline, with its heading', () => {
    const { container } = renderView(
      <ReportView
        status="unavailable"
        debuggerUrl={DEBUGGER_URL}
        variant="compact"
        unavailableReason="server said no"
      />,
    );
    expect(container.textContent).toContain('Components manifest unavailable');
    expect(container.textContent).toContain('server said no');
    // EmptyTabContent would dwarf the page; the inline branch must be what renders
    expect(container.querySelector('button')).toBeNull();
  });

  // The panel gets Storybook's centered EmptyTabContent; the docs block keeps
  // the inline message, which would otherwise dwarf the page it sits under.
  it('says the same thing in both variants, but not with the same markup', () => {
    const full = renderView(<ReportView status="no-entry" debuggerUrl={DEBUGGER_URL} variant="full" />);
    const fullHtml = full.container.innerHTML;
    expect(full.container.textContent).toContain('No manifest entry');
    cleanup();

    const compact = renderView(<ReportView status="no-entry" debuggerUrl={DEBUGGER_URL} variant="compact" />);
    expect(compact.container.textContent).toContain('No manifest entry');
    expect(compact.container.innerHTML).not.toBe(fullHtml);
  });
});

describe('ReportView prop shape', () => {
  // `prop-shape-unrecognized` only runs on the ref format, so reaching this
  // branch means hydrating a v:1 index whose prop payload carries neither a
  // string description nor a boolean required.
  it('says the prop rules did not run when the payload is unrecognized', async () => {
    const refIndex = {
      v: 1,
      meta: { docgen: 'react-component-meta' },
      components: {
        'ex-moved': {
          id: 'ex-moved',
          name: 'Moved',
          docgen: { $ref: './docgen/ex-moved.json#/components/ex-moved' },
          stories: { $ref: './story-docs/ex-moved.json#/components/ex-moved' },
        },
      },
    } as unknown as RawManifest;
    const resolved = await resolveManifestRefs(refIndex, () =>
      JSON.stringify({
        components: {
          'ex-moved': {
            path: './Moved.stories.tsx',
            reactComponentMeta: { description: 'A component.', props: { tone: { kind: 'moved' } } },
            stories: { 'ex-moved--basic': { id: 'ex-moved--basic', name: 'Basic' } },
          },
        },
      }),
    );

    const report = buildReport(resolved, 'ex-moved');
    expect(report.propShape).toBe('unrecognized');

    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('The prop rules did not run');
    // the table would be a coverage figure read from fields the rules rejected
    expect(propsTable(container)).toBeUndefined();
  });
});

describe('ReportView theming', () => {
  const manifest = {
    meta: { docgen: 'react-docgen-typescript' },
    components: {
      'ex-themed': {
        name: 'Themed',
        path: './Themed.stories.tsx',
        reactDocgenTypescript: {
          description: 'A component.',
          props: { label: { description: '', required: true, declarations: [] } },
        },
      },
    },
  } as unknown as RawManifest;

  // A heading sets no color of its own, so it takes the color of the section it
  // sits in. When that section painted a background and set no color, headings
  // fell back to the browser's black, which reads on a white Docs page and
  // disappears on a dark one.
  it.each([
    ['light', themes.light],
    ['dark', themes.dark],
  ])('paints a heading in the theme color, on the theme background (%s)', (_name, base) => {
    const theme = ensure(base);
    const report = buildReport(manifest, 'ex-themed');
    const { container } = renderWith(theme, <ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    // measured on the element that paints, not looked up in the stylesheet: a
    // rule can sit in the sheet and still lose to the page's own
    const heading = [...container.querySelectorAll('div')].find((el) => el.textContent?.trim() === 'Description');
    expect(heading).toBeTruthy();
    expect(paintedColor(heading!, 'color')).toBe(theme.color.defaultText.toLowerCase());

    const section = heading!.closest('section');
    expect(paintedColor(section!, 'backgroundColor')).toBe(theme.background.content.toLowerCase());
  });
});

describe('ReportView scrollable table regions', () => {
  const manifest = {
    meta: { docgen: 'react-docgen-typescript' },
    components: {
      'ex-button': {
        name: 'Button',
        path: './Button.stories.tsx',
        reactDocgenTypescript: {
          description: 'A button.',
          props: { label: { description: '', required: true, declarations: [] } },
        },
      },
    },
  } as unknown as RawManifest;

  // Nothing inside either table takes focus, so the scroll container itself
  // must, or a narrow panel leaves columns a keyboard user can neither reach
  // nor scroll to (axe: scrollable-region-focusable). And a focused region is
  // announced by its name, so each table's region needs its own.
  it('gives every table scroll container a tab stop and its own name', () => {
    // a mismatched expectation raises a manifest-level finding, so this one
    // render holds all three tables a report can show
    const report = buildReport(manifest, 'ex-button', { expectedExtractor: 'react-component-meta' });
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const regions = [...container.querySelectorAll('[role="region"]')];
    expect(regions.map((region) => region.getAttribute('aria-label'))).toEqual([
      'Manifest findings',
      'Findings',
      'Props',
    ]);
    for (const region of regions) {
      expect(region.getAttribute('tabindex')).toBe('0');
      expect(region.querySelector('table')).not.toBeNull();
    }
  });

  // The section's inset, the bleed on the table's scroll region, and each
  // cell's leading padding are one number read three ways. If they disagree,
  // either the table's text leaves the rail the rest of the section sits on,
  // or the rule under each row stops short of the container's edge.
  it('bleeds the table by exactly the inset its cells restore', () => {
    const report = buildReport(manifest, 'ex-button');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const region = container.querySelector('[role="region"][aria-label="Findings"]')!;
    const section = region.closest('section')!;
    const inset = getComputedStyle(section).paddingLeft;
    expect(inset).toBe('20px');
    expect(getComputedStyle(region).marginLeft).toBe(`-${inset}`);
    expect(getComputedStyle(region).marginRight).toBe(`-${inset}`);
    expect(getComputedStyle(region.querySelector('tbody th')!).paddingLeft).toBe(inset);
    // the last column has no successor to inset its text off the container
    // edge, so it carries the trailing inset itself
    const lastCell = region.querySelector('tbody tr')!.lastElementChild!;
    expect(getComputedStyle(lastCell).paddingRight).toBe(inset);
  });

  // The Docs page and the panel are both free to reset the browser's own focus
  // ring, and a tab stop nobody can see is a keyboard trapdoor, so the region
  // has to draw a ring of its own in each theme.
  it.each([
    ['light', themes.light],
    ['dark', themes.dark],
  ])('draws its own focus ring on the region (%s)', (_name, base) => {
    const theme = ensure(base);
    const report = buildReport(manifest, 'ex-button');
    renderWith(theme, <ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const rules = [...document.styleSheets].flatMap((sheet) => {
      try {
        return [...sheet.cssRules].map((rule) => rule.cssText);
      } catch {
        return [];
      }
    });
    // the shorthand reads back as longhands, so the check names them
    const ringed = rules.some(
      (rule) =>
        rule.includes(':focus-visible') &&
        rule.includes('outline-style: solid') &&
        rule.toLowerCase().includes(`outline-color: ${theme.color.secondary}`.toLowerCase()),
    );
    expect(ringed).toBe(true);
  });
});

describe('ReportView report rendering', () => {
  it('renders findings and a row per prop for a documented component', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-button': {
          name: 'Button',
          path: './Button.stories.tsx',
          reactDocgenTypescript: {
            description: 'A button.',
            props: {
              label: { description: '', required: true, declarations: [] },
              size: { description: 'The size.', required: false, declarations: [] },
            },
          },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-button');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('required-prop-undocumented');
    // every prop is listed, documented or not, and the mark in the last column
    // carries a label rather than leaving a glyph and a color to say it
    const rows = [...(propsTable(container)?.querySelectorAll('tbody tr') ?? [])].map((row) => {
      const cells = [...row.children];
      return [
        cells[0].textContent?.trim(),
        cells[1].textContent?.trim(),
        cells[2].querySelector('[role="img"]')?.getAttribute('aria-label'),
      ];
    });
    // the mark names the prop, so it does not read as an echo of the column
    // heading a screen reader announces immediately before it
    expect(rows).toEqual([
      ['label', 'Yes', 'label is undocumented'],
      ['size', 'No', 'size is documented'],
    ]);
  });

  it('names each row by its rule and its prop, so a cell resolves to more than its column', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-button': {
          name: 'Button',
          path: './Button.stories.tsx',
          reactDocgenTypescript: {
            description: 'A button.',
            props: { label: { description: '', required: true, declarations: [] } },
          },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-button');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const tables = [...container.querySelectorAll('table')];
    expect(tables.length).toBe(2);
    for (const table of tables) {
      for (const head of table.querySelectorAll('thead th')) {
        expect(head.getAttribute('scope')).toBe('col');
      }
      for (const row of table.querySelectorAll('tbody tr')) {
        const heading = row.querySelector('th');
        expect(heading?.getAttribute('scope')).toBe('row');
        // a cell that names its row is not the row's last cell, so the
        // trailing inset reserved for the last column must not reach it; the
        // gap between it and its neighbor is the neighbor's leading inset
        expect(heading).not.toBe(row.lastElementChild);
        expect(getComputedStyle(heading!).paddingRight).toBe('0px');
        expect(getComputedStyle(heading!.nextElementSibling!).paddingLeft).toBe('20px');
      }
    }
  });

  it('separates a struck manifest id from the mark that says why it is struck', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-tile': {
          name: 'Tile',
          path: './Tile.stories.tsx',
          reactDocgenTypescript: {
            description: 'See [Ghost](?path=/docs/ex-ghost--docs).',
            props: {},
          },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-tile');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const marks = [...container.querySelectorAll('[role="img"]')].filter(
      (m) => m.getAttribute('aria-label') === 'not in the manifest',
    );
    // one marks the dead link where the description reads it, one marks the id
    // the finding names
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      // read aloud, what is struck and the mark's label are adjacent, so with no
      // text node between them they run together as one word
      expect(mark.previousSibling?.nodeValue).toBe(' ');
    }
    const struck = marks.map((m) => m.previousSibling?.previousSibling?.textContent);
    expect(struck).toContain('ex-ghost--docs');
  });

  it('leads each findings row with its rule, then the severity', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-button': {
          name: 'Button',
          path: './Button.stories.tsx',
          reactDocgenTypescript: {
            description: 'A button.',
            props: { label: { description: '', required: true, declarations: [] } },
          },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-button');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    const findings = [...container.querySelectorAll('table')].find((table) =>
      [...table.querySelectorAll('th')].some((th) => th.textContent?.trim() === 'Severity'),
    );
    expect([...(findings?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent?.trim())).toEqual([
      'Rule',
      'Severity',
      'Message',
      'Hint',
    ]);
    // the rule heads its row, so it is the row's first cell as well as its name
    const first = findings?.querySelector('tbody tr')?.firstElementChild;
    expect(first?.tagName).toBe('TH');
    expect(first?.textContent?.trim()).toBe('required-prop-undocumented');
  });

  // The hint column is gone; the hint now rides the message cell as a button.
  // A screen-reader user gets the fix from the button's own name, without
  // having to open the tooltip it also triggers.
  it('names the hint trigger with the hint text itself', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-button': {
          name: 'Button',
          path: './Button.stories.tsx',
          reactDocgenTypescript: {
            description: 'A button.',
            props: { label: { description: '', required: true, declarations: [] } },
          },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-button');
    const hint = report.findings.find((d) => d.rule === 'required-prop-undocumented')?.hint;
    expect(hint).toBeTruthy();

    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    const row = [...container.querySelectorAll('tbody tr')].find(
      (r) => r.querySelector('th')?.textContent?.trim() === 'required-prop-undocumented',
    )!;
    const trigger = row.querySelector('button');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute('aria-label')).toContain(hint!);
    // the trigger has the Hint column to itself, so it centres in its row
    // rather than riding at the end of the message
    expect(trigger!.closest('td')).toBe(row.lastElementChild);
    const heads = [...row.closest('table')!.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(heads).toEqual(['Rule', 'Severity', 'Message', 'Hint']);
  });

  it('renders no trigger at all for a finding without a hint', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-old': {
          name: 'Old',
          path: './Old.stories.tsx',
          jsDocTags: { deprecated: 'Use New instead.' },
          reactDocgenTypescript: { description: 'An old component.', props: {} },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-old');
    expect(report.findings.find((d) => d.rule === 'deprecated-tag')?.hint).toBeUndefined();

    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    const row = [...container.querySelectorAll('tbody tr')].find(
      (r) => r.querySelector('th')?.textContent?.trim() === 'deprecated-tag',
    )!;
    // nothing to reveal, so nothing that looks revealable: a disabled button
    // would promise an answer that does not exist
    expect(row.querySelector('button')).toBeNull();
  });

  it('marks each section label as a heading, so the report is not skipped', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-doc': {
          name: 'Doc',
          path: './Doc.stories.tsx',
          reactDocgenTypescript: { description: 'Prose.', props: {} },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-doc');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);

    // bold text is a heading only to someone who can see it
    const label = [...container.querySelectorAll('*')].find(
      (el) => el.children.length === 0 && el.textContent?.trim() === 'Description',
    );
    expect(label?.getAttribute('role')).toBe('heading');
    expect(label?.getAttribute('aria-level')).toBe('3');
  });

  it('renders a positive no-findings state for a clean component', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-clean': {
          name: 'Clean',
          path: './Clean.stories.tsx',
          reactDocgenTypescript: { description: 'All documented.', props: {} },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-clean');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('no findings');
  });

  it('renders the extraction-failure section and a docgen-missing finding for a payload-less entry', () => {
    const manifest = {
      components: {
        'ex-broken': {
          name: 'Broken',
          path: './Broken.stories.tsx',
          error: { message: 'No component file found' },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-broken');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('Docgen extraction failed');
    expect(container.textContent).toContain('No component file found');
    expect(container.textContent).toContain('docgen-missing');
  });

  it('leads with the error name in the extraction and story sections (#34)', () => {
    const manifest = {
      components: {
        'ex-broken': {
          name: 'Broken',
          path: './Broken.stories.tsx',
          error: {
            name: 'react-docgen-typescript found no component docs',
            message: 'File: /repo/src/index.js\nno docs for this file.',
          },
          stories: [
            {
              id: 'ex-broken--basic',
              name: 'Basic',
              error: { name: 'SyntaxError', message: 'Expected story to be a function' },
            },
          ],
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-broken');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain(
      'Docgen extraction failed: react-docgen-typescript found no component docs: no docs for this file.',
    );
    expect(container.textContent).toContain('Basic failed extraction: SyntaxError: Expected story to be a function');
  });

  it('clamps a multi-line extraction error to one line in the finding and the section (guards #16)', () => {
    const manifest = {
      components: {
        'ex-broken': {
          name: 'Broken',
          path: './Broken.stories.tsx',
          error: { message: 'No component file found\nat parse (/src/Broken.tsx:1:1)' },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-broken');
    const { container } = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} />);
    expect(container.textContent).toContain('No component file found');
    expect(container.textContent).not.toContain('at parse');
  });

  it('renders the description prose in both variants', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-doc': {
          name: 'Doc',
          path: './Doc.stories.tsx',
          reactDocgenTypescript: { description: 'Prose both surfaces show.', props: {} },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-doc');

    const full = renderView(<ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} variant="full" />);
    expect(full.container.textContent).toContain('Prose both surfaces show.');
    cleanup();

    const compact = renderView(
      <ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} variant="compact" />,
    );
    expect(compact.container.textContent).toContain('Prose both surfaces show.');
  });
});
