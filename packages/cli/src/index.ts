/**
 * `simpler` CLI entrypoint: argv parsing, built-in vs. manifest-driven
 * dispatch, destructive-command gating, dry-run, and help.
 *
 * Design note: everything except the very bottom `main()` is a pure or
 * side-effect-isolated function exported for unit testing. `main()` is the
 * ONLY place that calls `process.exit` — it's guarded so importing this
 * module (as tests do) never runs it.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

import { loadConfig } from './config.js';
import type { ResolvedConfig } from './config.js';
import { CliError, mcpCall } from './client.js';
import {
  loadManifest,
  findByCmd,
  domainNames,
  summarizeDomain,
  coerceArgs,
  toKebab,
} from './manifest.js';
import type { Manifest, ManifestToolSpec, ManifestArgSpec } from './manifest.js';
import { successEnvelope, resolveError, renderEnvelope, shouldUseJson } from './output.js';
import type { Envelope } from './output.js';
import { authLogin, authStatus, authLogout } from './commands/auth.js';
import { oauthLogin } from './commands/oauth-login.js';
import { runDoctor } from './commands/doctor.js';
import { runSetup } from './commands/setup.js';
import { runCreate } from './commands/create.js';
import { runManifestCommand } from './commands/manifest.js';
import { resolveCallTarget } from './commands/call.js';
import { runParity } from './commands/parity.js';

// ─── argv parsing ───────────────────────────────────────────────────────────

export interface ParsedArgv {
  /** Leading bare tokens (before the first `--flag`) — the command path. */
  command: string[];
  /** All `--flag`/`--flag=value` tokens, keyed by name without the `--`. */
  flags: Record<string, string | boolean>;
}

/**
 * Hand-rolled parse: `--flag value`, `--flag=value`, bare booleans. The
 * command path is the run of bare tokens before the first flag; any bare
 * tokens after that point are ignored (the manifest/tool grammar has no use
 * for trailing positionals beyond the command path + `simpler call <name>`,
 * which itself is a bare token captured in the command path).
 */
export function parseArgv(argv: string[]): ParsedArgv {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};
  let sawFlag = false;
  let i = 0;

  while (i < argv.length) {
    const token = argv[i];
    if (token.startsWith('--')) {
      sawFlag = true;
      const eqIdx = token.indexOf('=');
      if (eqIdx !== -1) {
        flags[token.slice(2, eqIdx)] = token.slice(eqIdx + 1);
        i += 1;
        continue;
      }
      const name = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 2;
      } else {
        flags[name] = true;
        i += 1;
      }
      continue;
    }
    if (!sawFlag) command.push(token);
    i += 1;
  }

  return { command, flags };
}

// ─── global flags ───────────────────────────────────────────────────────────

export interface GlobalFlags {
  json?: boolean;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
  help: boolean;
  fields?: string[];
  apiUrl?: string;
  apiKey?: string;
  timeout?: number;
  argsJson?: string;
  file?: string;
  email?: string;
  passwordStdin: boolean;
}

const GLOBAL_FLAG_NAMES = new Set([
  'json',
  'yes',
  'dry-run',
  'verbose',
  'help',
  'fields',
  'api-url',
  'api-key',
  'timeout',
  'args',
  'file',
  'email',
  'password-stdin',
]);

function asBool(val: string | boolean): boolean {
  return typeof val === 'boolean' ? val : val !== 'false';
}

