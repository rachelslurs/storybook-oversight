import { useEffect, useLayoutEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { DocsContainer, Heading, useOf } from '@storybook/addon-docs/blocks';
import type { DocsContainerProps } from '@storybook/addon-docs/blocks';
import { ThemeProvider, ensure, styled, themes, useTheme } from 'storybook/theming';
import { buildReport } from 'oversight-core';
import type { RawManifest } from 'oversight-core';
import { getService } from 'storybook/preview-api';
import { createManifestLoad } from './manifestLoad';
import type { GetService } from './manifestLoad';
import { createManifestSource } from './manifestSource';
import { DEFAULT_DEBUGGER_LINK } from './config';
import type { OversightConfig } from './config';
import { ReportView } from './components/ReportView';
import type { ReportViewStatus } from './components/ReportView';
import { isAbsoluteTarget } from './components/markdown';

/**
 * The section heading Storybook's own Docs blocks use for "Stories", built from
 * the same theme tokens. Their styled component is internal to addon-docs and
 * its class names are emotion hashes, so tokens are the stable surface: this
 * follows whatever theme the Docs page is rendered with.
 *
 * `Heading` carries the copy-the-URL control every other heading on the page
 * has. Its own id is slugged from the text on each render, and this block
 * renders again when the manifest arrives, so the second pass would take
 * `oversight-1` and the link would name nothing. The id is passed instead,
 * which overrides the slug. Only one block per page carries it; see
 * `useAnchorId`.
 */
const SectionHeading = styled(Heading)<{ id?: string }>(({ theme }) => ({
  fontSize: `${theme.typography.size.s2 - 1}px`,
  fontWeight: theme.typography.weight.bold,
  lineHeight: '16px',
  letterSpacing: '0.35em',
  textTransform: 'uppercase',
  color: theme.textMutedColor,
  border: 0,
  margin: '56px 0 12px',
}));

// `SectionHeading` supplies the heading above, including its bottom margin.
const Container = styled.div(({ theme }) => ({
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  overflow: 'hidden',
  margin: '0 0 2rem',
  fontSize: theme.typography.size.s2,
  // The last section's border-bottom is redundant with the container border.
  '& > :last-child': { borderBottom: 'none' },
}));

// The loaded manifest is cached across block instances (one load per page),
// but the per-component analysis is NOT. Each block runs `buildReport` with its
// OWN page's lint options.
//
// URLs resolve against the iframe document (dropping `iframe.html`), correct at
// the root and under a subpath deploy. The load owns the transport: fetch, v:1
// ref resolution, and the service-API fallback for dev under
// `experimentalDocgenServer`, through the preview runtime's `getService` (the
// cast widens its typed service-id parameter to the structural seam).
const resolveManifestUrl = (name: string) => new URL(`manifests/${name}`, document.baseURI).href;
const manifest = createManifestSource({
  urlFor: resolveManifestUrl,
  load: createManifestLoad({ resolveUrl: resolveManifestUrl, getService: getService as GetService }),
});

// Warm the network path when the blocks bundle evaluates (preview-iframe load),
// so opening a Docs page doesn't wait on a cold fetch. Failures aren't cached,
// so an early miss just retries when the block renders.
void manifest.load();

const ANCHOR_ID = 'oversight';

/** Whether a block on this page already owns the anchor. */
let anchorClaimed = false;

/**
 * Both documented setups can land on one page: the global container appends a
 * block and a component's MDX may also place `<Oversight />`. Duplicate DOM ids
 * are invalid and `getElementById` returns only the first, so the first block to
 * mount owns `#oversight` and any second one renders without an id.
 */
function useAnchorId(): string | undefined {
  const [id, setId] = useState<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (anchorClaimed) return;
    anchorClaimed = true;
    setId(ANCHOR_ID);
    return () => {
      anchorClaimed = false;
    };
  }, []);
  return id;
}

type MetaOf = {
  csfFile: { meta: { id?: string; parameters?: { oversight?: OversightConfig } } };
};

/**
 * The same findings the Oversight addons panel shows, rendered inline on
 * the current component's Docs page.
 * Reads which component it documents from `useOf("meta")`. Requires the
 * components-manifest feature (e.g. `@storybook/addon-mcp`).
 */
/** Preview-side link. The manager's version SPA-navigates through
 *  `api.selectStory`, which is manager-api and unreachable from here, so the
 *  block links by URL instead: `./` is the Storybook root beside `iframe.html`,
 *  and `_top` moves the page rather than the frame the block sits in.
 *
 *  Only a relative target gets that rebasing: descriptions also carry absolute
 *  http(s) links, and `./`-prefixing one sends the tab to
 *  `<storybook-origin>/https://…`, a 404 that has also dropped the user out of
 *  Storybook. The split is on whether the target names its own origin, not on
 *  whether it parses as a story id: `?path=` carrying `&args=` or a `#hash`
 *  names no id and still has to resolve against the root, because leaving it
 *  alone resolves it against `iframe.html` and loads the preview frame as the
 *  whole page. The manager can pass a target through untouched, being on the
 *  document those already resolve against; here that is the one thing that
 *  cannot be done. Absolute targets get `rel` so a private Storybook host
 *  doesn't leak in the Referer to whatever site a description cites;
 *  `noreferrer` implies `noopener`, kept explicit for modified clicks that
 *  open a new tab. */
