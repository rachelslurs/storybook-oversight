// Only the manager's declaration pass reads this, via tsconfig.manager.json.
//
// That bundle is built with the classic JSX runtime, so tsc's checker wants
// `React` as a value in scope for the `React.createElement` calls it expects.
// esbuild supplies it at bundle time by injecting src/react-shim.ts, and the
// declaration pass does not run esbuild, so it sees an undeclared UMD global.
//
// Declaring it here rather than importing React in src/manager.tsx keeps the
// main typecheck (jsx: react-jsx, automatic runtime) free of an import it would
// reject as unused under noUnusedLocals. Kept out of src/ so the root tsconfig,
// which includes only src, never picks up a global React.
import type * as ReactNamespace from 'react';

declare global {
  const React: typeof ReactNamespace;
}

export {};
