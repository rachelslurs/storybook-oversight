#!/usr/bin/env node

// Drives a built Storybook in a real browser and checks both surfaces the addon ships:
// the Docs block, which renders in the preview iframe, and the panel, which renders in
// the manager.
//
// Why this is a gate of its own rather than more stories. `@storybook/addon-vitest` puts
// `**/*.mdx` into `test.exclude` unconditionally, so no Docs entry can run as a test at
// any configuration. And story tests execute inside the preview, so nothing they can do
// reaches the manager. Between them that leaves the addon's two consumer-visible surfaces
// covered only by mocks: `stories/DocsBlock/DocsBlock.stories.tsx` hands the container a
// `resolveOf` written by hand, and the panel's unit tests mock `storybook/manager-api`
// outright. A fixture cannot disagree with the contract it is imitating.
//
// What is only observable here:
//   - `DocsRenderer` selecting and mounting `parameters.docs.container`.
//   - the real `DocsContext.resolveOf`, which `OversightDocsContainer` calls inside a bare
//     `catch {}`. A Storybook release that changes that contract drops the block from every
//     consumer's Docs page and logs nothing.
//   - addon-docs' `DocsContent` ancestor, whose `:where(h2:not(...))` rule sets a color at
//     the same specificity as the block's own class. It exists on no mocked page.
//   - the manager actually booting and registering the panel. This is what the classic-JSX
//     manager build and `src/react-shim.ts` exist for: with the automatic runtime, a
//     consumer on a different React major than Storybook's own crashes the manager on
//     `recentlyCreatedOwnerStacks`. That crash is invisible from the preview, so the
//     `compat` job's React 19 entry would otherwise pass while the manager was broken.
//
// What it does NOT cover: `ThemedRoot`'s fallback. That branch runs only when the block
// resolves as a second `storybook/theming` instance, and a `storybook build` dedupes the
// module to one, so the theme context resolves and the inherited branch is what runs here.
// The fallback stays guarded by the unit tests.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { chromium } from 'playwright';
import { ensure, themes } from 'storybook/theming';
import { repoRoot, report } from './published-packages.js';

const STATIC_DIR = join(repoRoot, 'storybook-static');
const PORT = Number(process.env.OVERSIGHT_DOCS_PORT ?? 6107);
const BASE = `http://127.0.0.1:${PORT}`;

// Findings come from a fetch, an effect and `buildReport`, so no row is there on first
// paint. Matches the story suite's allowance for a loaded CI runner.
const FINDING_TIMEOUT = 10_000;
// The manager boots the whole Storybook UI and then the addon registers into it, which is
// a longer wait than anything in the preview.
const MANAGER_TIMEOUT = 30_000;
const SERVER_TIMEOUT = 30_000;

// Card is the component whose findings are known, from the two deliberately undocumented
// props in `stories/Card/Card.tsx`. Overview is the demo's unattached MDX page: it has no
// component meta, so it is the other side of the `catch {}`.
const CARD_DOCS = 'data-display-card--docs';
const CARD_STORY = 'data-display-card--default';
const UNATTACHED_DOCS = 'overview--docs';

// Card's two findings, as the rule id that heads the row and the fragments the row has to
// mention. The row text is read whole because the block puts the message and the prop
// names in separate elements, so no single node holds the sentence.
const CARD_FINDINGS = [
  ['required-prop-undocumented', ['error', 'Card has required prop without documentation.', 'title']],
  ['prop-descriptions-missing', ['warning', 'Card has 2 undocumented props.', 'elevated']],
];

const docsUrl = (id) => `${BASE}/iframe.html?viewMode=docs&id=${id}`;
const storyUrl = (id) => `${BASE}/?path=/story/${id}`;

