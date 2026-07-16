import { Badge } from 'storybook/internal/components';
import { useStorybookApi } from 'storybook/manager-api';
import { PANEL_ID } from '../constants';
import { useOversightReport } from '../useOversightReport';

export function Title() {
  const api = useStorybookApi();
  const { status, report } = useOversightReport();
  const count = status === 'ready' ? (report?.diagnostics.length ?? 0) : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>Oversight</span>
      {count > 0 && (
        <Badge compact status={api.getSelectedPanel() === PANEL_ID ? 'active' : 'neutral'}>
          {count}
        </Badge>
      )}
    </div>
  );
}
