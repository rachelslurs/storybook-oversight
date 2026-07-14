## What & why

<!-- Briefly describe the change and the reason for it. -->

## Release impact

Releases are versioned from PR labels. **Add exactly one:**

- `patch` — backwards-compatible bug fix
- `minor` — backwards-compatible new feature
- `major` — breaking change
- `skip-release` — no version change (docs, CI, chore)

Add **`release`** as well when this PR should publish the accumulated changes to
npm. (No `release` label → it merges and accumulates, but nothing publishes.)

## Checklist

- [ ] `pnpm test` passes
- [ ] `pnpm lint` passes
- [ ] Docs / README updated if behavior changed
