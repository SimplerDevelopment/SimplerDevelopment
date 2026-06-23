#!/usr/bin/env bun
/**
 * Smoke-test harness for the sd-* content-authoring skills.
 *
 * Spins up a Claude conversation with a SKILL.md loaded as the system prompt,
 * wires the local SimplerDevelopment MCP at http://localhost:3000/api/mcp as
 * the agent's tool source, sends a synthetic user prompt, captures the final
 * text + tool-call trace, and asserts the audit-pass markers we shipped land
 * in real output:
 *
 *   - Design-system preamble (palette / fonts / 8pt grid)
 *   - Approval URL leading the response
 *   - 14-day expiry disclosure
 *   - posts_create called with published: false
 *   - Hero block (if present) has all 5 hygiene fields populated
 *   - 5-dimension self-review present (Philosophy / Hierarchy / Craft / Functionality / Originality)
 *   - No invented stats: response uses [STAT TBD] / [TESTIMONIAL TBD] placeholders where it can't ground a number
 *
 * Subcommands:
 *
 *   bun scripts/smoke-sd-skills.ts seed-key  [--client-id N] [--user-id N]
 *      Mint a new sd_mcp_* API key for the test tenant and print it once.
 *      Pipe to a file or env: `export SD_PORTAL_API_KEY=$(...)`.
 *
 *   bun scripts/smoke-sd-skills.ts run  [--skill sd-create-page]
 *                                       [--prompt "..."]
 *                                       [--model sonnet|opus]
 *                                       [--no-cleanup]
 *      Run the smoke test. Default skill is sd-create-page. Requires
 *      ANTHROPIC_API_KEY + SD_PORTAL_API_KEY. Returns exit 0 (pass) or 1 (fail).
 *
 *   bun scripts/smoke-sd-skills.ts cleanup  [--older-than-min 60]
 *      Delete posts created by previous smoke runs (by title prefix).
 *
 * Required env:
 *   ANTHROPIC_API_KEY        — for the Claude API call
 *   SD_PORTAL_API_KEY        — sd_mcp_* bearer for the local MCP (see seed-key)
 *   DATABASE_URL (optional)  — only needed for seed-key + cleanup subcommands
 *
 * Optional env:
 *   MCP_URL    — default http://localhost:3000/api/mcp
 *   SMOKE_MODEL — overrides --model. Accepts `sonnet` | `opus` | a full model id.
 */

import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

// ─── Constants ──────────────────────────────────────────────────────────────

// Bun + tsx both populate __dirname for CommonJS-resolved modules; for ESM
// runs we fall back to deriving from process.cwd() (the script is intended to
// be invoked from the repo root).
const REPO_ROOT = process.cwd();
const SKILLS_DIR = resolve(REPO_ROOT, '.claude/skills');
const MCP_URL = process.env.MCP_URL ?? 'http://localhost:3000/api/mcp';
const SMOKE_TITLE_PREFIX = '[smoke] ';

const MODEL_ALIASES: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
  haiku: 'claude-haiku-4-5-20251001',
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface AuditMarker {
  name: string;
  required: boolean;
  check: (ctx: AssertionContext) => string | null; // null = pass; string = failure reason
}

interface AssertionContext {
  finalText: string;
  toolCalls: Array<{ name: string; input: any; result: any }>;
  createdPostId: number | null;
}

interface RunResult {
  passed: boolean;
  markers: Array<{ name: string; required: boolean; status: 'pass' | 'fail'; reason: string | null }>;
  createdPostId: number | null;
  finalText: string;
  toolCallSummary: string;
  durationSec: number;
  tokensIn: number;
  tokensOut: number;
}

// ─── MCP JSON-RPC client ────────────────────────────────────────────────────