function DocsLink({ label, target }: { label: string; target: string }) {
  const external = isAbsoluteTarget(target);
  return (
    <a href={external ? target : `./${target}`} target="_top" rel={external ? 'noopener noreferrer' : undefined}>
      {label}
    </a>
  );
}

export function Oversight() {
  const anchorId = useAnchorId();
  const meta = useOf('meta', ['meta']) as unknown as MetaOf;
  const componentId = meta.csfFile.meta.id;
  const options = meta.csfFile.meta.parameters?.oversight ?? {};

  const [raw, setRaw] = useState<RawManifest | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    manifest.load().then((loaded) => {
      if (!cancelled) setRaw(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Analyze per-component with THIS page's options (rules/expectedExtractor):
  // the shared cache holds only the raw manifest, so per-page config is honored.
  let status: ReportViewStatus;
  let report;
  if (raw === 'loading') {
    status = 'loading';
  } else if (raw === null) {
    // a served-but-unparseable body is the opposite diagnosis from a missing
    // manifest: the feature answered, so pointing at addon-mcp would be wrong
    status = manifest.parseFailed() ? 'error' : 'unavailable';
  } else if (componentId === undefined) {
    status = 'no-entry';
  } else {
    // `buildReport` runs normalize/analyze synchronously in render, so a
    // malformed/unsupported manifest would throw here and crash the Docs page.
    // Degrade to the error state instead, the same guarantee the addons panel
    // makes (never hang or crash on a bad manifest).
    try {
      report = buildReport(raw, componentId, options);
      status = report.found ? 'ready' : 'no-entry';
    } catch (err) {
      console.error('[storybook-addon-oversight] could not analyze the components manifest', err);
      status = 'error';
    }
  }

  return (
    <ThemedRoot>
      <SectionHeading id={anchorId}>Oversight</SectionHeading>
      <Container>
        {/* compact keeps the nothing-to-show states inline, which a full-height
              centered one would dwarf on a page. The description and the props
              are shown in full: a dangling `?path=` link is struck where it is
              read, and the page's own copies of both mark nothing. */}
        <ReportView
          status={status}
          report={report}
          debuggerUrl={manifest.urlFor('components.html')}
          variant="compact"
          LinkComponent={DocsLink}
          showDebuggerLink={options.debuggerLink ?? DEFAULT_DEBUGGER_LINK}
          unavailableReason={manifest.unavailableReason()}
        />
      </Container>
    </ThemedRoot>
  );
}

/**
 * Re-provides a Storybook theme on THIS bundle's emotion instance. The block is
 * a separate Vite-optimized dep, so addon-docs' ThemeProvider context does not
 * reach our `styled` components. Without this, `theme` is empty and every
 * `theme.*` interpolation throws.
 *
 * The surrounding theme is inherited whenever the context resolves, which is
 * the case on a Docs page, so a project that themes its Storybook gets a block
 * themed with it. The fallback only runs when the context does not resolve, and
 * it matches what `DocsContainer` itself falls back to for an unset theme, so
 * the block never disagrees with the page it sits in. Reading the OS preference
 * here would: the OS is not the page's theme.
 */
function ThemedRoot({ children }: { children: ReactNode }) {
  const inherited = useTheme();
  const theme = inherited?.typography ? inherited : ensure(themes.light);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/**
 * Docs-page container: renders Storybook's standard DocsContainer and, on
 * component pages, appends the Oversight coverage block. This is the GLOBAL
 * opt-in: a consumer enables it for every Docs page with one line in
 * `.storybook/preview.ts`:
 *
 *   import { OversightDocsContainer } from "storybook-addon-oversight/blocks";
 *   const preview = { parameters: { docs: { container: OversightDocsContainer } } };
 *
 * Delete that line to remove it from every page. Unattached MDX pages (an
 * Overview with no `of`) get the plain container: there's no component to
 * diagnose. (For per-page control instead, place `<Oversight/>`
 * in an individual MDX rather than using this container.)
 */
export function OversightDocsContainer({ children, ...props }: PropsWithChildren<DocsContainerProps>) {
  const { context } = props;
  let hasComponent = false;
  try {
    context.resolveOf('meta', ['meta']);
    hasComponent = true;
  } catch {
    // Unattached docs page, so no component meta to resolve.
  }
  return (
    <DocsContainer {...props}>
      {children}
      {hasComponent && <Oversight />}
    </DocsContainer>
  );
}
