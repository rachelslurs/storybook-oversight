import { addons, types } from 'storybook/manager-api';

import { Panel } from './components/Panel';
import { Title } from './components/Title';
import { ADDON_ID, PANEL_ID } from './constants';

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: Title,
    // Inert on Storybook 10.5, and kept anyway. The type declares that `match`
    // decides the `active` prop, but for `types.PANEL` that prop tracks which
    // tab is selected, so this predicate changes nothing. Building it as
    // `viewMode === 'docs'` leaves the tab in the same place on a story and the
    // findings just as visible, which is how that was established rather than
    // assumed.
    //
    // What keeps the panel off Docs pages is Storybook itself: it renders no
    // addon panel region there at all, not this one and not Controls. So this
    // line states the intent correctly without being what enforces it, and it
    // is the value we would want if a release started honoring it. Deleting it
    // would be the change that carries risk, not keeping it.
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => <Panel active={active} />,
  });
});
