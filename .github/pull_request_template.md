## What & why

<!-- Briefly describe the change and the reason for it. -->

## Release impact

Releases are versioned with Changesets. Run `pnpm changeset` and select the
affected packages and bump levels.

For a change that needs no release, such as docs, CI, or a chore, run
`pnpm changeset add --empty`.

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] Docs / README updated if behavior changed
- [ ] Changeset added