/** Split parsed flags into global (CLI-level) flags and tool-arg flags. */
export function extractGlobalFlags(flags: Record<string, string | boolean>): {
  global: GlobalFlags;
  rest: Record<string, string | boolean>;
} {
  const rest: Record<string, string | boolean> = {};
  const global: GlobalFlags = {
    yes: false,
    dryRun: false,
    verbose: false,
    help: false,
    passwordStdin: false,
  };

  for (const [key, val] of Object.entries(flags)) {
    if (!GLOBAL_FLAG_NAMES.has(key)) {
      rest[key] = val;
      continue;
    }
    switch (key) {
      case 'json':
        global.json = asBool(val);
        break;
      case 'yes':
        global.yes = asBool(val);
        break;
      case 'dry-run':
        global.dryRun = asBool(val);
        break;
      case 'verbose':
        global.verbose = asBool(val);
        break;
      case 'help':
        global.help = asBool(val);
        break;
      case 'password-stdin':
        global.passwordStdin = asBool(val);
        break;
      case 'fields':
        global.fields =
          typeof val === 'string'
            ? val
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
        break;
      case 'api-url':
        global.apiUrl = typeof val === 'string' ? val : undefined;
        break;
      case 'api-key':
        global.apiKey = typeof val === 'string' ? val : undefined;
        break;
      case 'timeout':
        global.timeout = typeof val === 'string' ? Number(val) : undefined;
        break;
      case 'args':
        global.argsJson = typeof val === 'string' ? val : undefined;
        break;
      case 'file':
        global.file = typeof val === 'string' ? val : undefined;
        break;
      case 'email':
        global.email = typeof val === 'string' ? val : undefined;
        break;
    }
  }

  return { global, rest };
}

// ─── destructive gating ─────────────────────────────────────────────────────

export type DestructiveDecision = 'proceed' | 'need-prompt' | 'deny';

export function decideDestructive(destructive: boolean, yesFlag: boolean, isTTY: boolean): DestructiveDecision {
  if (!destructive) return 'proceed';
  if (yesFlag) return 'proceed';
  return isTTY ? 'need-prompt' : 'deny';
}

async function promptYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

// ─── arg payload helpers ────────────────────────────────────────────────────

function readJsonObjectFile(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(resolvePath(process.cwd(), path), 'utf-8');
  } catch (err) {
    throw new CliError(
      `Could not read --file ${path}: ${err instanceof Error ? err.message : String(err)}`,
      2,
      'usage_error',
    );
  }
  return parseJsonObject(raw, `--file ${path}`);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('expected a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    throw new CliError(`${label} is not a valid JSON object: ${err instanceof Error ? err.message : String(err)}`, 2, 'usage_error');
  }
}

/** Pure — the exact payload `--dry-run` prints. */
export function buildDryRunPayload(tool: ManifestToolSpec, args: Record<string, unknown>): unknown {
  return { dryRun: true, tool: tool.name, arguments: args };
}

export interface ExecuteContext {
  config: ResolvedConfig;
  /** Tool-specific flags only (global flags already stripped). */
  flags: Record<string, string | boolean>;
  global: GlobalFlags;
  isTTY: boolean;
}

/**
 * Shared execution path for both generated `<domain> <action>` commands and
 * `simpler call <tool_name>`: merge --file/--args/flags, coerce + validate,
 * dry-run short-circuit, destructive gating, then dispatch.
 */
export async function executeTool(tool: ManifestToolSpec, ctx: ExecuteContext): Promise<unknown> {
  const filePayload = ctx.global.file ? readJsonObjectFile(ctx.global.file) : undefined;
  const argsJson = ctx.global.argsJson ? parseJsonObject(ctx.global.argsJson, '--args') : undefined;

  const { args, errors } = coerceArgs(tool, { flags: ctx.flags, filePayload, argsJson });
  if (errors.length > 0) {
    throw new CliError(`Invalid arguments for "${tool.cmd}":\n- ${errors.join('\n- ')}`, 2, 'usage_error', errors);
  }

  if (ctx.global.dryRun) {
    return buildDryRunPayload(tool, args);
  }

  if (tool.destructive) {
    const decision = decideDestructive(true, ctx.global.yes, ctx.isTTY);
    if (decision === 'deny') {
      throw new CliError(
        `"${tool.cmd}" is destructive and requires confirmation. Re-run with --yes once the user has approved.`,
        4,
        'confirmation_required',
      );
    }
    if (decision === 'need-prompt') {
      const confirmed = await promptYesNo(`Run destructive command "${tool.cmd}"?`);
      if (!confirmed) {
        throw new CliError(`"${tool.cmd}" cancelled — confirmation declined.`, 4, 'confirmation_required');
      }
    }
  }

  const { data } = await mcpCall(ctx.config, tool.name, args, {
    timeout: ctx.global.timeout,
    verbose: ctx.global.verbose,
  });
  return data;
}

