# Contributing

Thanks for helping improve **storybook-addon-oversight**!

## Development

```bash
pnpm install
pnpm build        # tsc typecheck + tsup bundle → dist/
pnpm test         # unit tests (vitest)
pnpm lint
pnpm storybook    # demo Storybook that dogfoods the addon
```

Diagnostic logic lives as pure functions in `src/core/` (zero Storybook
imports); the manager panel and Docs block are thin renderers over it.

## Pull requests

All changes land through pull requests to `main`.

1. Branch off `main` and commit with clear messages.
2. Open a PR. CI runs build / test / lint, and a **label check** runs.
3. **Add exactly one SemVer label** so the release tooling knows the version bump:

   | Label          | Bump  | Use for                                      |
   | -------------- | ----- | -------------------------------------------- |
   | `major`        | x.0.0 | breaking changes                             |
   | `minor`        | 0.x.0 | new, backwards-compatible features           |
   | `patch`        | 0.0.x | backwards-compatible bug fixes               |
   | `skip-release` | none  | docs, CI, chores — no version change          |

   The label check stays red until one of these is present.
4. Merge once CI is green.

## Releasing

Releases are **on-demand** — merging a labeled PR does **not** publish by itself.

To cut a release, add the **`release`** label to the PR you're merging (alongside
its SemVer label). When it lands on `main`, [Auto](https://intuit.github.io/auto)
computes the next version from every SemVer label since the last release,
publishes to npm, updates `CHANGELOG.md`, tags the commit, and creates a GitHub
release.

Without a `release` label, changes merge and accumulate but nothing publishes —
so you can batch several PRs into one version when you're ready.