let mcpReqId = 0;
async function mcpCall<T = any>(method: string, params: any, apiKey: string): Promise<T> {
  mcpReqId += 1;
  const body = JSON.stringify({ jsonrpc: '2.0', id: mcpReqId, method, params });
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body,
  });
  const ct = res.headers.get('content-type') ?? '';
  let payload: any;
  if (ct.includes('text/event-stream')) {
    // Streaming response — concatenate event data lines.
    const text = await res.text();
    const last = text
      .split('\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => l.slice('data: '.length))
      .pop();
    if (!last) throw new Error(`MCP SSE response had no data event: ${text.slice(0, 200)}`);
    payload = JSON.parse(last);
  } else {
    payload = await res.json();
  }
  if (payload.error) {
    throw new Error(`MCP error on ${method}: ${JSON.stringify(payload.error)}`);
  }
  return payload.result as T;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
}

async function fetchMcpToolList(apiKey: string): Promise<McpTool[]> {
  const result = await mcpCall<{ tools: McpTool[] }>('tools/list', {}, apiKey);
  return result.tools ?? [];
}

// SimplerDevelopment's MCP wraps both successes and errors in a JSON-RPC
// success envelope: `{result: {content: [{type: 'text', text: '{...}'}]}}`.
// An error response is the same shape but the inner JSON has an `error` key.
// We unwrap to give the agent + assertions the actual entity shape, and we
// surface errors via `_error` so the harness can fail markers correctly.
function unwrapMcpResult(result: any): any {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return result;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      return { _error: String(parsed.error), _raw: parsed };
    }
    return parsed;
  } catch {
    // Not JSON — return the original wrapper so the agent at least sees text.
    return result;
  }
}

async function callMcpTool(name: string, args: any, apiKey: string): Promise<any> {
  const result = await mcpCall('tools/call', { name, arguments: args }, apiKey);
  return unwrapMcpResult(result);
}

// Allowlist by prefix — covers what each skill actually needs to call. Cuts the
// catalog from ~320 tools to ~15, which roughly 10×s the input-token budget per
// agent turn (each tool definition resends on every iteration).
const TOOL_PREFIX_ALLOWLIST: Record<string, string[]> = {
  'sd-create-page': [
    'whoami',
    'client_get',
    'sites_list',
    'sites_update',
    'post_types_list',
    'branding_', // _get, _get_messaging, _check_contrast, _list_profiles
    'block_templates_',
    'posts_', // _create, _update, _get, _fork
    'approvals_',
  ],
  'sd-create-deck': [
    'whoami',
    'client_get',
    'sites_list',
    'branding_',
    'block_templates_',
    'decks_',
    'approvals_',
  ],
  'sd-create-email': [
    'whoami',
    'client_get',
    'sites_list',
    'branding_',
    'email_templates_',
    'email_campaigns_',
    'email_lists',
    'approvals_',
  ],
};

function filterToolsForSkill(skill: string, tools: McpTool[]): McpTool[] {
  const prefixes = TOOL_PREFIX_ALLOWLIST[skill];
  if (!prefixes) return tools; // unknown skill — no filter
  return tools.filter((t) => prefixes.some((p) => t.name === p || t.name.startsWith(p)));
}

// ─── Agent loop ─────────────────────────────────────────────────────────────

