import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildReport } from './report';
import type { RawManifest } from './types';

function loadFixture(): RawManifest {
  const url = new URL('../test/fixtures/components.json', import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

describe('buildReport (fixture)', () => {
  const manifest = loadFixture();

  it('resolves a documented component with no findings', () => {
    const report = buildReport(manifest, 'forms-textfield');
    expect(report.found).toBe(true);
    expect(report.component?.name).toBe('TextField');
    expect(report.findings).toHaveLength(0);
  });

  it('resolves Card and Stack', () => {
    const card = buildReport(manifest, 'data-display-card');
    expect(card.found).toBe(true);
    expect(card.component?.name).toBe('Card');
    expect(card.findings).toHaveLength(0);

    const stack = buildReport(manifest, 'layout-stack');
    expect(stack.found).toBe(true);
    expect(stack.component?.name).toBe('Stack');
    expect(stack.findings).toHaveLength(0);
  });

  it('resolves an extraction-failed entry with its findings', () => {
    const report = buildReport(
      {
        components: {
          broken: {
            name: 'Broken',
            path: './broken.stories.tsx',
            error: { message: 'no component file' },
            stories: [{ id: 'broken--all', name: 'All', error: 'no snippet' }],
          },
        },
      },
      'broken',
    );
    expect(report.found).toBe(true);
    expect(report.failure?.name).toBe('Broken');
    expect(report.component).toBeUndefined();
    expect(report.findings.map((d) => d.rule).sort()).toEqual(['docgen-missing', 'story-extraction-error']);
    expect(report.storyFailures).toHaveLength(1);
  });

  it('reports not-found for an unknown id', () => {
    const report = buildReport(manifest, 'does-not-exist');
    expect(report.found).toBe(false);
    expect(report.component).toBeUndefined();
    expect(report.failure).toBeUndefined();
    expect(report.findings).toHaveLength(0);
  });

  it('routes manifest-level extractor-drift to manifestFindings, not per-component', () => {
    const drift: RawManifest = {
      meta: { docgen: 'react-docgen' }, // ≠ the expectation stated below
      components: {
        'ui-thing': {
          name: 'Thing',
          path: './thing.stories.tsx',
          description: 'A well documented thing.',
          reactDocgen: {
            description: 'A well documented thing.',
            props: { label: { description: 'The label.', required: true } },
          },
        },
      },
    };
    const report = buildReport(drift, 'ui-thing', { expectedExtractor: 'react-docgen-typescript' });
    // The component itself is clean, so drift must not leak into its findings/count.
    expect(report.findings).toHaveLength(0);
    expect(report.manifestFindings.map((d) => d.rule)).toEqual(['extractor-drift']);
    expect(report.manifestFindings[0].severity).toBe('warning');
    expect(report.manifestFindings[0].componentId).toBeNull();
  });

  it('has no manifest-level findings when the extractor matches the expectation', () => {
    const clean: RawManifest = {
      meta: { docgen: 'react-docgen-typescript' },
      components: {
        'ui-thing': {
          name: 'Thing',
          path: './thing.stories.tsx',
          description: 'A well documented thing.',
          reactDocgenTypescript: {
            description: 'A well documented thing.',
            props: { label: { description: 'The label.', required: true } },
          },
        },
      },
    };
    expect(
      buildReport(clean, 'ui-thing', { expectedExtractor: 'react-docgen-typescript' }).manifestFindings,
    ).toHaveLength(0);
  });

  it('passes lint options through to the resolved findings', () => {
    const report = buildReport(
      {
        components: {
          broken: {
            name: 'Broken',
            path: './broken.stories.tsx',
            error: { message: 'no component file' },
            stories: [{ id: 'broken--all', name: 'All', error: 'no snippet' }],
          },
        },
      },
      'broken',
      {
        rules: { 'docgen-missing': 'off', 'story-extraction-error': 'off' },
      },
    );
    expect(report.found).toBe(true);
    expect(report.failure?.name).toBe('Broken');
    expect(report.findings).toHaveLength(0);
  });
});
