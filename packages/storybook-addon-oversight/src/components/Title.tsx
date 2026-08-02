import { Badge } from 'storybook/internal/components';
import { styled } from 'storybook/theming';
import { useStorybookApi } from 'storybook/manager-api';
import { PANEL_ID } from '../constants';
import { useOversightReport } from '../useOversightReport';

/** Read aloud, never shown: the clip-rect pattern, which keeps the text in the
 *  accessibility tree where `display: none` would drop it. */
const ScreenReaderOnly = styled.span({
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
});

export function Title() {
  const api = useStorybookApi();
  const { status, report } = useOversightReport();
  const count = status === 'ready' ? (report?.findings.length ?? 0) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>Oversight</span>
      {count > 0 && (
        <Badge compact status={api.getSelectedPanel() === PANEL_ID ? 'active' : 'neutral'}>
          {count}
          {/* the tab reads "Oversight 2" without this, and a bare count says
              nothing about what was counted */}
          <ScreenReaderOnly>{count === 1 ? ' finding' : ' findings'}</ScreenReaderOnly>
        </Badge>
      )}
    </div>
  );
}
