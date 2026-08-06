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
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { chromium } from 'playwright';
import { ensure, themes } from 'storybook/theming';
import { repoRoot, report } from './published-packages.js';

const STATIC_DIR = join(repoRoot, 'storybook-static');
const PORT = Number(process.env.OVERSIGHT_DOCS_PORT ?? 6107);
const BASE = `http://localhost:${PORT}`;

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
 * Two of its behaviors this has to work around. It binds `[::1]` only, so `localhost`
 * resolves and `127.0.0.1` does not connect. And it serves the SPA shell with a 200 for
 * any unknown path, so "got a response" never means "got the file", which is what the
 * content-type check in the readiness poll below is for.
 */
function serveStaticBuild() {
  return spawn(
    join(repoRoot, 'node_modules/.bin/vite'),
    ['preview', '--outDir', 'storybook-static', '--port', String(PORT), '--strictPort'],
    { cwd: repoRoot, stdio: 'ignore' },
  );
}

async function waitForServer() {
  const deadline = Date.now() + SERVER_TIMEOUT;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/index.json`);
      // A 200 alone would also be satisfied by the SPA fallback's HTML.
      if (res.ok && (res.headers.get('content-type') ?? '').includes('json')) return;
    } catch {
      // Not listening yet.
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

/** Card's two findings, wherever they are being rendered. */
async function assertCardFindings(page, surface) {
  for (const [rule, fragments] of CARD_FINDINGS) {
    const header = page.getByRole('rowheader', { name: rule });

    try {
      await header.first().waitFor({ state: 'attached', timeout: FINDING_TIMEOUT });
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

  await page.goto(docsUrl(CARD_DOCS), { waitUntil: 'domcontentloaded' });

  const docsContent = page.locator('.sbdocs-content');
  const heading = docsContent.getByRole('heading', { name: /Oversight$/ });

  await check(`the Docs page mounts parameters.docs.container (${CARD_DOCS})`, async () => {
    await docsContent.first().waitFor({ state: 'attached', timeout: FINDING_TIMEOUT });
    await heading.first().waitFor({ state: 'attached', timeout: FINDING_TIMEOUT });
  });

  await check("the real DocsContext resolves Card's findings", async () => {
    await assertCardFindings(page, 'block');
  });

  await check('the block heading outranks DocsContent, and paints the muted color', async () => {
    const painted = await heading.first().evaluate((el) => getComputedStyle(el).color);
    const muted = await asPainted(page, theme.textMutedColor);
    const defaultText = await asPainted(page, theme.color.defaultText);

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
    await page.locator('.sbdocs-content').first().waitFor({ state: 'attached', timeout: FINDING_TIMEOUT });
    await page.waitForTimeout(1_000);

    const blocks = await page.getByRole('heading', { name: /Oversight$/ }).count();
    assert(blocks === 0, `the block rendered on a page with no component meta (${blocks} heading(s) found).`);
  });
}

async function checkManagerPanel(page) {
  // A story, not a Docs page, because the manager renders no addon panel region at all on
  // a Docs entry: not this one, not Controls, not Actions. Note this is NOT because of the
  // `match: ({ viewMode }) => viewMode === 'story'` in `manager.tsx`. Building that line as
  // `'docs'` instead leaves the tab exactly where it was on the story URL, so the line has
  // no observable effect on either surface and is not what makes this URL the right one.
  await page.goto(storyUrl(CARD_STORY), { waitUntil: 'domcontentloaded' });

  // Locators are scoped to the main frame, so nothing here can accidentally read the
  // preview iframe's copy of a finding. This is the manager document.
  const tab = page.getByRole('tab', { name: /Oversight/ });

  await check('the manager boots and the addon registers its panel', async () => {
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
 * result is confidently wrong either way. `tsc` runs before `tsup` in the addon's build,
 * so a type error is enough to produce exactly that state.
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

async function main() {
  requireFreshBuild();

  const server = serveStaticBuild();
  let browser;

  try {
    await waitForServer();
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await checkDocsBlock(page);
    await checkManagerPanel(page);
  } finally {
    await browser?.close();
    server.kill();
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

await main();
