import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ALL_RULES, VALID_SETTINGS } from 'oversight-core';
import type { RuleName, LintOptions, RuleSetting } from 'oversight-core';

/** Where a plain `storybook build` writes the manifest. */
export const DEFAULT_MANIFEST_PATH = 'storybook-static/manifests/components.json';

/** `text` = stylish console; `json` = machine-readable; `github` = Actions annotations. */
export type OutputFormat = 'text' | 'json' | 'github';

const VALID_FORMATS = new Set<OutputFormat>(['text', 'json', 'github']);

export type RunOptions = {
  manifestPath: string;
  lint: LintOptions;
  /** Warnings past this count fail the run. `Infinity` = no limit. */
  maxWarnings: number;
  format: OutputFormat;
  /** Show only errors in console output (counts and exit code are unaffected). */
  quiet: boolean;
  color: boolean;
};

/** What `oversight agent-view` needs. It inspects one entry and lints nothing. */
export type AgentViewOptions = {
  manifestPath: string;
  /** A component or docs entry id, as `list-all-documentation` reports it. */
  id: string;
};

/** buildConfig yields a lint run, an inspection, or a short-circuit (help/version/error). */
export type ConfigResult =
  | { kind: 'run'; options: RunOptions }
  | { kind: 'agent-view'; options: AgentViewOptions }
  | { kind: 'help' }
  | { kind: 'agent-view-help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

export type Context = {
  cwd: string;
  env: Record<string, string | undefined>;
  isTTY: boolean;
};

/** The shape read from `oversight.config.json` (all fields optional). */
type FileConfig = {
  manifest?: string;
  expectedExtractor?: string;
  rules?: Partial<Record<RuleName, RuleSetting>>;
  maxWarnings?: number;
};

/** NO_COLOR / FORCE_COLOR follow the cross-tool convention: NO_COLOR (any value)
 *  disables color; FORCE_COLOR=0 (or "false") disables it, any other value forces
 *  it on; otherwise fall back to whether stdout is a TTY. */
function resolveColor(ctx: Context): boolean {
  if (ctx.env.NO_COLOR) return false;
  const force = ctx.env.FORCE_COLOR;
  if (force !== undefined) return force !== '0' && force !== 'false';
  return ctx.isTTY;
}

export const HELP = `oversight: lint a Storybook MCP components manifest

Usage:
  oversight [manifest] [options]
  oversight agent-view <id> [manifest]

Commands:
  agent-view <id>              Print what the MCP serves for one component or
                               docs entry instead of linting. See
                               oversight agent-view --help.

Arguments:
  manifest                     Path to components.json.
                               Default: ${DEFAULT_MANIFEST_PATH}

Options:
  --expected-extractor <name>  Extractor the manifest should have used.
                               extractor-drift runs only when this is set
                               here or in the config file.
  --rule <name>=<severity>     Override a rule: off|error|warning|info.
                               Repeatable.
  --max-warnings <n>           Fail if warnings exceed n (default: no limit).
  --config <path>              Config file (default: ./oversight.config.json).
  --format <fmt>               Output: text (default), json, or github
                               (::error/::warning annotations for GitHub Actions).
  --json                       Alias for --format json.
  --quiet                      Print only errors (does not change the exit code).
  -h, --help                   Show this help.
  --version                    Print the version.

Exit codes:
  0  clean, or only warnings within --max-warnings
  1  error-severity findings, or warnings over the threshold
  2  could not run (manifest missing, unparseable, or unsupported format)`;

export const AGENT_VIEW_HELP = `oversight agent-view: print what the MCP serves for one entry

Usage:
  oversight agent-view <id> [manifest]

Arguments:
  id                           A component or docs entry id, as
                               list-all-documentation reports it.
  manifest                     Path to components.json. Falls back to the
                               config file, then ${DEFAULT_MANIFEST_PATH}

Options:
  --config <path>              Config file (default: ./oversight.config.json).
  -h, --help                   Show this help.

Exit codes:
  0  the text was printed
  2  it could not be (unknown id, or a ref that failed to resolve)

Findings do not reach the exit code: this inspects rather than lints. The
output is the tool result and says nothing about what a model does with it.`;

function parseRuleFlags(flags: string[]): Partial<Record<RuleName, RuleSetting>> {
  const rules: Partial<Record<RuleName, RuleSetting>> = {};
  for (const entry of flags) {
    const eq = entry.indexOf('=');
    if (eq === -1) throw new Error(`--rule expects <name>=<severity>, got "${entry}"`);
    const name = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!(ALL_RULES as readonly string[]).includes(name)) {
      throw new Error(`--rule ${name}: unknown rule. Valid rules: ${ALL_RULES.join(', ')}`);
    }
    if (!VALID_SETTINGS.has(value)) {
      throw new Error(`--rule ${name}: severity must be off|error|warning|info, got "${value}"`);
    }
    rules[name as RuleName] = value as RuleSetting;
  }
  return rules;
}

