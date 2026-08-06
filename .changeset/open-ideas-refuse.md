---
'storybook-addon-oversight': patch
---

Restore the Storybook peer range to `^10.3.0`. `0.6.0` narrowed it to `^10.5.0` on a faulty measurement: the version matrix behind it resolved two copies of `@storybook/addon-docs` at once. Two copies mean two theme contexts, so the Docs block reads an undefined theme and takes the whole Docs page down, and every version tested that way failed. That read as "10.3 and 10.4 are broken" when what was broken was the harness.

With one resolved copy, the addon renders correctly on 10.3.0, 10.3.6, 10.4.0 and 10.4.6, checked against a real built Docs page and a real manager panel. If you moved off 10.3 or 10.4 because of `0.6.0`, you did not need to.

The duplicate is a real failure mode at any version, and nothing in the resulting error names this addon or the extra copy, so the requirement is now stated in the README, `0.6.1` warns about it at startup, and CI refuses when more than one copy resolves.
