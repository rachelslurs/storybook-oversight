# Contributing

This is a pnpm workspace with three packages: `oversight-core` (the private rules engine), `storybook-addon-oversight` (the addon), and `oversight-lint` (the CLI). See the [root README](./README.md) for the layout.

## Development

```bash
pnpm install
pnpm -r build        # build every package (tsc typecheck + tsup bundle)
pnpm -r test         # unit tests across core, addon, and cli
pnpm lint
pnpm build-storybook # build the addon, then the demo Storybook
pnpm storybook       # run the demo at http://localhost:6006
```

Prefix either Storybook command with `STORYBOOK_DARK=1` to render the Docs pages dark. Text that sets no color of its own falls back to the browser's black, which reads on a white page and disappears on a dark one, so both surfaces are worth a look before changing how either is styled.

Every rule lives as a pure function in `oversight-core` (zero Storybook imports). The panel and the Docs block are thin renderers over it, and the CLI runs the same rules, so a rule change ships to all three at once.

## Pull requests

All changes land through pull requests to `main`.

1. Branch off `main` and commit with clear messages.
2. Add a changeset describing the version bump per package:

   ```bash
   pnpm changeset
   ```

   It asks which packages changed and at what bump (patch, minor, major) and writes a small file under `.changeset/`. Commit that file with your PR. For a change that needs no release (docs, CI, chores), record that explicitly:

   ```bash
   pnpm changeset add --empty
   ```

3. Open a PR. CI runs build, test, and lint, and the PR check stays red until a changeset is present.
4. Merge once CI is green.

`oversight-core` is private, so changesets never version or publish it. Its changes ride along in the addon and CLI bumps that depend on it.

## Releasing

Releases are on-demand. Merging a PR with changesets does not publish by itself.

On merge to `main`, [Changesets](https://github.com/changesets/changesets) opens a **Version Packages** PR that consumes the accumulated changeset files, bumps each package independently, and updates the per-package `CHANGELOG.md`. Changesets from several merged PRs accumulate in that one PR, so you can batch them. When you merge the Version Packages PR, the changed packages publish to npm.

### Before releasing a change to the GitHub step summary

The summary is markdown rendered against a repository, so the string the CLI writes and the string a reader sees are different. A release once escaped `@deprecated` as `&#64;deprecated`, which reads as fixed in the file and decodes back into a link to a GitHub account of that name.

Render it through GitHub rather than reading what was emitted:

```bash
GITHUB_ACTIONS=1 GITHUB_STEP_SUMMARY=/tmp/summary.md \
  node packages/cli/dist/cli.js storybook-static/manifests/components.json >/dev/null

gh api /markdown -f mode=gfm -f context=<owner>/<repo> \
  -f text="$(cat /tmp/summary.md)" | grep -c 'user-mention'
```

Zero is the pass, and a second run proves the check can fail: put an unescaped mention and a reference number that resolves in the repository you pass as `context` into the same document, and confirm both link. A reference to an issue that does not exist passes whether or not the escaping works.
