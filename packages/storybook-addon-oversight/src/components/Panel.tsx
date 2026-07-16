import type React from 'react';
import { AddonPanel } from 'storybook/internal/components';
import { useStorybookApi } from 'storybook/manager-api';
import { styled } from 'storybook/theming';
import { useOversightReport } from '../useOversightReport';
import { ReportView } from './ReportView';
import { storybookPathId } from './markdown';

interface PanelProps {
  active?: boolean;
}

// The redirect-link visual: a dotted underline that firms up on hover.
const InlineLink = styled.a(({ theme }) => ({
  color: theme.color.secondary,
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textDecorationColor: theme.appBorderColor,
  textUnderlineOffset: 2,
  '&:hover': {
    textDecorationStyle: 'solid',
    textDecorationColor: theme.color.secondary,
  },
}));

/** Manager-side link: SPA-navigates via `api.selectStory`, href as fallback. */
function ManagerLink({ label, target }: { label: string; target: string }) {
  const api = useStorybookApi();
  const id = storybookPathId(target);
  return (
    <InlineLink
      href={target}
      onClick={(event: React.MouseEvent) => {
        // Modified/middle clicks keep native behavior (open in new tab/window).
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
          return;
        }
        if (!id) return; // external target — let the browser handle it
        try {
          api.selectStory(id);
          event.preventDefault();
        } catch {
          // selectStory throws "Unknown id or title" for ids absent from the
          // manager index — keep the href fallback alive.
        }
      }}
    >
      {label}
    </InlineLink>
  );
}

export function Panel({ active }: PanelProps) {
  const { status, report, debuggerUrl, showDebuggerLink, unavailableReason } = useOversightReport();
  return (
    <AddonPanel active={active ?? false}>
      <ReportView
        status={status}
        report={report}
        debuggerUrl={debuggerUrl}
        variant="full"
        LinkComponent={ManagerLink}
        showDebuggerLink={showDebuggerLink}
        unavailableReason={unavailableReason}
      />
    </AddonPanel>
  );
}
