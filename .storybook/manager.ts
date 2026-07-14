import { addons } from 'storybook/manager-api';
import { themes } from 'storybook/theming';

/*
 * Demonstrates Oversight's config channel. Addon options can't reach the manager
 * bundle, so consumers configure the panel here and the addon reads it back via
 * `addons.getConfig()['storybook-addon-oversight']`. Uncomment to try it.
 */
addons.setConfig({
  // Pin the demo to the light theme so it matches the README/branding.
  theme: themes.light,
  'storybook-addon-oversight': {
    // expectedExtractor: 'react-docgen-typescript',
    // debuggerLink: false, // hide the manifest-debugger footer link
    rules: {
      // Valid values: 'off' | 'error' | 'warning' | 'info'.
      // 'deprecated-tag': 'off',
      // 'prop-descriptions-missing': 'error',
    },
  },
});