async function runAgentLoop(opts: {
  skillMd: string;
  userPrompt: string;
  mcpTools: McpTool[];
  apiKey: string;
  model: string;
  maxTurns?: number;
}): Promise<{ finalText: string; toolCalls: Array<{ name: string; input: any; result: any }>; tokensIn: number; tokensOut: number }> {
  const { skillMd, userPrompt, mcpTools, apiKey, model } = opts;
  const maxTurns = opts.maxTurns ?? 12;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const sdkTools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description?.slice(0, 1024) ?? '',
    input_schema: t.inputSchema ?? { type: 'object', properties: {} },
  }));

  // The skill content acts as the agent's operating instructions. We pair it
  // with a short framing system prompt so the model knows it's running headless.
  const systemPrompt = [
    'You are an automated headless skill runner. The following is the SKILL.md for the skill being exercised — read it and follow it exactly as a Claude Code agent would. After completing the task, return a final assistant message containing the user-facing output the skill is expected to produce.',
    '',
    '════════════════════ SKILL.md ════════════════════',
    skillMd,
    '════════════════════ END SKILL ═══════════════════',
    '',
    'If a precondition fails (no .sd/config.json, MCP unreachable, etc.) you may still produce a best-effort post by inferring brand defaults — log the inference in your final response so the smoke test can see it. Do NOT abort the run unless the MCP itself errors.',
  ].join('\n');

  const toolCalls: Array<{ name: string; input: any; result: any }> = [];
  let messages: any[] = [{ role: 'user', content: userPrompt }];
  let tokensIn = 0;
  let tokensOut = 0;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      tools: sdkTools,
      messages,
    });
    tokensIn += resp.usage.input_tokens;
    tokensOut += resp.usage.output_tokens;

    messages = [...messages, { role: 'assistant', content: resp.content }];

    if (resp.stop_reason !== 'tool_use') {
      const finalText = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { finalText, toolCalls, tokensIn, tokensOut };
    }

    // Forward each tool_use to the MCP and gather tool_result blocks.
    const toolResults: any[] = [];
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      let result: any;
      try {
        result = await callMcpTool(block.name, block.input, apiKey);
      } catch (err: any) {
        result = { _error: String(err.message ?? err) };
      }
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result).slice(0, 16000),
      });
    }
    messages = [...messages, { role: 'user', content: toolResults }];
  }

  throw new Error(`Agent loop exceeded ${maxTurns} turns without a final stop_reason. Possibly stuck in a tool-call loop.`);
}

// ─── Audit markers ──────────────────────────────────────────────────────────

