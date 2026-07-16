// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import { ReportView } from './ReportView';
import { buildReport } from '../core';
import type { RawManifest } from '../core';

// ReportView's `styled` components read `theme.*`, so every render needs a
// ThemeProvider (the same trick blocks.tsx uses for the docs block).
function renderView(ui: ReactElement) {
  return render(<ThemeProvider theme={ensure(themes.light)}>{ui}</ThemeProvider>);
}

const DEBUGGER_URL = 'http://localhost/manifests/components.html';

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
});

describe('ReportView report rendering', () => {
  it('renders findings and the undocumented-props list for a documented component', () => {
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
    expect(container.textContent).toContain('1/2 props documented');
    expect(container.textContent).toContain('required, undocumented');
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
    expect(container.textContent).toContain('No findings');
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

  it('compact variant shows a Documented verdict instead of the description prose', () => {
    const manifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ex-doc': {
          name: 'Doc',
          path: './Doc.stories.tsx',
          reactDocgenTypescript: { description: 'Prose that compact should hide.', props: {} },
        },
      },
    } as unknown as RawManifest;
    const report = buildReport(manifest, 'ex-doc');
    const { container } = renderView(
      <ReportView status="ready" report={report} debuggerUrl={DEBUGGER_URL} variant="compact" />,
    );
    expect(container.textContent).toContain('Documented');
    expect(container.textContent).not.toContain('Prose that compact should hide');
  });
});
