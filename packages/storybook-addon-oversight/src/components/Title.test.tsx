// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ThemeProvider, ensure, themes } from 'storybook/theming';
import type { ComponentReport } from 'oversight-core';
import { PANEL_ID } from '../constants';
import type { ManagerReport } from '../useOversightReport';
import { Title } from './Title';

// The tab title is manager-only: `useStorybookApi` exists in the manager bundle
// and nowhere a story test can reach, so both it and the report hook are
// replaced. The subject is what the title makes of a count, not how it arrives.
const state = vi.hoisted(() => ({
  report: {} as ManagerReport,
  selectedPanel: 'storybook/another/panel',
}));

vi.mock('storybook/manager-api', () => ({
  useStorybookApi: () => ({ getSelectedPanel: () => state.selectedPanel }),
}));

vi.mock('../useOversightReport', () => ({
  useOversightReport: () => state.report,
}));

const DEBUGGER_URL = 'http://localhost/manifests/components.html';

/** Only `findings.length` is read here, so the report carries just that. */
function managerReport(status: ManagerReport['status'], findingCount: number): ManagerReport {
  return {
    status,
    report: {
      findings: Array.from({ length: findingCount }, (_, i) => ({ rule: `rule-${i}` })),
    } as unknown as ComponentReport,
    debuggerUrl: DEBUGGER_URL,
    showDebuggerLink: true,
  };
}

function renderTitle() {
  return render(
    <ThemeProvider theme={ensure(themes.light)}>
      <Title />
    </ThemeProvider>,
  );
}

/** The badge, found by what it says rather than by its emotion class. */
function badge(container: HTMLElement) {
  return [...container.querySelectorAll('div')].find((el) => /^\d+\s+findings?$/.test(el.textContent?.trim() ?? ''));
}

beforeEach(() => {
  state.report = managerReport('ready', 0);
  state.selectedPanel = 'storybook/another/panel';
});

afterEach(cleanup);

describe('Title', () => {
  it('names the addon with no badge when the component is clean', () => {
    const { container } = renderTitle();

    expect(container.textContent).toContain('Oversight');
    expect(badge(container)).toBeUndefined();
  });

  it('counts the findings in a badge', () => {
    state.report = managerReport('ready', 3);
    const { container } = renderTitle();

    expect(badge(container)?.textContent?.trim()).toBe('3 findings');
  });

  it('says what was counted, so the tab does not read "Oversight 2"', () => {
    state.report = managerReport('ready', 2);
    const { container } = renderTitle();

    // the count alone is in the accessibility tree either way; the noun is the
    // part that only exists because of the screen-reader span
    expect(container.textContent).toContain('2 findings');
  });

  it('keeps the noun singular for one finding', () => {
    state.report = managerReport('ready', 1);
    const { container } = renderTitle();

    expect(container.textContent).toContain('1 finding');
    expect(container.textContent).not.toContain('1 findings');
  });

  it.each(['loading', 'error', 'unavailable', 'no-story', 'no-entry'] as const)(
    'withholds the count while the analysis is %s, even holding a stale report',
    (status) => {
      // a count drawn from a report the panel is not showing would assert
      // coverage the panel cannot back up
      state.report = managerReport(status, 4);
      const { container } = renderTitle();

      expect(badge(container)).toBeUndefined();
    },
  );

  it('highlights the badge only while Oversight is the open panel', () => {
    state.report = managerReport('ready', 2);
    state.selectedPanel = PANEL_ID;
    const { container: selected } = renderTitle();
    const active = getComputedStyle(badge(selected)!).backgroundColor;

    cleanup();
    state.selectedPanel = 'storybook/another/panel';
    const { container: unselected } = renderTitle();
    const neutral = getComputedStyle(badge(unselected)!).backgroundColor;

    // asserting the two differ, rather than naming a hex, keeps this about the
    // badge changing state and lets Storybook restyle its own component
    expect(active).not.toBe('');
    expect(active).not.toBe(neutral);
  });
});
