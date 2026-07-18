/**
 * Generates packages/cli/manifest.json — the data-driven command surface for
 * the `simpler` CLI. Builds the portal's MCP server in-process (same pattern
 * as tests/unit/mcp-tool-registry-baseline.test.ts) with a full-access ('*')
 * key, introspects every registered tool's name/description/Zod input schema,
 * and compacts that into a stable, deterministic JSON manifest — no per-tool
 * hand-written command code needed on the CLI side.
 *
 * Run: `bun run cli:manifest` (== `bun scripts/generate-cli-manifest.ts`).
 *
 * Why this can run as a plain `bun` script rather than needing bun:test's
 * mock.module harness: `@/lib/db` (lib/db/index.ts) only THROWS at import
 * time when DATABASE_URL is unset — it does not connect eagerly (postgres.js
 * lazy-connects on first query). Setting a dummy DATABASE_URL below before
 * the dynamic import of lib/mcp/server satisfies that guard without needing
 * a real database. The one real DB touch in the whole registration path is
 * lib/brain/mcp-sdk-adapter.ts firing a fire-and-forget
 * getOrCreateBrainProfile() query at registration time (see the baseline
 * test's comment on the same behaviour) — we point DATABASE_URL at an
 * unbound local port so that query fails fast (ECONNREFUSED) instead of
 * hanging or hitting a real dev DB, and swallow the resulting unhandled
 * rejection since we only read registered tool NAMES/SCHEMAS, never execute
 * a handler.
 */
process.env.DATABASE_URL ||= 'postgres://user:pass@127.0.0.1:59999/simpler_cli_manifest_dummy';
process.env.NODE_ENV ||= 'test';
process.on('unhandledRejection', () => {
  // Expected: the brain-profile fire-and-forget query above rejects against
  // the dummy unreachable DB. We never read its result — only tool registry
  // metadata — so this is safe to swallow.
});

import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

type ManifestArgType = 'string' | 'number' | 'boolean' | 'json';

interface ManifestArg {
  name: string;
  type: ManifestArgType;
  required: boolean;
  enum?: (string | number)[];
  desc?: string;
}

interface ManifestTool {
  name: string;
  cmd: string;
  domain: string;
  desc: string;
  destructive: boolean;
  scope?: string | string[];
  args: ManifestArg[];
}

interface Manifest {
  manifestVersion: 1;
  toolCount: number;
  domains: { name: string; tools: number }[];
  tools: ManifestTool[];
}

// ── cmd / domain mapping ────────────────────────────────────────────────
// Default rule: tool `a_b_c` -> domain "a", cmd "a b-c". Oddball tools that
// don't carry their domain as the first `_` segment get an explicit alias.
const CMD_ALIASES: Record<string, { cmd: string; domain: string }> = {
  whoami: { cmd: 'whoami', domain: 'whoami' },
  list_workflows: { cmd: 'workflows list', domain: 'workflows' },
  get_workflow: { cmd: 'workflows get', domain: 'workflows' },
};

function cmdAndDomain(name: string): { cmd: string; domain: string } {
  const alias = CMD_ALIASES[name];
  if (alias) return alias;
  const idx = name.indexOf('_');
  if (idx === -1) return { cmd: name, domain: name };
  const domain = name.slice(0, idx);
  const action = name.slice(idx + 1).replace(/_/g, '-');
  return { cmd: `${domain} ${action}`, domain };
}

// ── destructive classification ──────────────────────────────────────────
// Verb-pattern regex catches the vast majority; the explicit set is a
// belt-and-suspenders backstop for tools the regex might miss (in practice
// every one of these already matches the regex too — dedupe is automatic
// since we OR the two checks).
const DESTRUCTIVE_REGEX = /_(delete|remove|void|cancel|revoke)($|_)/;
const DESTRUCTIVE_EXTRAS = new Set<string>([
  'bookings_cancel',
  'contracts_void',
  'team_remove_member',
  'integrations_revoke',
  'email_subscribers_remove',
  'website_domains_remove',
  'project_members_remove',
  'brain_org_units_remove_member',
  'brain_document_required_reads_remove',
  'kanban_card_remove_blocker',
]);

function isDestructive(name: string): boolean {
  return DESTRUCTIVE_REGEX.test(name) || DESTRUCTIVE_EXTRAS.has(name);
}

// ── arg-schema compaction ───────────────────────────────────────────────
// nested objects/arrays/unions of >1 non-null branch compact to "json";
// a nullable primitive (anyOf [T, null]) compacts to T's own type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inferArgType(schema: any): ManifestArgType {
  if (!schema || typeof schema !== 'object') return 'json';
  if (schema.type === 'string') return 'string';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'object' || schema.type === 'array') return 'json';
  if (Array.isArray(schema.anyOf)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonNull = schema.anyOf.filter((s: any) => s?.type !== 'null');
    if (nonNull.length === 1) return inferArgType(nonNull[0]);
    return 'json';
  }
  if (Array.isArray(schema.oneOf)) return 'json';
  // No `type` key at all (an "any"-typed field, e.g. z.any()/z.unknown()).
  return 'json';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractEnum(schema: any): (string | number)[] | undefined {
  if (Array.isArray(schema?.enum)) return schema.enum;
  if (Array.isArray(schema?.anyOf)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nonNull = schema.anyOf.filter((s: any) => s?.type !== 'null');
    if (nonNull.length === 1 && Array.isArray(nonNull[0]?.enum)) return nonNull[0].enum;
  }
  return undefined;
}