// ─── help ────────────────────────────────────────────────────────────────

const BUILTIN_HELP: Record<string, { usage: string; desc: string }> = {
  auth: {
    usage: 'simpler auth <login|status|logout>',
    desc: 'Manage credentials. `login` opens your browser (pass --email or --password-stdin for the password flow).',
  },
  manifest: { usage: 'simpler manifest [domain] [action]', desc: 'Browse the generated command surface.' },
  doctor: { usage: 'simpler doctor', desc: 'Check CLI config, connectivity, and auth.' },
  setup: {
    usage: 'simpler setup [--docker|--local] [--db-url <url>] [--no-seed] [--check] [--yes] [--dry-run]',
    desc: 'Bootstrap the monorepo locally: scaffold .env.local (+ generate secrets), migrate, and seed. Run via `bun run cli setup` on a fresh clone.',
  },
  create: {
    usage: 'simpler create <dir> [--repo <url>] [--branch <ref>] [--no-install] [--no-setup] [--yes]',
    desc: 'Front door: clone the monorepo into <dir>, install deps, and run setup. Also: `bunx create-simplerdevelopment <dir>`.',
  },
  call: {
    usage: 'simpler call <tool_name> [--args json|--file f] [--flag value ...]',
    desc: 'Call any MCP tool by its raw name (same gating as generated commands).',
  },
  mcp: { usage: 'simpler mcp parity', desc: 'Compare the shipped manifest against the live MCP tool list.' },
  version: { usage: 'simpler version', desc: 'Print the CLI version.' },
};

function exampleValueFor(arg: ManifestArgSpec): string {
  if (arg.enum && arg.enum.length > 0) return arg.enum[0];
  switch (arg.type) {
    case 'number':
      return '1';
    case 'boolean':
      return 'true';
    case 'json':
      return "'{}'";
    default:
      return '<value>';
  }
}

function buildExample(tool: ManifestToolSpec): string {
  const flagParts = (tool.args ?? [])
    .filter((a) => a.required)
    .map((a) => `--${toKebab(a.name)} ${exampleValueFor(a)}`);
  return ['simpler', tool.cmd, ...flagParts].join(' ');
}

function buildCommandHelp(tool: ManifestToolSpec): unknown {
  return {
    cmd: tool.cmd,
    desc: tool.desc,
    destructive: Boolean(tool.destructive),
    args: tool.args ?? [],
    example: buildExample(tool),
  };
}

function buildGlobalHelp(): unknown {
  return {
    usage: 'simpler <domain> <action> [--arg value ...] [global flags]',
    globalFlags: [
      '--json',
      '--yes',
      '--dry-run',
      '--verbose',
      '--fields a,b,c',
      '--api-url <url>',
      '--api-key <key>',
      '--timeout <ms>',
      '--help',
    ],
    builtins: Object.entries(BUILTIN_HELP).map(([name, help]) => ({ name, ...help })),
    discovery: 'Run `simpler manifest --json` for domains, `simpler manifest <domain> --json` for its commands.',
  };
}

