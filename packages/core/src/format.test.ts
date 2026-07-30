import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectManifestFormat } from './format';
import type { RawManifest } from './types';

function loadFixture(path: string): RawManifest {
  const url = new URL(`../test/fixtures/${path}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as RawManifest;
}

describe('detectManifestFormat (fixtures: the three captured shapes)', () => {
  it('reads the committed react-docgen-typescript manifest as inline', () => {
    expect(detectManifestFormat(loadFixture('components.json'))).toEqual({ kind: 'inline' });
  });

  it('reads a v:0 react-component-meta manifest as inline', () => {
    const raw = loadFixture('v0-react-component-meta/components.json');
    expect(raw.meta?.docgen).toBe('react-component-meta');
    expect(detectManifestFormat(raw)).toEqual({ kind: 'inline' });
  });

  it('reads the v:1 docgen-server index as ref', () => {
    const raw = loadFixture('v1/manifests/components.json');
    expect(detectManifestFormat(raw)).toEqual({ kind: 'ref' });
  });

  it('does not key off meta.docgen: the same label spans both shapes', () => {
    const inline = loadFixture('v0-react-component-meta/components.json');
    const ref = loadFixture('v1/manifests/components.json');
    expect(inline.meta?.docgen).toBe(ref.meta?.docgen);
    expect(detectManifestFormat(inline)).not.toEqual(detectManifestFormat(ref));
  });
});

describe('detectManifestFormat (synthetic: edges)', () => {
  it('treats an absent v as inline', () => {
    expect(detectManifestFormat({ components: {} })).toEqual({ kind: 'inline' });
  });

  it('reports an unknown version rather than throwing, and names it', () => {
    expect(detectManifestFormat({ v: 2, components: {} })).toEqual({
      kind: 'unsupported',
      version: 2,
    });
    expect(() => detectManifestFormat({ v: 99 })).not.toThrow();
  });
});
