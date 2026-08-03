import { pathLinkPattern } from './pathLinks';
import { firstNonEmptyLine, summarizeError } from './text';
import type { Finding, RuleName, Severity, NormalizeResult, RuleSetting } from './types';

export type LintOptions = {
  /**
   * The extractor the project sets in `.storybook/main.ts`. Unset, the
   * `extractor-drift` rule does not run: there is nothing to compare against.
   */
  expectedExtractor?: string;
  /**
   * Per-rule overrides: remap a rule's severity or turn it `"off"`.
   * Unlisted rules keep their default severity; unrecognized values are
   * ignored (the rule keeps its default) rather than propagated.
   */
  rules?: Partial<Record<RuleName, RuleSetting>>;
};

// Exhaustive by construction: `satisfies Record<RuleName, true>` fails to
// compile if a rule is added to the union without a key here, so ALL_RULES can't
// silently drift out of sync (which would make @oversightIgnore <new-rule> warn
// "unknown rule" even though the exemption works).
const RULE_SET = {
  'docgen-missing': true,
  'story-extraction-error': true,
  'extractor-drift': true,
  'component-description-missing': true,
  'prop-descriptions-missing': true,
  'props-unrecorded': true,
  'required-prop-undocumented': true,
  'docs-link-dangling': true,
  'unknown-ignore-rule': true,
  'deprecated-tag': true,
  'prop-shape-unrecognized': true,
  'ref-unresolved': true,
} satisfies Record<RuleName, true>;
/** Every finding rule name. Exported so other surfaces (the CLI) can validate
 *  rule names against the single source of truth instead of hardcoding them. */
export const ALL_RULES = Object.keys(RULE_SET) as RuleName[];

// Exhaustive the same way RULE_SET is, so a rule added to the union has to say
// what to do about itself rather than shipping a finding with no answer. The
// long form of each stays in docs/troubleshooting.md.
//
// `deprecated-tag` is null on purpose: it reports a fact, not a defect.
const HINT = {
  // Three causes, and naming only the configuration one told a project that had
  // already set it correctly to set it again, under a message saying something
  // else entirely.
  'docgen-missing': "Check the export shape and the story's meta.component first, then typescript.reactDocgen.",
  'story-extraction-error': 'Read the error the manifest records on that story, which says more than this summary.',
  'extractor-drift': 'Check meta.docgen for the extractor that ran, then set the expectation to match.',
  'component-description-missing': 'Add a JSDoc block above the component.',
  'prop-descriptions-missing': 'Add a JSDoc comment to each undocumented prop.',
  'props-unrecorded':
    'Give one prop a JSDoc comment and rebuild: if others appear with it, extraction was dropping them.',
  'required-prop-undocumented': 'Add a JSDoc comment to each required prop.',
  'docs-link-dangling': 'Point the link at an id the manifest has, or remove the link.',
  'unknown-ignore-rule': 'Check the token against the rule names; it is usually a typo.',
  'deprecated-tag': null,
  'prop-shape-unrecognized': 'Fix this one first: the prop rules do not run while it fires.',
  'ref-unresolved': "Resolve the entry's $ref before linting.",
} satisfies Record<RuleName, string | null>;

/** The one-line hint for a rule, or undefined when it reports a fact rather
 *  than a defect. `deprecated-tag` is the only rule without one. */
export const hintFor = (rule: RuleName): string | undefined => HINT[rule] ?? undefined;

/** The accepted `rules` override values, shared with the CLI's `--rule` parser. */
export const VALID_SETTINGS: ReadonlySet<string> = new Set<RuleSetting>(['off', 'error', 'warning', 'info']);