function buildHelp(cmd: string[], manifest: Manifest | null): unknown {
  if (cmd.length === 0) return buildGlobalHelp();

  if (BUILTIN_HELP[cmd[0]]) {
    return { command: cmd[0], ...BUILTIN_HELP[cmd[0]] };
  }

  if (!manifest) {
    throw new CliError(`Unknown command "${cmd.join(' ')}".`, 2, 'not_found');
  }

  if (!domainNames(manifest).includes(cmd[0])) {
    throw new CliError(`Unknown command "${cmd.join(' ')}". Run \`simpler manifest\` to browse commands.`, 2, 'not_found');
  }
  if (cmd.length === 1) {
    return { domain: cmd[0], commands: summarizeDomain(manifest, cmd[0]) };
  }
  const tool = findByCmd(manifest, cmd);
  if (!tool) {
    throw new CliError(`Unknown command "${cmd.join(' ')}". Run \`simpler manifest ${cmd[0]}\` to browse its commands.`, 2, 'not_found');
  }
  return buildCommandHelp(tool);
}

/** Human-readable rendering of the four buildHelp() shapes (TTY, non---json mode). */
export function renderHelpText(data: unknown): string {
  const d = data as Record<string, unknown>;
  const lines: string[] = [];

  // global help: { usage, globalFlags, builtins, discovery }
  if (Array.isArray(d.builtins)) {
    lines.push(`simpler ${getCliVersion()} — SimplerDevelopment portal CLI`, '');
    lines.push(`Usage: ${d.usage}`, '');
    lines.push('Built-in commands:');
    for (const b of d.builtins as Array<{ name: string; usage: string; desc: string }>) {
      lines.push(`  ${b.name.padEnd(10)}${b.desc}`);
      lines.push(`  ${''.padEnd(10)}${b.usage}`);
    }
    lines.push('', `Global flags: ${(d.globalFlags as string[]).join('  ')}`, '');
    lines.push(String(d.discovery));
    return lines.join('\n');
  }

  // domain help: { domain, commands }
  if (Array.isArray(d.commands)) {
    const cmds = d.commands as Array<{ cmd: string; desc?: string; destructive: boolean }>;
    const width = Math.max(...cmds.map((c) => c.cmd.length)) + 2;
    lines.push(`simpler ${d.domain} — ${cmds.length} commands:`, '');
    for (const c of cmds) {
      lines.push(`  ${c.cmd.padEnd(width)}${c.destructive ? '[destructive] ' : ''}${c.desc ?? ''}`);
    }
    lines.push('', `Run \`simpler help ${d.domain} <action>\` for a command's arguments.`);
    return lines.join('\n');
  }

  // command help: { cmd, desc, destructive, args, example }
  if (Array.isArray(d.args)) {
    lines.push(`simpler ${d.cmd}${d.destructive ? '  [destructive — prompts unless --yes]' : ''}`);
    if (d.desc) lines.push(`  ${d.desc}`);
    const args = d.args as ManifestArgSpec[];
    if (args.length > 0) {
      lines.push('', 'Arguments:');
      const width = Math.max(...args.map((a) => toKebab(a.name).length)) + 4;
      for (const a of args) {
        const meta = [a.required ? 'required' : 'optional', a.enum ? a.enum.join('|') : a.type].join(', ');
        lines.push(`  --${toKebab(a.name).padEnd(width)}(${meta})${a.desc ? ` ${a.desc}` : ''}`);
      }
    }
    lines.push('', `Example: ${d.example}`);
    return lines.join('\n');
  }

  // builtin help: { command, usage, desc }
  return [`simpler ${d.command} — ${d.desc}`, '', `Usage: ${d.usage}`].join('\n');
}

// ─── misc ────────────────────────────────────────────────────────────────

export function getCliVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function buildConfig(global: GlobalFlags, cwd?: string): ResolvedConfig {
  return loadConfig({ apiUrl: global.apiUrl, apiKey: global.apiKey, timeout: global.timeout }, cwd);
}

// ─── top-level dispatch ──────────────────────────────────────────────────