function loadFileConfig(cwd: string, explicitPath: string | undefined): FileConfig {
  const path = explicitPath
    ? isAbsolute(explicitPath)
      ? explicitPath
      : resolve(cwd, explicitPath)
    : resolve(cwd, 'oversight.config.json');
  if (!existsSync(path)) {
    // An explicit --config that does not exist is a usage error; the implicit
    // default is optional, so its absence is silent.
    if (explicitPath) throw new Error(`config file not found: ${explicitPath}`);
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`could not parse config file ${path}: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`config file ${path} must contain a JSON object`);
  }
  return parsed as FileConfig;
}

/** The subcommand's spelling, matched against `argv[0]` and nothing else. */
const AGENT_VIEW = 'agent-view';

/**
 * `oversight agent-view <id> [manifest]`.
 *
 * Its own option set, so the lint flags it has no use for are rejected by name
 * rather than accepted and then explained away. It inspects one entry, so
 * `--format`, `--max-warnings`, `--quiet` and `--rule` do not appear here.
 *
 * The manifest resolves the chain the lint path uses, positional then config
 * file then default, so the id alone is the common invocation. `--config` is
 * accepted for the same reason the file is read at all: without it, a project
 * that lints with `--config ci/oversight.json` would inspect a different
 * manifest than it lints.
 */
function buildAgentViewConfig(argv: string[], ctx: Context): ConfigResult {
  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        config: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
      },
    }) as { values: Record<string, unknown>; positionals: string[] });
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }

  if (values.help) return { kind: 'agent-view-help' };

  const [id, manifest, ...rest] = positionals;
  if (id === undefined || id.trim() === '') {
    return { kind: 'error', message: `${AGENT_VIEW} expects a component or docs entry id` };
  }
  if (rest.length > 0) {
    return {
      kind: 'error',
      message: `${AGENT_VIEW} takes an id and an optional manifest path, got ${positionals.length} arguments`,
    };
  }

  let file: FileConfig;
  try {
    file = loadFileConfig(ctx.cwd, values.config as string | undefined);
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }

  return {
    kind: 'agent-view',
    options: { manifestPath: manifest ?? file.manifest ?? DEFAULT_MANIFEST_PATH, id },
  };
}

export function buildConfig(argv: string[], ctx: Context): ConfigResult {
  if (argv[0] === AGENT_VIEW) return buildAgentViewConfig(argv.slice(1), ctx);

  let values: Record<string, unknown>;
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        'expected-extractor': { type: 'string' },
        rule: { type: 'string', multiple: true },
        'max-warnings': { type: 'string' },
        config: { type: 'string' },
        format: { type: 'string' },
        json: { type: 'boolean', default: false },
        quiet: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', default: false },
      },
    }) as { values: Record<string, unknown>; positionals: string[] });
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }

  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  let file: FileConfig;
  let ruleFlags: Partial<Record<RuleName, RuleSetting>>;
  try {
    file = loadFileConfig(ctx.cwd, values.config as string | undefined);
    ruleFlags = parseRuleFlags((values.rule as string[] | undefined) ?? []);
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }

  let maxWarnings = Infinity;
  const maxWarningsRaw =
    (values['max-warnings'] as string | undefined) ??
    (file.maxWarnings !== undefined ? String(file.maxWarnings) : undefined);
  if (maxWarningsRaw !== undefined) {
    const n = Number(maxWarningsRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { kind: 'error', message: `--max-warnings expects a non-negative integer, got "${maxWarningsRaw}"` };
    }
    maxWarnings = n;
  }

  const expectedExtractor = (values['expected-extractor'] as string | undefined) ?? file.expectedExtractor;
  // An empty expectation would silently disable extractor-drift while the
  // operator believes they stated one (an unset shell variable expands to "").
  if (expectedExtractor !== undefined && (typeof expectedExtractor !== 'string' || expectedExtractor.trim() === '')) {
    return {
      kind: 'error',
      message: `--expected-extractor expects an extractor name, got ${JSON.stringify(expectedExtractor)}`,
    };
  }

  const rules = { ...file.rules, ...ruleFlags };
  // A severity override for a rule that cannot run is a config mistake, and
  // silence here reads as a clean manifest.
  const driftOverride = rules['extractor-drift'];
  if (expectedExtractor === undefined && driftOverride !== undefined && driftOverride !== 'off') {
    return {
      kind: 'error',
      message:
        `--rule extractor-drift=${driftOverride} has no effect: the rule runs only when ` +
        `--expected-extractor (or expectedExtractor in the config file) is set`,
    };
  }

  const lint: LintOptions = {
    ...(expectedExtractor !== undefined ? { expectedExtractor } : {}),
    rules,
  };

  const color = resolveColor(ctx);

  const formatRaw = values.format as string | undefined;
  if (formatRaw !== undefined && !VALID_FORMATS.has(formatRaw as OutputFormat)) {
    return { kind: 'error', message: `--format expects text|json|github, got "${formatRaw}"` };
  }
  // Explicit --format wins; --json is sugar for --format json; default is text.
  const format: OutputFormat = (formatRaw as OutputFormat | undefined) ?? (values.json ? 'json' : 'text');

  // `argv[0]` is the only place the subcommand is recognized, so `oversight
  // --quiet agent-view <id>` reaches here with `agent-view` as the manifest and
  // would otherwise fail with five lines about Storybook's manifest features.
  if (positionals.includes(AGENT_VIEW)) {
    return { kind: 'error', message: `did you mean \`oversight ${AGENT_VIEW} <id>\`?` };
  }

  return {
    kind: 'run',
    options: {
      manifestPath: positionals[0] ?? file.manifest ?? DEFAULT_MANIFEST_PATH,
      lint,
      maxWarnings,
      format,
      quiet: Boolean(values.quiet),
      color,
    },
  };
}
