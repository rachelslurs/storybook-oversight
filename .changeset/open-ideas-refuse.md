---
'storybook-addon-oversight': patch
---

Restore the Storybook peer range to `^10.3.0`. `0.6.0` narrowed it to `^10.5.0` on a faulty measurement: the matrix that produced it pinned `storybook`, `@storybook/react-vite` and `@storybook/addon-docs` but left `@storybook/addon-vitest` alone, which pulled a second `@storybook/addon-docs` in behind them. Two copies mean two emotion instances, so the Docs block reads an undefined theme and takes the whole Docs page down. Every version tested that way failed, which read as "10.3 and 10.4 are broken" when it was the harness that was broken.

With one resolved copy of `@storybook/addon-docs`, the addon renders correctly on 10.3.0, 10.3.6, 10.4.0 and 10.4.6, checked against a real built Docs page and a real manager panel. If you moved off 10.3 or 10.4 because of `0.6.0`, you did not need to.

The duplicate itself is a real failure mode at any version, and nothing in the resulting error names this addon or the extra copy, so the requirement is now stated in the README and CI refuses when more than one copy resolves.