/**
 * `vite preview` rather than a hand-rolled static server: vite is already a root
 * devDependency and gets the content types right, which the block's fetch of
 * `manifests/components.json` depends on.
 *
 * `--host 127.0.0.1` because vite otherwise binds `[::1]` only, which reaches this process
 * through Node's happy-eyeballs and would not reach an older one. And note it serves the
 * SPA shell with a 200 for any unknown path, so "got a response" never means "got the
 * file", which is what the content-type check in the readiness poll is for.
 *
 * stderr is piped rather than dropped. The failure that matters is `--strictPort` losing
 * the port: the child dies immediately, and with its output discarded the only symptom
 * used to be a 30-second timeout that read like a slow build.
 */
function serveStaticBuild() {
  const child = spawn(
    join(repoRoot, 'node_modules/.bin/vite'),
    ['preview', '--outDir', 'storybook-static', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const state = { child, exited: false, code: null, stderr: '' };
  child.stderr?.on('data', (chunk) => {
    state.stderr += String(chunk);
  });
  child.on('exit', (code) => {
    state.exited = true;
    state.code = code;
  });
  child.on('error', (error) => {
    state.exited = true;
    state.stderr += error.message;
  });

  return state;
}

/**
 * Wait for OUR server, and prove it is ours.
 *
 * Readiness alone is not enough. When the port is already held, `--strictPort` makes the
 * child exit at once and every check below then runs against whatever else is listening:
 * another checkout, another worktree, or an orphan from an interrupted run. A foreign
 * build that happens to be good would make a broken local one pass, which is the exact
 * failure the freshness guard exists to prevent and cannot see, because it reads the disk
 * while the checks read a socket.
 *
 * So: fail the moment the child dies, and compare the served index against the one on
 * disk before trusting anything served on this port.
 */
async function waitForServer(server) {
  const deadline = Date.now() + SERVER_TIMEOUT;

  while (Date.now() < deadline) {
    if (server.exited) {
      throw new Error(
        `the preview server exited (code ${server.code}) instead of serving ${BASE}.\n` +
          `  Port ${PORT} is most likely already in use. Set OVERSIGHT_DOCS_PORT to pick another.\n` +
          (server.stderr.trim() ? `  vite said: ${server.stderr.trim().slice(0, 300)}` : ''),
      );
    }

    try {
      const res = await fetch(`${BASE}/index.json`);
      // A 200 alone would also be satisfied by the SPA fallback's HTML.
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) {
        const served = await res.text();
        const onDisk = readFileSync(join(STATIC_DIR, 'index.json'), 'utf8');
        if (served.trim() !== onDisk.trim()) {
          throw new Error(
            `${BASE} is serving a different build than ${STATIC_DIR}.\n` +
              '  Something else is on this port. Set OVERSIGHT_DOCS_PORT to pick another.',
          );
        }
        return;
      }
    } catch (error) {
      // A mismatch is a verdict, not a not-listening-yet.
      if (error.message.includes('serving a different build')) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${BASE} did not serve index.json within ${SERVER_TIMEOUT}ms.`);
}

/**
 * The theme tokens are hex and `getComputedStyle` returns `rgb()`, so one side has to be
 * converted. Let the same browser that painted the heading serialize the token too, rather
 * than hand-rolling the conversion: the comparison then cannot depend on notation.
 */
function asPainted(page, color) {
  return page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.appendChild(probe);
    const painted = getComputedStyle(probe).color;
    probe.remove();
    return painted;
  }, color);
}

/**
 * What the addon actually painted, for failure messages. Every empty state means zero
 * finding rows, so a missing row and an unreachable manifest fail identically; reading the
 * rendered text back is the difference between "no findings" and "Components manifest
 * unavailable". Read off the DOM rather than against a copy of the addon's empty state
 * strings, so a rewording there cannot leave this diagnostic quietly stale.
 *
 * The two surfaces need different roots, and getting this wrong is not hypothetical: an
 * earlier version looked for the block's `h2` on both. The block has one, because it uses
 * addon-docs' `Heading`; the manager has only a `div role="heading"`, so every panel
 * failure fell through to the whole document and reported Storybook's inline radix
 * scrollbar CSS instead of the panel's message.
 *
 * `innerText`, not `textContent`, for the same reason: `textContent` includes the contents
 * of inline `<style>` elements.
 */
function renderedText(page, surface) {
  return page.evaluate((which) => {
    const scope =
      which === 'panel'
        ? // The panel's own tabpanel. `[role="region"]` is the preview toolbar, not this.
          (document.querySelector('[role="tabpanel"]') ?? document.querySelector('#storybook-panel-root'))
        : [...document.querySelectorAll('h2')].find((h) => /Oversight$/.test((h.textContent ?? '').trim()))
            ?.nextElementSibling;

    const el = scope ?? document.body;
    const text = (el.innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ');
    return text.slice(0, 300) || '(nothing rendered)';
  }, surface);
}

const failures = [];
const passed = [];

async function check(name, run) {
  try {
    await run();
    passed.push(name);
  } catch (error) {
    failures.push({ name, message: error.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * Card's two findings, wherever they are being rendered.
 *
 * `visible`, not `attached`. `AddonPanel` hides an inactive panel with the `hidden`
 * attribute rather than unmounting it, so the rows stay in the DOM either way and
 * `attached` would pass for a panel nobody can see. Asserting on what the reader gets is
 * the point of running this in a browser at all.
 *
 * It is not what catches a wrong `match` predicate: that one is inert for `types.PANEL`,
 * so no assertion here can see it. See the comment in `manager.tsx`.
 */
async function assertCardFindings(page, surface) {
  for (const [rule, fragments] of CARD_FINDINGS) {
    const header = page.getByRole('rowheader', { name: rule });

    try {
      await header.first().waitFor({ state: 'visible', timeout: FINDING_TIMEOUT });
    } catch {
      throw new Error(`no "${rule}" row. The ${surface} rendered: ${await renderedText(page, surface)}`);
    }

    const row = await header.first().evaluate((el) => el.closest('tr')?.textContent ?? '');
    for (const fragment of fragments) {
      assert(row.includes(fragment), `the "${rule}" row does not mention "${fragment}". Row reads: ${row}`);
    }
  }
}

async function checkDocsBlock(page) {
  // The demo builds light unless STORYBOOK_DARK is set, so this reads the light tokens.
  // Both themes are already covered against a real container by the story suite; what is
  // new here is the DocsContent ancestor, and which rule wins the tie does not vary by
  // theme.
  const theme = ensure(themes.light);

  const docsContent = page.locator('.sbdocs-content');
  const heading = docsContent.getByRole('heading', { name: /Oversight$/ });

  // Inside the check, not before it. A navigation that throws outside one escapes `main`
  // and takes every failure already collected with it, so a run that had found something
  // real would report only the timeout.
  await check(`the Docs page mounts parameters.docs.container (${CARD_DOCS})`, async () => {
    await page.goto(docsUrl(CARD_DOCS), { waitUntil: 'domcontentloaded' });
    await docsContent.first().waitFor({ state: 'visible', timeout: FINDING_TIMEOUT });
    await heading.first().waitFor({ state: 'visible', timeout: FINDING_TIMEOUT });
  });

  await check("the real DocsContext resolves Card's findings", async () => {
    await assertCardFindings(page, 'block');
  });

  await check('the block heading outranks DocsContent, and paints the muted color', async () => {
    const painted = await heading.first().evaluate((el) => getComputedStyle(el).color);
    const muted = await asPainted(page, theme.textMutedColor);
    const defaultText = await asPainted(page, theme.color.defaultText);

    // The comparison below only discriminates while these two differ. If a Storybook theme
    // change ever made them equal, both assertions would pass against anything and this
    // check would quietly stop testing the tie it was written for.
    assert(
      muted !== defaultText,
      `textMutedColor and color.defaultText both paint ${muted}, so this check cannot tell ` +
        'which rule won. It needs two distinguishable tokens.',
    );

    // Print the painted value on failure, not just the expectation. That value is the
    // evidence that the DocsContent ancestor is present and took over, which is the one
    // thing a mocked page cannot show.
    assert(
      painted === muted,
      `the heading painted ${painted}; expected ${muted} (textMutedColor). ` +
        `DocsContent imposes ${defaultText} on an h2 that sets no color of its own.`,
    );
    assert(painted !== defaultText, `the heading painted ${painted}, which is DocsContent's ${defaultText}.`);
  });

  await check(`an unattached Docs page renders, without the block (${UNATTACHED_DOCS})`, async () => {
    await page.goto(docsUrl(UNATTACHED_DOCS), { waitUntil: 'domcontentloaded' });

    // Both halves, and in this order. Absence on its own passes when the page 404s to the
    // SPA shell, when the container never mounted, or when nothing has rendered yet;
    // asserting the page is really there first makes the absence mean what it claims:
    // the container ran and `resolveOf` threw, so it chose not to render the block.
    await page.locator('.sbdocs-content').first().waitFor({ state: 'visible', timeout: FINDING_TIMEOUT });
    await page.waitForTimeout(1_000);

    const blocks = await page.getByRole('heading', { name: /Oversight$/ }).count();
    assert(blocks === 0, `the block rendered on a page with no component meta (${blocks} heading(s) found).`);
  });
}

async function checkManagerPanel(page) {
  // Locators are scoped to the main frame, so nothing here can accidentally read the
  // preview iframe's copy of a finding. This is the manager document.
  const tab = page.getByRole('tab', { name: /Oversight/ });

  await check('the manager boots and the addon registers its panel', async () => {
    // A story, not a Docs page, because Storybook renders no addon panel region on a Docs
    // entry at all: not this one, not Controls. Not because of the `match` predicate in
    // `manager.tsx`, which is inert for `types.PANEL` and documented as such there.
    await page.goto(storyUrl(CARD_STORY), { waitUntil: 'domcontentloaded' });

    try {
      await tab.first().waitFor({ state: 'visible', timeout: MANAGER_TIMEOUT });
    } catch {
      throw new Error(
        `no Oversight tab in the manager after ${MANAGER_TIMEOUT}ms. ` +
          `The manager rendered: ${await renderedText(page, 'panel')}`,
      );
    }
  });

  await check("the panel reports Card's findings in the manager", async () => {
    await tab.first().click();
    await assertCardFindings(page, 'panel');
  });
}

const ADDON_BUNDLE = join(repoRoot, 'packages/storybook-addon-oversight/dist/blocks.js');

/**
 * Refuse a run whose inputs disagree, rather than reporting on the older one.
 *
 * The gate reads `storybook-static`, which inlines the addon from `dist`. When a build
 * fails partway, `dist` is newer than the site that was built from it, and the run silently
 * grades the previous build: a mutation looks reverted, a fix looks unshipped, and the
 * result is confidently wrong either way. The state this catches is an addon build that
 * succeeded followed by a `storybook build` that failed or was never run. A type error
 * does not produce it, because the addon's `prebuild` deletes `dist` first, which leaves
 * it absent and lands on the branch above.
 *
 * `dist` is the only input compared. `storybook-static` is also built from `stories/` and
 * `.storybook/`, and editing those and running this on its own still grades the old site.
 * Running it through `pnpm test`, or after `pnpm exec storybook build`, is what makes the
 * whole set current.
 */
function requireFreshBuild() {
  if (!existsSync(join(STATIC_DIR, 'index.json'))) {
    report(
      'No Storybook build to check',
      `Nothing at ${join(STATIC_DIR, 'index.json')}.\n` +
        'Run `pnpm exec storybook build` first. This gate reads the built site, so\n' +
        'passing without one would be a green run over nothing.',
    );
    process.exit(2);
  }

  if (!existsSync(ADDON_BUNDLE)) {
    report(
      'No addon build to check',
      `Nothing at ${ADDON_BUNDLE}.\nRun \`pnpm build\` first: the site under test inlines the addon from it.`,
    );
    process.exit(2);
  }

  const built = statSync(join(STATIC_DIR, 'index.json')).mtimeMs;
  const addon = statSync(ADDON_BUNDLE).mtimeMs;

  if (addon > built) {
    report(
      'The Storybook build is older than the addon',
      `${ADDON_BUNDLE}\nis newer than ${join(STATIC_DIR, 'index.json')}.\n\n` +
        'The site under test was built from an earlier addon, so this run would grade\n' +
        'the wrong artifact. Run `pnpm exec storybook build` again.',
    );
    process.exit(2);
  }
}

/**
 * Refuse when `@storybook/addon-docs` resolves more than once.
 *
 * `storybook/theming` is emotion, and emotion's theme context is per module instance. With
 * two copies of addon-docs in one build, the `ThemeProvider` the preview sets up belongs to
 * one instance and the components this addon renders belong to the other, so those read an
 * undefined theme and every `theme.*` interpolation throws. The Docs page does not degrade,
 * it goes blank, and the errors name neither this addon nor the duplicate.
 *
 * No version matrix finds this, because it is not a version problem: it is two versions at
 * once. It is how #93 was misread as "the addon does not work on Storybook 10.3", after a
 * matrix pinned three packages and left `@storybook/addon-vitest` to drag in a second
 * addon-docs behind them.
 *
 * Only the workspace's own `node_modules` directories are scanned, which is where pnpm puts
 * the second copy when two ranges disagree.
 */
function requireSingleAddonDocs() {
  const roots = [repoRoot];
  const packagesDir = join(repoRoot, 'packages');

  if (existsSync(packagesDir)) {
    for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(join(packagesDir, entry.name));
    }
  }

  const found = [];

  for (const root of roots) {
    const manifest = join(root, 'node_modules/@storybook/addon-docs/package.json');
    if (!existsSync(manifest)) continue;
    const { version } = JSON.parse(readFileSync(manifest, 'utf8'));
    found.push({ manifest, version });
  }

  if (found.length > 1) {
    report(
      'More than one @storybook/addon-docs',
      `${found.map(({ manifest, version }) => `${version}  ${manifest.replace(`${repoRoot}/`, '')}`).join('\n')}\n\n` +
        'Two copies mean two emotion instances, so the Docs page renders blank and the\n' +
        'errors blame addon-docs rather than whatever pulled the second copy in. Pin the\n' +
        'whole Storybook family to one version, or add a pnpm.overrides entry.',
    );
    process.exit(2);
  }
}

