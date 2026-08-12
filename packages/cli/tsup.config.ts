import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20.19',
  clean: true,
  treeshake: true,
  // oversight-core and oversight-agent-view are devDependencies (workspace:*),
  // so tsup bundles them rather than externalizing them. The shebang in
  // src/cli.ts is preserved by esbuild.
  //
  // `@storybook/mcp` must not be bundled: it is the package whose output
  // `oversight agent-view` prints, and a bundled copy would render text no
  // installed version is responsible for. Listing it in `dependencies` is what
  // keeps it out, since tsup externalizes every dependency and peerDependency by
  // name. Moving it to devDependencies to bundle it is #116, and an `external`
  // entry here would then fight that move rather than guard it.
});