export interface RunResult {
  envelope: Envelope;
  exitCode: number;
  useJson: boolean;
  /** When set (help / auth login on a TTY), main() prints this instead of the JSON envelope. */
  humanText?: string;
}

/**
 * Runs the CLI end to end and returns the envelope + exit code — never
 * touches `process.exit` or `process.stdout` directly, so it's directly
 * testable. `main()` below is the only caller that prints/exits.
 */
export async function run(argv: string[], deps: { isTTY?: boolean; cwd?: string } = {}): Promise<RunResult> {
  const isTTY = deps.isTTY ?? Boolean(process.stdout.isTTY);
  const parsed = parseArgv(argv);
  const { global, rest } = extractGlobalFlags(parsed.flags);
  const useJson = shouldUseJson(global.json, isTTY);

  try {
    const command = parsed.command;

    // Help — no command at all, `--help` anywhere, or the bare `help` word.
    if (global.help || command.length === 0 || command[0] === 'help') {
      const helpTarget = command[0] === 'help' ? command.slice(1) : command;
      let manifest: Manifest | null = null;
      if (helpTarget.length > 0 && !BUILTIN_HELP[helpTarget[0]]) {
        try {
          manifest = loadManifest();
        } catch {
          manifest = null;
        }
      }
      const data = buildHelp(helpTarget, manifest);
      return {
        envelope: successEnvelope(data),
        exitCode: 0,
        useJson,
        humanText: useJson ? undefined : renderHelpText(data),
      };
    }

    if (command[0] === 'version') {
      return { envelope: successEnvelope({ version: getCliVersion() }), exitCode: 0, useJson };
    }

    if (command[0] === 'auth') {
      const sub = command[1];
      if (sub === 'login') {
        const config = buildConfig(global, deps.cwd);
        // `auth login` should just work with zero flags — default to production.
        if (!config.apiUrl) config.apiUrl = 'https://www.simplerdevelopment.com';

        // Browser OAuth flow is the default on a TTY; --email or
        // --password-stdin selects the password flow (CI/headless).
        if (isTTY && !global.email && !global.passwordStdin) {
          const data = await oauthLogin(config);
          const lines = [
            'Signed in via browser.',
            data.client
              ? `Session bound to client ${data.client.id} — ${data.client.company}. Every command now operates on this tenant.`
              : 'Session stored.',
            `API: ${data.apiUrl}`,
            `Access token auto-refreshes (sessions last up to 60 days); saved to ${data.configPath}`,
          ];
          return {
            envelope: successEnvelope(data, global.fields),
            exitCode: 0,
            useJson,
            humanText: useJson ? undefined : lines.join('\n'),
          };
        }

        const data = await authLogin(
          { email: global.email, passwordStdin: global.passwordStdin },
          config,
          { verbose: global.verbose },
        );
        const lines = [
          `Signed in as ${data.user.email}`,
          `Key bound to client ${data.client.id} — ${data.client.company}. Every command now operates on this tenant.`,
          `API: ${data.apiUrl}${data.redirectedFrom ? ` (canonicalized from ${data.redirectedFrom})` : ''}`,
          `Key expires ${data.expiresAt}; saved to ${data.configPath}`,
        ];
        return {
          envelope: successEnvelope(data, global.fields),
          exitCode: 0,
          useJson,
          humanText: useJson ? undefined : lines.join('\n'),
        };
      }
      if (sub === 'status') {
        const config = buildConfig(global, deps.cwd);
        const data = await authStatus(config, { verbose: global.verbose });
        return { envelope: successEnvelope(data, global.fields), exitCode: 0, useJson };
      }
      if (sub === 'logout') {
        const data = authLogout();
        return { envelope: successEnvelope(data, global.fields), exitCode: 0, useJson };
      }
      throw new CliError('Usage: simpler auth <login|status|logout>', 2, 'usage_error');
    }

    if (command[0] === 'manifest') {
      const manifest = loadManifest();
      const data = runManifestCommand(manifest, command[1], command[2]);
      return { envelope: successEnvelope(data, global.fields), exitCode: 0, useJson };
    }

    if (command[0] === 'doctor') {
      const config = buildConfig(global, deps.cwd);
      const report = await runDoctor(config, { verbose: global.verbose, cliVersion: getCliVersion() });
      return { envelope: successEnvelope(report, global.fields), exitCode: report.success ? 0 : 1, useJson };
    }

    if (command[0] === 'create') {
      const report = await runCreate({
        command,
        cwd: deps.cwd ?? process.cwd(),
        yes: global.yes,
        dryRun: global.dryRun,
        flags: {
          repo: typeof rest.repo === 'string' ? rest.repo : undefined,
          branch: typeof rest.branch === 'string' ? rest.branch : undefined,
          noInstall: rest['no-install'] === true || rest['no-install'] === 'true',
          noSetup: rest['no-setup'] === true || rest['no-setup'] === 'true',
        },
      });
      return {
        envelope: successEnvelope(report, global.fields),
        exitCode: report.success ? 0 : 1,
        useJson,
        // human mode already printed the step summary to stderr — skip the envelope on success
        humanText: !useJson && report.success ? '' : undefined,
      };
    }

    if (command[0] === 'setup') {
      const report = await runSetup({
        cwd: deps.cwd ?? process.cwd(),
        isTTY,
        yes: global.yes,
        dryRun: global.dryRun,
        verbose: global.verbose,
        flags: {
          docker: rest.docker === true || rest.docker === 'true',
          local: rest.local === true || rest.local === 'true',
          check: rest.check === true || rest.check === 'true',
          noSeed: rest['no-seed'] === true || rest['no-seed'] === 'true',
          dbUrl: typeof rest['db-url'] === 'string' ? rest['db-url'] : undefined,
        },
      });
      return {
        envelope: successEnvelope(report, global.fields),
        exitCode: report.success ? 0 : 1,
        useJson,
        humanText: !useJson && report.success ? '' : undefined,
      };
    }

    if (command[0] === 'call') {
      const manifest = loadManifest();
      const tool = resolveCallTarget(manifest, command[1]);
      const config = buildConfig(global, deps.cwd);
      const data = await executeTool(tool, { config, flags: rest, global, isTTY });
      return { envelope: successEnvelope(data, global.fields), exitCode: 0, useJson };
    }

    if (command[0] === 'mcp' && command[1] === 'parity') {
      const manifest = loadManifest();
      const config = buildConfig(global, deps.cwd);
      const report = await runParity(config, manifest, { verbose: global.verbose });
      return { envelope: successEnvelope(report, global.fields), exitCode: report.inParity ? 0 : 1, useJson };
    }

    // Generic manifest-driven dispatch: `simpler <domain> <action> ...`
    const manifest = loadManifest();
    const tool = findByCmd(manifest, command);
    if (!tool) {
      throw new CliError(
        `Unknown command "${command.join(' ')}". Run \`simpler manifest\` to browse commands, or \`simpler --help\`.`,
        2,
        'usage_error',
      );
    }
    const config = buildConfig(global, deps.cwd);
    const data = await executeTool(tool, { config, flags: rest, global, isTTY });
    return { envelope: successEnvelope(data, global.fields), exitCode: 0, useJson };
  } catch (err) {
    const { envelope, exitCode } = resolveError(err);
    return { envelope, exitCode, useJson };
  }
}

// ─── entrypoint ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { envelope, exitCode, useJson, humanText } = await run(process.argv.slice(2));
  const out = humanText ?? renderEnvelope(envelope, useJson);
  if (out !== '') console.log(out);
  process.exit(exitCode);
}

function isDirectEntryPoint(): boolean {
  try {
    // realpath: npm installs the bin as a symlink, so argv[1] never string-matches import.meta.url
    return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isDirectEntryPoint()) {
  main();
}