function buildArgs(inputSchema: unknown): ManifestArg[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = z.toJSONSchema(inputSchema as any) as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties?: Record<string, any>;
    required?: string[];
  };
  const properties = jsonSchema.properties ?? {};
  const required = new Set(jsonSchema.required ?? []);
  const args: ManifestArg[] = [];
  for (const [name, propSchema] of Object.entries(properties)) {
    const arg: ManifestArg = {
      name,
      type: inferArgType(propSchema),
      required: required.has(name),
    };
    const enumVals = extractEnum(propSchema);
    if (enumVals) arg.enum = enumVals;
    const desc = propSchema?.description;
    if (typeof desc === 'string' && desc.length > 0) arg.desc = desc;
    args.push(arg);
  }
  return args;
}

async function main() {
  const { buildMcpServer } = await import('../lib/mcp/server');
  const { SUPPORTED_SCOPES } = await import('../lib/oauth/scopes');

  function ctx(scopes: string[]) {
    return {
      userId: 1,
      keyId: 1,
      scopes,
      client: { id: 1, company: 'CLI Manifest Generator' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function registeredTools(server: any): Record<string, {
    description?: string;
    title?: string;
    inputSchema?: unknown;
  }> {
    return server._registeredTools;
  }

  // ── full registry ('*' scope) — the source of truth for tool set ───────
  const fullServer = buildMcpServer(ctx(['*']));
  const fullRegistry = registeredTools(fullServer);
  const toolNames = Object.keys(fullRegistry).sort();

  // ── scope attribution ───────────────────────────────────────────────
  // Rebuild the server once per single scope string and record which tools
  // register under each — a tool's minimal scope is whichever single-scope
  // build(s) include it. `linkedin:read`/`linkedin:write` are gated in code
  // (lib/mcp/tools/linkedin.ts) but not yet in lib/oauth/scopes.ts's
  // SUPPORTED_SCOPES catalogue (an existing gap, unrelated to this
  // generator) — included explicitly here since we need the exact gating
  // string, not just what OAuth currently advertises.
  const scopeTestSet = [
    ...SUPPORTED_SCOPES.filter((s: string) => s !== '*'),
    'linkedin:read',
    'linkedin:write',
  ];
  // One tool (projects_propose_artifact_link) is gated on the AND of two
  // scopes (lib/mcp/tools/projects.ts: `hasScope(..., 'projects:write') &&
  // hasScope(..., 'brain:write')`), so no single-scope build ever registers
  // it — confirmed by reading the guard directly, not inferred/guessed.
  const scopeOverrides: Record<string, string[]> = {
    projects_propose_artifact_link: ['projects:write', 'brain:write'],
  };

  const emptyScopeNames = new Set(Object.keys(registeredTools(buildMcpServer(ctx([])))));
  const perScopeNames = new Map<string, Set<string>>();
  for (const scope of scopeTestSet) {
    perScopeNames.set(scope, new Set(Object.keys(registeredTools(buildMcpServer(ctx([scope]))))));
  }

  const omittedScope: string[] = [];
  function resolveScope(name: string): string | string[] | undefined {
    if (emptyScopeNames.has(name)) return undefined; // unscoped (whoami, workflow guides)
    if (scopeOverrides[name]) return scopeOverrides[name];
    const matches = scopeTestSet.filter((sc) => perScopeNames.get(sc)!.has(name));
    if (matches.length === 0) {
      omittedScope.push(name);
      return undefined;
    }
    return matches.length === 1 ? matches[0] : matches;
  }

  // ── assemble tools ──────────────────────────────────────────────────
  // Key order matters (deterministic output): name, cmd, domain, desc,
  // destructive, scope?, args — built in that order per-tool so
  // JSON.stringify emits it directly, no post-hoc re-keying needed.
  const domainCounts = new Map<string, number>();
  const orderedTools: ManifestTool[] = toolNames.map((name) => {
    const reg = fullRegistry[name];
    const { cmd, domain } = cmdAndDomain(name);
    domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    const scope = resolveScope(name);
    const tool: ManifestTool = {
      name,
      cmd,
      domain,
      desc: reg.description ?? reg.title ?? '',
      destructive: isDestructive(name),
      ...(scope !== undefined ? { scope } : {}),
      args: buildArgs(reg.inputSchema),
    };
    return tool;
  });

  const domains = [...domainCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, tools: count }));

  const manifest: Manifest = {
    manifestVersion: 1,
    toolCount: orderedTools.length,
    domains,
    tools: orderedTools,
  };

  const outDir = path.resolve(import.meta.dirname, '../packages/cli');
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'manifest.json');
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  const destructiveCount = orderedTools.filter((t) => t.destructive).length;
  console.log(`Wrote ${outPath}`);
  console.log(`  toolCount: ${manifest.toolCount}`);
  console.log(`  domains: ${domains.length}`);
  console.log(`  destructive: ${destructiveCount}`);
  if (omittedScope.length > 0) {
    console.log(`  scope omitted for ${omittedScope.length} tool(s) (no single-scope match, no override): ${omittedScope.join(', ')}`);
  }
}

main().catch((err) => {
  console.error('generate-cli-manifest failed:', err);
  process.exit(1);
});