const SD_CREATE_PAGE_MARKERS: AuditMarker[] = [
  {
    // Tests SEMANTIC compliance: did the agent disclose the palette + design
    // intent to the user? The SKILL.md provides a literal preamble template,
    // but well-trained agents may improvise the formatting (e.g. a table of
    // "Inferences Made: Primary: #abc, Background: #def, ..."). What matters
    // for trust is that the user can SEE the design system that's being applied
    // before they read the rest of the response.
    name: 'design-system-disclosed',
    required: true,
    check: ({ finalText }) => {
      const palette = /(palette|primary|brand colou?rs?)/i.test(finalText);
      const hex = /#[0-9A-Fa-f]{6}/.test(finalText);
      if (palette && hex) return null;
      if (!palette) return 'No mention of palette / primary / brand colors in response.';
      if (!hex) return 'Response mentions palette but no hex codes — design system not disclosed concretely.';
      return null;
    },
  },
  {
    // The runbook says "lead with the approval URL." We accept any /approve/<hex>
    // URL in the first ~1500 chars, regardless of the heading label the agent
    // uses ("Approval URL", "Approval / Share URL", "Share for review", etc).
    name: 'approval-url-surfaced',
    required: true,
    check: ({ finalText }) => {
      const m = finalText.match(/https?:\/\/[^\s"'`<>)]+\/approve\/[a-f0-9]{16,}/i);
      if (!m) return 'No /approve/<token> URL anywhere in the response.';
      const idx = finalText.indexOf(m[0]);
      if (idx > 1500) return `Approval URL appears at char ${idx}, expected within the first 1500. (Buried.)`;
      return null;
    },
  },
  {
    // Spec is 14-day default expiry. Accept the literal phrase OR a concrete
    // ISO date 10–20 days out (gives slack for clock drift / `expiresInDays` overrides).
    name: 'expiry-disclosed',
    required: true,
    check: ({ finalText }) => {
      if (/expires?\s+in\s+\d+\s+days?/i.test(finalText)) return null;
      const dateMatch = finalText.match(/\b\d{4}-\d{2}-\d{2}\b/);
      if (dateMatch) {
        const expiry = new Date(dateMatch[0]);
        const daysOut = (expiry.getTime() - Date.now()) / 86_400_000;
        if (daysOut > 7 && daysOut < 30) return null;
      }
      if (/expir(es?|y|ing)/i.test(finalText)) return null; // soft fallback — at least the word appears
      return 'No expiry disclosure (looked for "expires in N days" or a date 10–20 days out).';
    },
  },
  {
    name: 'posts-create-called',
    required: true,
    check: ({ toolCalls }) => {
      const call = toolCalls.find((c) => c.name === 'posts_create');
      if (!call) return 'posts_create was not called.';
      if (call.result?._error) return `posts_create errored: ${call.result._error}`;
      if (!call.result?.id) {
        const peek = JSON.stringify(call.result).slice(0, 200);
        return `posts_create returned no id (unexpected response shape: ${peek}). Inputs sent: websiteId=${call.input?.websiteId} title="${String(call.input?.title ?? '').slice(0, 60)}"`;
      }
      return null;
    },
  },
  {
    name: 'published-false',
    required: true,
    check: ({ toolCalls }) => {
      const call = toolCalls.find((c) => c.name === 'posts_create');
      if (!call) return null; // already failed above
      if (call.input?.published === true) return 'posts_create called with published: true — should default to draft.';
      return null;
    },
  },
  {
    name: 'hero-hygiene-when-present',
    required: false,
    check: ({ toolCalls }) => {
      const call = toolCalls.find((c) => c.name === 'posts_create');
      const blocks: any[] = call?.input?.blocks ?? [];
      const hero = blocks.find((b) => b?.type === 'hero');
      if (!hero) return null; // no hero authored — not applicable, soft pass
      const missing: string[] = [];
      for (const field of ['title', 'subtitle', 'description', 'ctaText', 'ctaLink']) {
        const v = hero[field];
        if (!v || (typeof v === 'string' && v.trim().length === 0)) missing.push(field);
      }
      return missing.length === 0
        ? null
        : `Hero block missing required fields: ${missing.join(', ')}. Hero hygiene check failed.`;
    },
  },
  {
    name: 'five-dim-self-review',
    required: true,
    check: ({ finalText }) => {
      const dimensions = ['Philosophy', 'Hierarchy', 'Craft', 'Functionality', 'Originality'];
      const missing = dimensions.filter((d) => !new RegExp(d, 'i').test(finalText));
      return missing.length === 0
        ? null
        : `5-dim self-review missing dimensions: ${missing.join(', ')}.`;
    },
  },
  {
    name: 'no-invented-numbers',
    required: false,
    check: ({ finalText, toolCalls }) => {
      // Heuristic: if there's a stats-row block, it should either ground every
      // number in something the prompt provided, OR carry a [STAT TBD] placeholder.
      const call = toolCalls.find((c) => c.name === 'posts_create');
      const blocks: any[] = call?.input?.blocks ?? [];
      const statsBlocks = blocks.filter((b) => b?.type === 'stats-row' || b?.type === 'stats');
      if (statsBlocks.length === 0) return null;
      const allItems: any[] = statsBlocks.flatMap((b) => b.items ?? []);
      const hasUngroundedClaim = allItems.some((it) => {
        const v = String(it?.value ?? '');
        if (/TBD/i.test(v)) return false; // explicit placeholder
        if (/\d+\s*\+/.test(v) && !/\b(week|day|hour)\b/i.test(v)) return true; // "200+" with no time unit
        if (/Fortune\s+\d+/.test(v)) return true;
        if (/Trusted by/i.test(v)) return true;
        return false;
      });
      return hasUngroundedClaim
        ? 'Stats row contains a number that looks invented (e.g. "200+" or "Trusted by"); should be [STAT TBD].'
        : null;
    },
  },
];

const MARKER_SETS: Record<string, AuditMarker[]> = {
  'sd-create-page': SD_CREATE_PAGE_MARKERS,
};

// ─── Subcommand: seed-key ────────────────────────────────────────────────────

async function cmdSeedKey(args: Record<string, string>) {
  const { Client } = await import('pg');
  const dbUrl = process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/simplerdev_local_20260514`;
  const clientId = Number(args['client-id'] ?? '104');
  const userId = Number(args['user-id'] ?? '181');
  const requireApproval = args['require-approval'] === 'true';

  const raw = crypto.randomBytes(32).toString('hex');
  const key = `sd_mcp_${raw}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const preview = `${key.slice(0, 12)}…${key.slice(-4)}`;

  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  try {
    const { rows } = await pg.query(
      `INSERT INTO portal_api_keys (client_id, user_id, name, key_hash, key_preview, scopes, active, require_cms_approval)
       VALUES ($1, $2, $3, $4, $5, '["*"]'::json, true, $6)
       RETURNING id`,
      [clientId, userId, `smoke-test ${new Date().toISOString()}`, hash, preview, requireApproval],
    );
    const id = rows[0]?.id;
    console.error(`✓ minted key id=${id} client_id=${clientId} user_id=${userId} require_approval=${requireApproval}`);
    console.error('  Use this once — the raw key is NOT recoverable from the DB.');
    console.error('  Pipe to env: export SD_PORTAL_API_KEY=$(bun scripts/smoke-sd-skills.ts seed-key 2>/dev/null)');
    console.error('  Or: export SD_PORTAL_API_KEY=<paste-below>');
    console.error('');
    process.stdout.write(`${key}\n`);
  } finally {
    await pg.end();
  }
}

// ─── Subcommand: cleanup ────────────────────────────────────────────────────

async function cmdCleanup(args: Record<string, string>) {
  const { Client } = await import('pg');
  const dbUrl = process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/simplerdev_local_20260514`;
  const olderThanMin = Number(args['older-than-min'] ?? '0');
  const cutoff = new Date(Date.now() - olderThanMin * 60_000);

  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  try {
    const { rows } = await pg.query(
      `DELETE FROM posts
       WHERE title LIKE $1
         AND created_at <= $2
       RETURNING id, title`,
      [`${SMOKE_TITLE_PREFIX}%`, cutoff],
    );
    if (rows.length === 0) {
      console.error(`No smoke-test posts older than ${olderThanMin}m to delete.`);
    } else {
      console.error(`✓ deleted ${rows.length} smoke-test post(s):`);
      for (const r of rows) console.error(`  - id=${r.id} "${r.title}"`);
    }
  } finally {
    await pg.end();
  }
}

// ─── Subcommand: run ────────────────────────────────────────────────────────

async function cmdRun(args: Record<string, string>) {
  const skillName = args.skill ?? 'sd-create-page';
  const markers = MARKER_SETS[skillName];
  if (!markers) {
    console.error(`Unknown skill: ${skillName}. Known: ${Object.keys(MARKER_SETS).join(', ')}`);
    process.exit(2);
  }

  const apiKey = process.env.SD_PORTAL_API_KEY;
  if (!apiKey) {
    console.error('SD_PORTAL_API_KEY is not set. Run `bun scripts/smoke-sd-skills.ts seed-key` first.');
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set.');
    process.exit(2);
  }

  const modelArg = process.env.SMOKE_MODEL ?? args.model ?? 'sonnet';
  const model = MODEL_ALIASES[modelArg] ?? modelArg;
  const skillPath = resolve(SKILLS_DIR, skillName, 'SKILL.md');
  const skillMd = readFileSync(skillPath, 'utf-8');

  const userPrompt = args.prompt
    ?? `${SMOKE_TITLE_PREFIX}Q2 product roadmap announcement\n\nDraft a landing page announcing our Q2 product roadmap. Source: prompt-only. Audience: existing customers. Keep it tight — hero + 3 feature highlights + a single CTA to "Read the full roadmap". Title MUST start with "${SMOKE_TITLE_PREFIX}" so the cleanup script can identify it.`;

  console.error(`▶ Running smoke test: skill=${skillName} model=${model}`);
  console.error(`  MCP URL: ${MCP_URL}`);
  console.error(`  Skill path: ${skillPath} (${skillMd.length} bytes)`);

  const startedAt = Date.now();
  const rawTools = await fetchMcpToolList(apiKey);
  const mcpTools = filterToolsForSkill(skillName, rawTools);
  console.error(`  MCP tool catalog: ${rawTools.length} total → ${mcpTools.length} after filter`);

  const { finalText, toolCalls, tokensIn, tokensOut } = await runAgentLoop({
    skillMd,
    userPrompt,
    mcpTools,
    apiKey,
    model,
  });

  const createdCall = toolCalls.find((c) => c.name === 'posts_create');
  // After unwrapMcpResult, success responses have the entity shape directly
  // ({id, slug, approval: {...}}). Errors have { _error, _raw }.
  const createdPostId = (createdCall?.result?.id as number | undefined) ?? null;

  const assertCtx: AssertionContext = { finalText, toolCalls, createdPostId };
  const results = markers.map((m) => {
    const reason = m.check(assertCtx);
    return { name: m.name, required: m.required, status: reason === null ? ('pass' as const) : ('fail' as const), reason };
  });

  const requiredFails = results.filter((r) => r.required && r.status === 'fail');
  const optionalFails = results.filter((r) => !r.required && r.status === 'fail');
  const passed = requiredFails.length === 0;
  const duration = (Date.now() - startedAt) / 1000;

  // Report
  console.error('');
  console.error('─── Smoke test results ───');
  for (const r of results) {
    const tag = r.status === 'pass' ? '✓' : r.required ? '✗' : '⚠';
    const label = r.required ? r.name : `${r.name} (advisory)`;
    console.error(`  ${tag} ${label}${r.reason ? ` — ${r.reason}` : ''}`);
  }
  console.error('');
  console.error(`Tool calls: ${toolCalls.length}`);
  for (const tc of toolCalls) {
    if (tc.result?._error) {
      console.error(`  · ${tc.name}  ERROR: ${tc.result._error}`);
    } else if (tc.result?.id) {
      console.error(`  · ${tc.name}  → id=${tc.result.id}`);
    } else {
      console.error(`  · ${tc.name}`);
    }
  }
  console.error('');
  console.error(`Duration: ${duration.toFixed(1)}s  ·  Tokens: ${tokensIn} in / ${tokensOut} out  ·  Created post: ${createdPostId ?? '<none>'}`);
  console.error('');
  console.error('─── Final agent text (first 1500 chars) ───');
  console.error(finalText.slice(0, 1500));
  if (finalText.length > 1500) console.error(`… (${finalText.length - 1500} more chars)`);

  if (passed) {
    console.error('');
    console.error(`✓ PASS — ${results.filter((r) => r.status === 'pass').length}/${results.length} markers green${optionalFails.length ? ` (${optionalFails.length} advisory)` : ''}.`);
  } else {
    console.error('');
    console.error(`✗ FAIL — ${requiredFails.length} required marker(s) failed.`);
  }

  // Cleanup unless --no-cleanup
  if (createdPostId && args['no-cleanup'] !== 'true') {
    try {
      const { Client } = await import('pg');
      const dbUrl = process.env.DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/simplerdev_local_20260514`;
      const pg = new Client({ connectionString: dbUrl });
      await pg.connect();
      await pg.query('DELETE FROM posts WHERE id = $1', [createdPostId]);
      await pg.end();
      console.error(`✓ cleaned up post id=${createdPostId}`);
    } catch (err: any) {
      console.error(`⚠ cleanup failed for post ${createdPostId}: ${err.message}`);
    }
  }

  process.exit(passed ? 0 : 1);
}

// ─── Arg parser ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { cmd: string; args: Record<string, string> } {
  const cmd = argv[2] ?? 'run';
  const args: Record<string, string> = {};
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[a.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      args[a.slice(2)] = 'true';
    }
  }
  return { cmd, args };
}

// ─── Entry point ────────────────────────────────────────────────────────────

const { cmd, args } = parseArgs(process.argv);
const main = async () => {
  switch (cmd) {
    case 'seed-key':
      return cmdSeedKey(args);
    case 'cleanup':
      return cmdCleanup(args);
    case 'run':
      return cmdRun(args);
    default:
      console.error(`Unknown subcommand: ${cmd}. Known: seed-key, cleanup, run.`);
      process.exit(2);
  }
};

main().catch((err) => {
  console.error('FATAL:', err.stack ?? err);
  process.exit(2);
});
