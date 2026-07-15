// Injected into the manager bundle so the classic JSX transform's
// `React.createElement` references resolve to a real import.
//
// The manager entry is built with the classic runtime (tsup.config.ts) on
// purpose: Storybook's manager globalizes `react` (→ __REACT__) but NOT
// `react/jsx-runtime`. With the automatic runtime, `react/jsx-runtime` gets
// bundled from the *consumer's* React, which mismatches the manager's React
// whenever they differ (e.g. React 19 consumer vs Storybook 10's React 18
// manager) and crashes with "Cannot read properties of undefined (reading
// 'recentlyCreatedOwnerStacks')". Routing JSX through the globalized `react`
// keeps a single React instance.
import * as React from 'react';

export { React };
