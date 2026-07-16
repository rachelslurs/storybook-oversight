import { pathLinkPattern } from './pathLinks';
import type { Diagnostic, DiagnosticRule, DiagnosticSeverity, NormalizeResult, RuleSetting } from './types';

export type LintOptions = {
  /** The extractor the project pins in `.storybook/main.ts`. */
  expectedExtractor?: string;
  /**
   * Per-rule overrides: remap a rule's severity or turn it `"off"`.
   * Unlisted rules keep their default severity; unrecognized values are
   * ignored (the rule keeps its default) rather than propagated.
   */
  rules?: Partial<Record<DiagnosticRule, RuleSetting>>;
};

// Exhaustive by construction: `satisfies Record<DiagnosticRule, true>` fails to
// compile if a rule is added to the union without a key here, so ALL_RULES can't
// silently drift out of sync (which would make @oversightIgnore <new-rule> warn
// "unknown rule" even though the exemption works).
const RULE_SET = {
  'docgen-missing': true,
  'story-extraction-error': true,
  'extractor-drift': true,
  'component-description-missing': true,
  'prop-descriptions-missing': true,
  'required-prop-undocumented': true,
  'docs-link-dangling': true,
  'unknown-ignore-rule': true,
  'deprecated-tag': true,
} satisfies Record<DiagnosticRule, true>;
const ALL_RULES = Object.keys(RULE_SET) as DiagnosticRule[];

const VALID_SETTINGS: ReadonlySet<string> = new Set<RuleSetting>(['off', 'error', 'warning', 'info']);