function splitTokens(value: string): string[] {
  // `@oversightIgnore a b`, the natural JSDoc form, must parse the same as the
  // comma-separated form, so split on whitespace as well as commas/newlines.
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
function isIgnored(ignoreValue: string | undefined, rule: RuleName): boolean {
  if (ignoreValue === undefined) return false;
  const tokens = splitTokens(ignoreValue);
  if (tokens.length === 0) return true;
  return tokens.includes(rule);
}

// `?path=/docs|story/<id>` targets embedded in description prose. Shared with
// the panel's link parser via core/pathLinks so the two can't drift.
const PATH_LINK_PATTERN = pathLinkPattern();

export function lint(result: NormalizeResult, options: LintOptions = {}): Finding[] {
  // The addon's config channels are untyped casts, so null or "" can arrive
  // here; both read as "no expectation", never as a value to compare against.
  const stated = options.expectedExtractor;
  // Trimmed on the way in. A value read from a file or an unquoted shell
  // variable arrives with a trailing newline, passed the emptiness test, and
  // then mismatched a manifest that recorded the same extractor, naming both
  // sides identically in the warning.
  const expectedExtractor = typeof stated === 'string' && stated.trim() !== '' ? stated.trim() : undefined;
  const findings: Finding[] = [];

  // Drift requires a stated expectation. A default here warned projects that
  // never chose an extractor, and the manifest-side default read a missing
  // `meta.docgen` as a match (#32). An unrecorded extractor fails the check:
  // staying silent would rebuild that fabricated match.
  if (expectedExtractor !== undefined) {
    if (result.extractor === null) {
      findings.push({
        rule: 'extractor-drift',
        hint: hintFor('extractor-drift'),
        severity: 'warning',
        componentId: null,
        message: `Manifest does not record which extractor ran; this project expects "${expectedExtractor}".`,
      });
    } else if (result.extractor !== expectedExtractor) {
      // States the mismatch and stops. The message used to append "prop docs
      // may be incomplete", an outcome that holds for at most one orientation
      // of one pairing: react-component-meta extracts more documented props
      // than react-docgen, and matches react-docgen-typescript (#52).
      findings.push({
        rule: 'extractor-drift',
        hint: hintFor('extractor-drift'),
        severity: 'warning',
        componentId: null,
        message: `Manifest was extracted with "${result.extractor}" but this project expects "${expectedExtractor}".`,
      });
    }
  }

  for (const failure of result.failures) {
    findings.push({
      rule: 'docgen-missing',
      hint: hintFor('docgen-missing'),
      severity: 'error',
      componentId: failure.id,
      message: `Docgen extraction failed for ${failure.name}: ${summarizeError(failure.errorName, failure.error) ?? 'unknown error'}`,
      ...(failure.error ? { error: failure.error } : {}),
      ...(failure.errorName ? { errorName: failure.errorName } : {}),
    });
  }

  for (const storyFailure of result.storyFailures) {
    findings.push({
      rule: 'story-extraction-error',
      hint: hintFor('story-extraction-error'),
      severity: 'warning',
      componentId: storyFailure.componentId,
      message: `Story "${storyFailure.storyName}" failed extraction: ${summarizeError(storyFailure.errorName, storyFailure.error) ?? 'unknown error'}`,
      ...(storyFailure.error ? { error: storyFailure.error } : {}),
      ...(storyFailure.errorName ? { errorName: storyFailure.errorName } : {}),
    });
  }

  // Manifest ids of every entry, including failed ones. These are the resolvable
  // targets for the `?path=` links inside description prose.
  const knownIds = new Set<string>();
  const nameById = new Map<string, string>();
  for (const entry of [...result.components, ...result.failures]) {
    knownIds.add(entry.id);
    nameById.set(entry.id, entry.name);
  }

  // Two conditions, two rules. Sharing one name meant turning off a false
  // prop-shape flag also silenced every unresolved ref, whose only channel this
  // is.
  //
  // `prop-shape-unrecognized` is an error because it stands in for
  // `required-prop-undocumented`, which is an error. Reporting it as a warning
  // let `--max-warnings`, unlimited by default, pass a build that had been
  // failing: CI went green on the day the payload stopped being readable.
  // A project that would rather keep building can set it to `warning`.
  for (const shapeIssue of result.shapeIssues) {
    const scope = shapeIssue.componentId ? `${nameById.get(shapeIssue.componentId) ?? shapeIssue.componentId}: ` : '';
    const rule = shapeIssue.componentId === null ? 'prop-shape-unrecognized' : 'ref-unresolved';
    findings.push({
      rule,
      hint: hintFor(rule),
      severity: rule === 'prop-shape-unrecognized' ? 'error' : 'warning',
      componentId: shapeIssue.componentId,
      message: `${scope}expected ${shapeIssue.expected}, got ${shapeIssue.got}.`,
    });
  }

  // Redirect links in the component description hardcode manifest ids, so a
  // renamed story title leaves them dead, and this rule catches them. Only the
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
      findings.push({
        rule: 'docs-link-dangling',
        hint: hintFor('docs-link-dangling'),
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
      findings.push({
        rule: 'component-description-missing',
        hint: hintFor('component-description-missing'),
        severity: 'warning',
        componentId: component.id,
        message: `${component.name} has no description for the MCP or the Docs page to show.`,
      });
    }

    // An entry with no props at all is the shape of an extraction that dropped
    // them, not usually a component that takes none: an undocumented `children`
    // can be absent from the manifest exactly because it is undocumented, so
    // `prop-descriptions-missing` cannot see it and the agent is told the
    // component accepts nothing. A component that genuinely takes no props
    // exempts itself with `@oversightIgnore props-unrecorded`.
    if (
      result.propShape === 'known' &&
      Object.keys(component.props).length === 0 &&
      !isIgnored(componentTags.oversightIgnore, 'props-unrecorded')
    ) {
      findings.push({
        rule: 'props-unrecorded',
        hint: hintFor('props-unrecorded'),
        severity: 'warning',
        componentId: component.id,
        message: `${component.name} records no props, so the MCP describes it as taking none.`,
      });
    }

    // Both prop rules read fields the manifest no longer recognizably carries
    // when the shape check failed. Reporting off a renamed field would mark
    // every prop undocumented; staying silent about the silence would hide it,
    // so `prop-shape-unrecognized` says so once above.
    const undocumented =
      result.propShape === 'known'
        ? Object.entries(component.props)
            .filter(([, prop]) => prop.description === null)
            .map(([name]) => name)
        : [];
    if (undocumented.length > 0) {
      findings.push({
        rule: 'prop-descriptions-missing',
        hint: hintFor('prop-descriptions-missing'),
        severity: 'warning',
        componentId: component.id,
        message: `${component.name} has ${undocumented.length} undocumented prop${undocumented.length === 1 ? '' : 's'}.`,
        props: undocumented,
      });

      const requiredUndocumented = undocumented.filter((name) => component.props[name].required);
      if (requiredUndocumented.length > 0) {
        findings.push({
          rule: 'required-prop-undocumented',
          hint: hintFor('required-prop-undocumented'),
          severity: 'error',
          componentId: component.id,
          message: `${component.name} has required prop${requiredUndocumented.length === 1 ? '' : 's'} without documentation.`,
          props: requiredUndocumented,
        });
      }
    }

    const deprecated = componentTags.deprecated;
    if (deprecated !== undefined) {
      // Tag values arrive newline-joined, and a multi-line message breaks the
      // CLI step-summary table row. A whitespace-only body used to read as
      // truthy and emit a bare colon. When the clamp drops continuation lines,
      // `error` carries the full note so machine-readable output keeps it.
      const line = firstNonEmptyLine(deprecated);
      // The template appends its own period.
      const note = line?.replace(/\.$/, '');
      findings.push({
        rule: 'deprecated-tag',
        hint: hintFor('deprecated-tag'),
        severity: 'info',
        componentId: component.id,
        message: `${component.name} is marked @deprecated${note ? `: ${note}` : ''}.`,
        ...(line !== null && deprecated.trim() !== line ? { error: deprecated } : {}),
      });
    }

    lintPathLinks(component.id, component.name, component.description);
  }

  // Unknown-@oversightIgnore-token check. It spans failure entries too, whose
  // tags come from the story-meta JSDoc (they have no normalized description).
  for (const [id, componentTags] of Object.entries(result.tags)) {
    if (componentTags.oversightIgnore === undefined) continue;
    const unknown = splitTokens(componentTags.oversightIgnore).filter(
      (token) => !(ALL_RULES as readonly string[]).includes(token),
    );
    if (unknown.length > 0) {
      findings.push({
        rule: 'unknown-ignore-rule',
        hint: hintFor('unknown-ignore-rule'),
        severity: 'warning',
        componentId: id,
        message: `${nameById.get(id) ?? id}'s @oversightIgnore lists unknown rule${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Nothing is exempted by them.`,
      });
    }
  }

  const overrides = options.rules ?? {};
  return findings.flatMap((finding) => {
    if (finding.componentId !== null && isIgnored(result.tags[finding.componentId]?.oversightIgnore, finding.rule)) {
      return [];
    }
    const setting = overrides[finding.rule];
    // Unrecognized values (e.g. ESLint-style "warn") fall through to the
    // rule's default severity instead of leaking out-of-contract strings.
    if (setting === undefined || !VALID_SETTINGS.has(setting)) return [finding];
    if (setting === 'off') return [];
    return [{ ...finding, severity: setting as Severity }];
  });
}
