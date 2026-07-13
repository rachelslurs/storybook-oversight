import { useEffect, useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { DocsContainer, useOf } from '@storybook/addon-docs/blocks';
import type { DocsContainerProps } from '@storybook/addon-docs/blocks';
import { ThemeProvider, ensure, styled, themes, useTheme } from 'storybook/theming';
import { buildReport } from './core';
import type { RawManifest } from './core';
import { DEFAULT_DEBUGGER_LINK } from './config';
import type { OversightConfig } from './config';
import { ReportView } from './components/ReportView';
import type { ReportViewStatus } from './components/ReportView';

const Container = styled.div(({ theme }) => ({
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  overflow: 'hidden',
  margin: '2rem 0',
  fontSize: theme.typography.size.s2,
  // The last section's border-bottom is redundant with the container border.
  '& > :last-child': { borderBottom: 'none' },
}));

const CaptionBar = styled.div(({ theme }) => ({
  padding: '8px 16px',
  borderBottom: `1px solid ${theme.appBorderColor}`,
  background: theme.background.hoverable,
  fontSize: theme.typography.size.s1,
  fontWeight: theme.typography.weight.bold,
  color: theme.textMutedColor,
  letterSpacing: '0.35em',
  textTransform: 'uppercase',
}));

/** Manifest + debugger URLs relative to the iframe document (drops
 *  `iframe.html`; correct at root and under a subpath deploy). */
function manifestUrl(name: string): string {
  return new URL(`manifests/${name}`, document.baseURI).href;
}

// The fetched manifest is cached across block instances (one fetch per page),
// but the per-component analysis is NOT — each block runs `buildReport` with its
// OWN page's lint options. A failed fetch is not cached, so a later Docs page
// retries instead of being wedged in the `unavailable` state for the session.
let manifestPromise: Promise<RawManifest | null> | undefined;

async function fetchManifest(): Promise<RawManifest | null> {
  try {
    const response = await fetch(manifestUrl('components.json'));
    if (!response.ok) return null;
    return (await response.json()) as RawManifest;
  } catch {
    return null;
  }
}

function loadManifest(): Promise<RawManifest | null> {
  manifestPromise ??= fetchManifest().then((manifest) => {
    if (manifest === null) manifestPromise = undefined; // don't cache failures
    return manifest;
  });
  return manifestPromise;
}

// Warm the network path when the blocks bundle evaluates (preview-iframe load),
// so opening a Docs page doesn't wait on a cold fetch. Failures aren't cached
// (above), so an early miss just retries when the block renders.
void loadManifest();

type MetaOf = {
  csfFile: { meta: { id?: string; parameters?: { oversight?: OversightConfig } } };
};

/**
 * A documentation-coverage panel for the current component's Docs page —
 * the same diagnostics the Oversight manager panel shows, surfaced inline.
 * Reads which component it documents from `useOf("meta")`. Requires the
 * components-manifest feature (e.g. `@storybook/addon-mcp`).
 */
export function Oversight() {
  const meta = useOf('meta', ['meta']) as unknown as MetaOf;
  const componentId = meta.csfFile.meta.id;
  const options = meta.csfFile.meta.parameters?.oversight ?? {};

  const [manifest, setManifest] = useState<RawManifest | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadManifest().then((loaded) => {
      if (!cancelled) setManifest(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Analyze per-component with THIS page's options (rules/expectedExtractor):
  // the shared cache holds only the raw manifest, so per-page config is honored.
  let status: ReportViewStatus;
  let report;
  if (manifest === 'loading') {
    status = 'loading';
  } else if (manifest === null) {
    status = 'unavailable';
  } else if (componentId === undefined) {
    status = 'no-entry';
  } else {
    report = buildReport(manifest, componentId, options);
    status = report.found ? 'ready' : 'no-entry';
  }

  return (
    <ThemedRoot>
      <Container>
        <CaptionBar>Oversight</CaptionBar>
        {/* compact: autodocs renders the description prose right below us, so
            we show a documented/missing verdict, not the full text. */}
        <ReportView
          status={status}
          report={report}
          debuggerUrl={manifestUrl('components.html')}
          variant="compact"
          showDebuggerLink={options.debuggerLink ?? DEFAULT_DEBUGGER_LINK}
        />
      </Container>
    </ThemedRoot>
  );
}

/**
 * Re-provides a Storybook theme on THIS bundle's emotion instance. The block is
 * a separate Vite-optimized dep, so addon-docs' ThemeProvider context does not
 * reach our `styled` components — without this, `theme` is empty and every
 * `theme.*` interpolation throws. Inherit the surrounding theme when the context
 * does resolve; otherwise fall back to Storybook's light theme.
 */
function ThemedRoot({ children }: { children: ReactNode }) {
  const inherited = useTheme();
  const theme = inherited?.typography ? inherited : ensure(themes.light);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/**
 * Docs-page container: renders Storybook's standard DocsContainer and, on
 * component pages, appends the Oversight coverage block. This is the GLOBAL
 * opt-in — a consumer enables it for every Docs page with one line in
 * `.storybook/preview.ts`:
 *
 *   import { OversightDocsContainer } from "storybook-addon-oversight/blocks";
 *   const preview = { parameters: { docs: { container: OversightDocsContainer } } };
 *
 * Delete that line to remove it from every page. Unattached MDX pages (an
 * Overview with no `of`) get the plain container — there's no component to
 * diagnose, so no block. (For per-page control instead, place `<Oversight/>`
 * in an individual MDX rather than using this container.)
 */
export function OversightDocsContainer({ context, children }: PropsWithChildren<DocsContainerProps>) {
  let hasComponent = false;
  try {
    context.resolveOf('meta', ['meta']);
    hasComponent = true;
  } catch {
    // Unattached docs page — no component meta to resolve.
  }
  return (
    <DocsContainer context={context}>
      {children}
      {hasComponent && <Oversight />}
    </DocsContainer>
  );
}
