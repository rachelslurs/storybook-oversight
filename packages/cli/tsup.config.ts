import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20.19',
  clean: true,
  treeshake: true,
  // oversight-core is a devDependency (workspace:*), so tsup bundles it rather
  // than externalizing it. The CLI ships a self-contained dist with no runtime
  // dependencies. The shebang in src/cli.ts is preserved by esbuild.
});
