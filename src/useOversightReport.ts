import { useEffect, useState } from 'react';
import { addons, useStorybookState } from 'storybook/manager-api';
import { analyzeManifest, resolveComponent } from './core';
import type { ComponentReport, ManifestAnalysis, RawManifest } from './core';
import { DEFAULT_DEBUGGER_LINK } from './config';
import type { OversightConfig } from './config';
import type { ReportViewStatus } from './components/ReportView';
import { ADDON_ID } from './constants';

export type ManagerReport = {
  status: ReportViewStatus;
  report?: ComponentReport;
  /** URL of Storybook's manifest debugger page (footer link). */
  debuggerUrl: string;
  /** Whether to render the debugger footer link (`debuggerLink` config). */
  showDebuggerLink: boolean;
};

/**
 * Manifest URLs must resolve against the page URL (document base), not this
 * bundle's URL — the manager script is served from /sb-addons/. Works in dev
 * (/) and deployed under a subpath (e.g. /my-storybook/).
 */
function manifestsBaseUrl(): string {
  const base = window.location.pathname.replace(/index\.html$/, '');
  return `${base.endsWith('/') ? base : `${base}/`}manifests/`;
}

// The raw manifest is static per page load. Kick the network fetch off the
// instant the manager bundle evaluates (see the `void loadManifest()` below),
// so the panel/badge don't wait for the first hook mount. Only the manifest is
// fetched here — no config is read — so it's safe to run before
// `.storybook/manager.ts` calls `addons.setConfig`.
let manifestPromise: Promise<RawManifest | null> | undefined;

async function fetchManifest(): Promise<RawManifest | null> {
  try {
    const response = await fetch(`${manifestsBaseUrl()}components.json`);
    if (!response.ok) return null;
    return (await response.json()) as RawManifest;
  } catch {
    return null;
  }
}

// A failed fetch is not cached, so a later mount retries instead of being
// wedged in the `unavailable` state for the session (e.g. if the bundle-eval
// prefetch raced the dev server's manifest endpoint).
function loadManifest(): Promise<RawManifest | null> {
  manifestPromise ??= fetchManifest().then((manifest) => {
    if (manifest === null) manifestPromise = undefined;
    return manifest;
  });
  return manifestPromise;
}

// Analysis (normalize → lint) runs once, the first time a hook mounts — by then
// `.storybook/manager.ts` has applied `addons.setConfig`, so the consumer's
// `rules`/`expectedExtractor` are read. Cached for the session, shared across
// story changes.
let analysisPromise: Promise<ManifestAnalysis | null> | undefined;

function loadAnalysis(): Promise<ManifestAnalysis | null> {
  analysisPromise ??= loadManifest().then((manifest) => {
    if (manifest === null) {
      analysisPromise = undefined; // don't cache failures — retry on next mount
      return null;
    }
    // Config channel: consumers tune rules via
    // `addons.setConfig({ [ADDON_ID]: { rules, expectedExtractor } })` in
    // .storybook/manager.ts (addon options never reach the manager bundle).
    const options = (addons.getConfig()[ADDON_ID] ?? {}) as OversightConfig;
    return analyzeManifest(manifest, options);
  });
  return analysisPromise;
}

// Warm the network path at bundle-eval; the config-dependent analysis still
// waits for the first hook mount.
void loadManifest();

export function useOversightReport(): ManagerReport {
  const [analysis, setAnalysis] = useState<ManifestAnalysis | null | 'loading'>('loading');
  // Display config is read synchronously (unlike `rules`/`expectedExtractor`,
  // which are baked into the module-cached analysis). `getConfig()` is cheap.
  const config = (addons.getConfig()[ADDON_ID] ?? {}) as OversightConfig;
  const base = {
    debuggerUrl: `${manifestsBaseUrl()}components.html`,
    showDebuggerLink: config.debuggerLink ?? DEFAULT_DEBUGGER_LINK,
  };

  useEffect(() => {
    let cancelled = false;
    loadAnalysis().then((loaded) => {
      if (!cancelled) setAnalysis(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whole-store subscription: re-renders on story changes (a11y's pattern).
  const { storyId } = useStorybookState();

  if (analysis === 'loading') return { status: 'loading', ...base };
  if (analysis === null) return { status: 'unavailable', ...base };
  // Manifest is loaded but Storybook hasn't selected a story yet (initial mount
  // / root URL) — distinct from a still-loading manifest, so don't show a spinner.
  if (!storyId) return { status: 'no-story', ...base };

  // Match by manifest key = story-id component prefix
  // ("actions-button--css-check" → "actions-button"). Never consult the
  // manager index (api.getData): docsMode filters story-type entries out of it,
  // so index lookups return undefined even while the story renders.
  const componentId = [...analysis.result.components, ...analysis.result.failures]
    .map((entry) => entry.id)
    .find((id) => storyId === id || storyId.startsWith(`${id}--`));
  if (componentId === undefined) return { status: 'no-entry', ...base };

  return { status: 'ready', report: resolveComponent(analysis, componentId), ...base };
}
