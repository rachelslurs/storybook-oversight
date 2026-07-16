import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { DiagnosticRule, LintOptions, RuleSetting } from 'oversight-core';

/** Where a plain `storybook build` writes the manifest. */
export const DEFAULT_MANIFEST_PATH = 'storybook-static/manifests/components.json';

export type RunOptions = {
  manifestPath: string;
  lint: LintOptions;
  /** Warnings past this count fail the run. `Infinity` = no limit. */
  maxWarnings: number;
  json: boolean;
  /** Show only errors in console output (counts and exit code are unaffected). */
  quiet: boolean;
  color: boolean;
};

/** buildConfig either yields options to run, or short-circuits (help/version/error). */
export type ConfigResult =
  | { kind: 'run'; options: RunOptions }
  | { kind: 'help' }
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
  rules?: Partial<Record<DiagnosticRule, RuleSetting>>;
  maxWarnings?: number;
};

const VALID_SEVERITIES = new Set<RuleSetting>(['off', 'error', 'warning', 'info']);

export const HELP = `oversight — lint a Storybook MCP components manifest

Usage:
  oversight [manifest] [options]

Arguments:
  manifest                     Path to components.json.
                               Default: ${DEFAULT_MANIFEST_PATH}

Options:
  --expected-extractor <name>  Extractor the manifest should have used
                               (default: react-docgen-typescript).
  --rule <name>=<severity>     Override a rule: off|error|warning|info.
                               Repeatable.
  --max-warnings <n>           Fail if warnings exceed n (default: no limit).
  --config <path>              Config file (default: ./oversight.config.json).
  --json                       Emit JSON keyed by component id.
  --quiet                      Print only errors (does not change the exit code).
  -h, --help                   Show this help.
  --version                    Print the version.

Exit codes:
  0  clean, or only warnings within --max-warnings
  1  error-severity findings, or warnings over the threshold
  2  could not run (manifest missing, unparseable, or unsupported format)`;

function parseRuleFlags(flags: string[]): Partial<Record<DiagnosticRule, RuleSetting>> {
  const rules: Partial<Record<DiagnosticRule, RuleSetting>> = {};
  for (const entry of flags) {
    const eq = entry.indexOf('=');
    if (eq === -1) throw new Error(`--rule expects <name>=<severity>, got "${entry}"`);
    const name = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!VALID_SEVERITIES.has(value as RuleSetting)) {
      throw new Error(`--rule ${name}: severity must be off|error|warning|info, got "${value}"`);
    }
    rules[name as DiagnosticRule] = value as RuleSetting;
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
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as FileConfig;
  } catch (err) {
    throw new Error(`could not parse config file ${path}: ${(err as Error).message}`);
  }
}

export function buildConfig(argv: string[], ctx: Context): ConfigResult {
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
  let ruleFlags: Partial<Record<DiagnosticRule, RuleSetting>>;
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
  const lint: LintOptions = {
    ...(expectedExtractor ? { expectedExtractor } : {}),
    rules: { ...file.rules, ...ruleFlags },
  };

  // NO_COLOR / FORCE_COLOR are the cross-tool convention; TTY is the default.
  const color = Boolean(ctx.env.FORCE_COLOR) || (ctx.isTTY && !ctx.env.NO_COLOR);

  return {
    kind: 'run',
    options: {
      manifestPath: positionals[0] ?? file.manifest ?? DEFAULT_MANIFEST_PATH,
      lint,
      maxWarnings,
      json: Boolean(values.json),
      quiet: Boolean(values.quiet),
      color,
    },
  };
}