async function main() {
  requireFreshBuild();
  requireSingleAddonDocs();

  const server = serveStaticBuild();
  let browser;

  // An interrupted run used to leave `vite preview` holding the port, and the next run in
  // any checkout would then quietly adopt it. Handled here rather than only in `finally`,
  // which a signal never reaches.
  const stop = () => server.child.kill();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try {
    await waitForServer(server);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await checkDocsBlock(page);
    await checkManagerPanel(page);
  } finally {
    await browser?.close();
    server.child.kill();
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }

  if (failures.length > 0) {
    report('Built Storybook checks failed', failures.map(({ name, message }) => `${name}\n  ${message}`).join('\n\n'));
    process.exit(1);
  }

  // Name what passed. A gate that prints nothing on success reads exactly like one that
  // never ran, which is how `scripts/prepublish-checks.js` went unnoticed for as long as it
  // did.
  console.log(`${chalk.green('✔')} built Storybook checks passed against ${STATIC_DIR}:`);
  for (const name of passed) console.log(`  ${chalk.green('·')} ${name}`);
}

// Anything escaping `main` goes through `report` rather than a bare stack, so a navigation
// that throws cannot discard the failures already collected.
try {
  await main();
} catch (error) {
  const collected = failures.map(({ name, message }) => `${name}\n  ${message}`).join('\n\n');
  report(
    'Built Storybook checks could not finish',
    `${error.message}${collected ? `\n\nAlready found:\n\n${collected}` : ''}`,
  );
  process.exit(failures.length > 0 ? 1 : 2);
}