function splitTokens(value: string): string[] {
  // Split on whitespace as well as commas/newlines — `@oversightIgnore a b`
  // (the natural JSDoc form) must parse the same as the comma-separated form.
  return value
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/**
 * `@oversightIgnore` on a component's JSDoc exempts it from lint rules while
 * keeping it in the manifest (unlike Storybook's `!manifest` tag, which hides
 * it from agents entirely). Bare tag → exempt from every rule; a comma- or
 * newline-separated rule list → exempt from those rules only.
 */
function isIgnored(ignoreValue: string | undefined, rule: DiagnosticRule): boolean {
  if (ignoreValue === undefined) return false;
  const tokens = splitTokens(ignoreValue);
  if (tokens.length === 0) return true;
  return tokens.includes(rule);
}

// `?path=/docs|story/<id>` targets embedded in description prose. Shared with
// the panel's link parser via core/pathLinks so the two can't drift.
const PATH_LINK_PATTERN = pathLinkPattern();

export function lint(result: NormalizeResult, options: LintOptions = {}): Diagnostic[] {
  const expectedExtractor = options.expectedExtractor ?? 'react-docgen-typescript';
  const diagnostics: Diagnostic[] = [];

  if (result.extractor !== expectedExtractor) {
    diagnostics.push({
      rule: 'extractor-drift',
      severity: 'warning',
      componentId: null,
      message: `Manifest was extracted with "${result.extractor}" but this project expects "${expectedExtractor}" — prop docs may be incomplete.`,
    });
  }

  for (const failure of result.failures) {
    diagnostics.push({
      rule: 'docgen-missing',
      severity: 'error',
      componentId: failure.id,
      message: `Docgen extraction failed for ${failure.name}: ${failure.error ?? 'unknown error'}`,
    });
  }

  for (const storyFailure of result.storyFailures) {
    diagnostics.push({
      rule: 'story-extraction-error',
      severity: 'warning',
      componentId: storyFailure.componentId,
      message: `Story "${storyFailure.storyName}" failed extraction: ${storyFailure.error ?? 'unknown error'}`,
    });
  }

  // Manifest ids of every entry (including failed ones) — the resolvable
  // targets for the `?path=` links inside description prose.
  const knownIds = new Set<string>();
  const nameById = new Map<string, string>();
  for (const entry of [...result.components, ...result.failures]) {
    knownIds.add(entry.id);
    nameById.set(entry.id, entry.name);
  }

  // Redirect links in the component description hardcode manifest ids, so a
  // renamed story title leaves them dead — this rule catches them. Only the
  // description is scanned: that's the sanctioned redirect channel, and
  // scanning arbitrary tag values (e.g. an @example) would false-positive.
  function lintPathLinks(id: string, name: string, description: string | null) {
    if (!description) return;
    const dangling = new Set<string>();
    for (const match of description.matchAll(PATH_LINK_PATTERN)) {
      const componentPrefix = match[1].split('--')[0];
      if (!knownIds.has(componentPrefix)) dangling.add(match[1]);
    }
    if (dangling.size > 0) {
      diagnostics.push({
        rule: 'docs-link-dangling',
        severity: 'error',
        componentId: id,
        message: `${name} links to unknown manifest ids: ${[...dangling].join(', ')}.`,
        targets: [...dangling],
      });
    }
  }

  for (const component of result.components) {
    const componentTags = result.tags[component.id] ?? {};

    if (component.description === null) {
      diagnostics.push({
        rule: 'component-description-missing',
        severity: 'warning',
        componentId: component.id,
        message: `${component.name} has no component description — the MCP and Docs tab describe it as nothing.`,
      });
    }

    const undocumented = Object.entries(component.props)
      .filter(([, prop]) => prop.description === null)
      .map(([name]) => name);
    if (undocumented.length > 0) {
      diagnostics.push({
        rule: 'prop-descriptions-missing',
        severity: 'warning',
        componentId: component.id,
        message: `${component.name} has ${undocumented.length} undocumented prop${undocumented.length === 1 ? '' : 's'}.`,
        props: undocumented,
      });

      const requiredUndocumented = undocumented.filter((name) => component.props[name].required);
      if (requiredUndocumented.length > 0) {
        diagnostics.push({
          rule: 'required-prop-undocumented',
          severity: 'error',
          componentId: component.id,
          message: `${component.name} has required prop${requiredUndocumented.length === 1 ? '' : 's'} without documentation.`,
          props: requiredUndocumented,
        });
      }
    }

    const deprecated = componentTags.deprecated;
    if (deprecated !== undefined) {
      diagnostics.push({
        rule: 'deprecated-tag',
        severity: 'info',
        componentId: component.id,
        message: `${component.name} is marked @deprecated${deprecated ? `: ${deprecated}` : ''}.`,
      });
    }

    lintPathLinks(component.id, component.name, component.description);
  }

  // Unknown-@oversightIgnore-token check — spans failure entries too, whose
  // tags come from the story-meta JSDoc (they have no normalized description).
  for (const [id, componentTags] of Object.entries(result.tags)) {
    if (componentTags.oversightIgnore === undefined) continue;
    const unknown = splitTokens(componentTags.oversightIgnore).filter(
      (token) => !(ALL_RULES as readonly string[]).includes(token),
    );
    if (unknown.length > 0) {
      diagnostics.push({
        rule: 'unknown-ignore-rule',
        severity: 'warning',
        componentId: id,
        message: `${nameById.get(id) ?? id}'s @oversightIgnore lists unknown rule${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')} — nothing is exempted by them.`,
      });
    }
  }

  const overrides = options.rules ?? {};
  return diagnostics.flatMap((diagnostic) => {
    if (
      diagnostic.componentId !== null &&
      isIgnored(result.tags[diagnostic.componentId]?.oversightIgnore, diagnostic.rule)
    ) {
      return [];
    }
    const setting = overrides[diagnostic.rule];
    // Unrecognized values (e.g. ESLint-style "warn") fall through to the
    // rule's default severity instead of leaking out-of-contract strings.
    if (setting === undefined || !VALID_SETTINGS.has(setting)) return [diagnostic];
    if (setting === 'off') return [];
    return [{ ...diagnostic, severity: setting as DiagnosticSeverity }];
  });
}
