# v0.1.3 (Thu Jul 16 2026)

#### 🐛 Bug Fix

- docs: note experimentalDocgenServer is not yet supported [#15](https://github.com/rachelslurs/storybook-addon-oversight/pull/15) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- test: add a happy-dom harness and ReportView render tests ([@rachelslurs](https://github.com/rachelslurs))
- test: characterize that normalize throws on the ref-based index ([@rachelslurs](https://github.com/rachelslurs))
- style: left-align the status messages and drop em dashes ([@rachelslurs](https://github.com/rachelslurs))
- fix: state the real cause when the components manifest is unavailable ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.2 (Thu Jul 16 2026)

#### 🐛 Bug Fix

- fix: show an error state instead of hanging when the manifest can't be parsed [#14](https://github.com/rachelslurs/storybook-addon-oversight/pull/14) ([@rachelslurs](https://github.com/rachelslurs))
- docs: troubleshoot docgen-missing + add issue templates [#10](https://github.com/rachelslurs/storybook-addon-oversight/pull/10) ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.1 (Wed Jul 15 2026)

#### 🐛 Bug Fix

- fix: build manager with classic JSX runtime to avoid dual-React crash [#8](https://github.com/rachelslurs/storybook-addon-oversight/pull/8) ([@rachelslurs](https://github.com/rachelslurs))
- chore: regenerate block and drift screenshots for the a11y update [#7](https://github.com/rachelslurs/storybook-addon-oversight/pull/7) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- docs: add blog post link to README for additional context ([@rachelslurs](https://github.com/rachelslurs))
- ci: use GH_TOKEN so Auto can push past the main ruleset ([@rachelslurs](https://github.com/rachelslurs))
- ci: add CODEOWNERS so rulesets can require my review ([@rachelslurs](https://github.com/rachelslurs))
- ci: give Auto a GitHub-linked author for release commits ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.1.0 (Tue Jul 14 2026)

#### 🚀 Enhancement

- chore: update binary assets for findings and oversight panel [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- fix(a11y): make severity colors WCAG AA and lighten the panel [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: restructure README opening and add an animated hero [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: apply writing-style edits to README and Overview [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs(demo): add a Findings-section crop to the Overview [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs(demo): make Panel a valid @oversightIgnore example, drop unknown-ignore-rule [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- feat: surface findings as named lint rules in the panel and docs block [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))
- docs: scope the "authoring" section to authoring, not all linting [#6](https://github.com/rachelslurs/storybook-addon-oversight/pull/6) ([@rachelslurs](https://github.com/rachelslurs))

#### 🐛 Bug Fix

- fix: center the Overview icon [#5](https://github.com/rachelslurs/storybook-addon-oversight/pull/5) ([@rachelslurs](https://github.com/rachelslurs))
- docs: expand the demo Overview (screenshots + icon + light theme) [#4](https://github.com/rachelslurs/storybook-addon-oversight/pull/4) ([@rachelslurs](https://github.com/rachelslurs))
- style: polish the demo components with Tailwind [#3](https://github.com/rachelslurs/storybook-addon-oversight/pull/3) ([@rachelslurs](https://github.com/rachelslurs))
- ci: host the demo Storybook on GitHub Pages [#2](https://github.com/rachelslurs/storybook-addon-oversight/pull/2) ([@rachelslurs](https://github.com/rachelslurs))
- ci: PR-based, label-driven release workflow [#1](https://github.com/rachelslurs/storybook-addon-oversight/pull/1) ([@rachelslurs](https://github.com/rachelslurs))

#### ⚠️ Pushed to `main`

- docs: remove em-dashes from the Overview and README ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))

---

# v0.0.1 (Mon Jul 13 2026)

#### ⚠️ Pushed to `main`

- docs: add logo to the README and a favicon to the demo Storybook ([@rachelslurs](https://github.com/rachelslurs))
- chore: add the addon icon and point the catalog at it ([@rachelslurs](https://github.com/rachelslurs))
- chore: wire up CI, Auto release, and prepublish checks ([@rachelslurs](https://github.com/rachelslurs))
- docs: write the README ([@rachelslurs](https://github.com/rachelslurs))
- feat(demo): add a demo Storybook that dogfoods the addon ([@rachelslurs](https://github.com/rachelslurs))
- feat(blocks): add the Docs-page coverage block ([@rachelslurs](https://github.com/rachelslurs))
- feat(manager): add the Oversight panel ([@rachelslurs](https://github.com/rachelslurs))
- feat(core): normalize and lint the Storybook components manifest ([@rachelslurs](https://github.com/rachelslurs))
- build: configure package, TypeScript, tsup, vitest, and ESLint ([@rachelslurs](https://github.com/rachelslurs))
- Initial commit ([@rachelslurs](https://github.com/rachelslurs))

#### Authors: 1

- rachel cantor ([@rachelslurs](https://github.com/rachelslurs))
