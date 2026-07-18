/**
 * Per-call telemetry for the portal MCP server.
 *
 * `wrapRegisterTool(server, ctx)` monkey-patches `server.registerTool` so every
 * tool registration after the call point is instrumented:
 *   - times the handler
 *   - measures request + response bytes
 *   - estimates token cost (content-aware: JSON / hex / CJK / prose)
 *   - writes a row to `mcp_tool_calls` (fire-and-forget; telemetry failures
 *     never propagate)
 *   - injects `_meta.usage` into the response so MCP clients that care can
 *     surface the cost (per MCP spec 2025-06-18, `_meta` is the standard
 *     extension channel)
 *
 * Single chokepoint instead of 176 hand-wrapped registerTool sites — the
 * `@modelcontextprotocol/sdk@1.29.0` doesn't expose middleware, so monkey-
 * patching the method is the only one-shot path.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { mcpToolCalls, agentAuditLogs, agentActionCaptures } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { redactInputs, redactSecretsOnly } from '@/lib/mcp/audit-redact';
import { isHighRiskTool } from '@/lib/mcp/high-risk-tools';
import { encryptApiKey } from '@/lib/crypto/api-key';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { notifyApprovers } from '@/lib/crm/notifications';

const TELEMETRY_VERSION = '1.0';

/**
 * AAF-003: per-credential rate limit + high-risk-burst anomaly signal on
 * every MCP tool call. Lives here (not a new module) because this is the
 * single chokepoint every tool call already passes through.
 *
 *   - `MCP_TOOL_RATE_LIMIT` (default 240/min) — PREVENTIVE. Over the limit,
 *     the tool handler does not run; the caller gets a throttle error.
 *   - `MCP_HIGH_RISK_BURST` (default 15/min) — DETECTIVE ONLY. This is a
 *     *separate*, higher-sensitivity counter scoped to high-risk tools
 *     (`isHighRiskTool`). Crossing it does NOT block the call — the
 *     preventive approval-gate matrix (AAF-001) already handles blocking
 *     high-risk writes; this just alerts an admin so a human can review an
 *     unusually bursty credential (e.g. a compromised/injected agent).
 *
 * Both re-use `checkRateLimit` (`lib/security/rate-limit.ts`) — already
 * sliding-window + fail-open + Upstash-backed with an in-memory fallback.
 * No new limiter is introduced.
 */
const OVERALL_LIMIT = Number(process.env.MCP_TOOL_RATE_LIMIT) || 240;
const HIGH_RISK_BURST = Number(process.env.MCP_HIGH_RISK_BURST) || 15;

/**
 * Stable per-credential bucket key: prefer the API key / OAuth token id
 * (the actual credential being throttled) and fall back to the portal
 * user id for session-based callers with no key (e.g. the web AI-chat
 * route's synthetic gate ctx — see `PortalMcpContext.keyId` doc comment).
 * Returns null when neither identity is present, meaning the call is not
 * rate limited (there's no stable bucket to key it by).
 */
export function credentialKey(ctx: PortalMcpContext): string | null {
  if (ctx.keyId != null) return 'k' + ctx.keyId;
  if (ctx.userId != null) return 'u' + ctx.userId;
  return null;
}

/**
 * Detective anomaly signal for high-risk tools only. Fire-and-forget and
 * fully try/caught — must never throw into or delay the tool call, and is
 * deliberately NOT awaited by the caller (runs after the decision to
 * execute, in parallel with the handler, never gating it).
 *
 * Debounced via a third `checkRateLimit` key so a sustained burst fires at
 * most one `notifyApprovers` alert per credential per 60s window, instead
 * of paging on every call once the burst threshold is crossed.
 */
export function checkHighRiskAnomaly(toolName: string, cred: string, ctx: PortalMcpContext): void {
  if (!isHighRiskTool(toolName)) return;

  void (async () => {
    try {
      const withinBurstLimit = await checkRateLimit(
        'mcp-hr-burst:' + cred,
        HIGH_RISK_BURST,
        60_000,
      );
      if (withinBurstLimit) return; // no anomaly

      const firstAlertThisWindow = await checkRateLimit('mcp-hr-alert:' + cred, 1, 60_000);
      if (!firstAlertThisWindow) return; // already alerted this minute — debounced

      await notifyApprovers({
        clientId: ctx.client.id,
        type: 'agent_anomaly',
        title: 'Unusual agent activity',
        body: `A credential issued an unusually high volume of high-risk tool calls (>${HIGH_RISK_BURST}/min). Review the MCP approvals + audit trail.`,
        entityType: 'mcp_anomaly',
      });
    } catch (err) {
      console.warn('[mcp-telemetry] anomaly detection failed:', err);
    }
  })();
}

/**
 * Content-aware token estimate for a UTF-8 string. Calibrated for Claude 4.7
 * (May 2026 measurements):
 *
 *   CJK characters         ~1.0 chars / token
 *   Long hex/UUID runs     ~2.0 chars / token   (16+ contiguous hex digits)
 *   Everything else        ~3.0 chars / token   (JSON / English prose)
 *
 * A single coefficient is wrong by 30–60% across content types — important
 * because MCP responses mix dense JSON with English description fields and
 * occasional UUIDs. This is still an estimate; Round 4a will reconcile a 5%
 * sample against Claude's free count_tokens API and self-tune the divisors.
 *
 * NOTE: base64 also tokenizes ~3.0 chars/tok but never appears in MCP output
 * because tools return URLs, not inline file content. If that changes, add
 * detection here.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Match U+3000–U+9FFF (CJK Unified + Hiragana + Katakana) and Hangul.
  let cjkChars = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) cjkChars++;
  }

  // Long hex runs (UUIDs, hashes, IDs) tokenize about 1 token per 2 chars.
  const hexRuns = text.match(/[0-9a-f]{16,}/gi);
  const hexChars = hexRuns ? hexRuns.reduce((sum, m) => sum + m.length, 0) : 0;

  const otherChars = Math.max(0, text.length - cjkChars - hexChars);

  return Math.ceil(cjkChars / 1.0 + hexChars / 2.0 + otherChars / 3.0);
}

interface ToolCallLog {
  clientId: number;
  apiKeyId: number | null;
  userId: number | null;
  toolName: string;
  requestBytes: number;
  responseBytes: number;
  estimatedTokens: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
}

/**
 * Fire-and-forget insert. A telemetry failure must never break a tool call —
 * we swallow + console.warn so the row loss is visible in dev but invisible
 * to the caller. Mirrors the pattern in `lib/mcp-auth.ts:55–59` for
 * `lastUsedAt` updates.
 */
function logToolCall(log: ToolCallLog): void {
  void db
    .insert(mcpToolCalls)
    .values({
      clientId: log.clientId,
      apiKeyId: log.apiKeyId ?? null,
      userId: log.userId ?? null,
      toolName: log.toolName,
      requestBytes: log.requestBytes,
      responseBytes: log.responseBytes,
      estimatedTokens: log.estimatedTokens,
      durationMs: log.durationMs,
      success: log.success,
      errorMessage: log.errorMessage ?? null,
    })
    .then(() => {})
    .catch((err) => {
      console.warn('[mcp-telemetry] insert failed:', err);
    });
}

interface AuditRowParams {
  clientId: number;
  apiKeyId: number | null;
  userId: number | null;
  runId: string | null | undefined;
  toolName: string;
  inputArgs: unknown;
  responseText: string;
  status: 'success' | 'denied' | 'error';
  errorMessage: string | null;
  durationMs: number;
}

/**
 * Fire-and-forget insert into agent_action_logs (the durable audit table).
 * Dual-write alongside logToolCall: telemetry (mcp_tool_calls, 14-day TTL)
 * and audit (agent_action_logs, permanent) serve different consumers.
 * Failures are swallowed — this must never affect tool latency or behavior.
 *
 * Additionally, for HIGH-RISK tools only (`isHighRiskTool`), fires a second,
 * independent fire-and-forget insert into `agent_action_captures` — an
 * encrypted, reconstructable copy of the (secrets-redacted, un-truncated)
 * arguments. See the internal ADR "high-risk-agent-arg-capture" (AAF-001;
 * not part of this public release). This is additive: it never replaces the hash log
 * (`lib/audit/agent-action-log.ts`) or this redacted summary log, and a
 * capture failure must never affect the tool call either — kept as its own
 * independent `.catch()` rather than nested inside the audit-row promise so
 * one insert failing can never suppress the other.
 */
function logAuditRow(p: AuditRowParams): void {
  void db
    .insert(agentAuditLogs)
    .values({
      clientId: p.clientId,
      runId: p.runId ?? null,
      apiKeyId: p.apiKeyId ?? null,
      userId: p.userId ?? null,
      toolName: p.toolName,
      inputsSummary: redactInputs(p.inputArgs) as Record<string, unknown>,
      outputSummary: p.responseText.slice(0, 2048) || null,
      status: p.status,
      errorMessage: p.errorMessage ?? null,
      durationMs: p.durationMs,
    })
    .then(() => {})
    .catch((err) => {
      console.warn('[mcp-telemetry] audit insert failed:', err);
    });
}

/**
 * Fire-and-forget encrypted argument capture for a high-risk tool call.
 * `auditLogId` is left null — linking it would require restructuring the
 * audit insert above (e.g. `.returning()`) to plumb the id back into an
 * unrelated write's error-handling chain, which risks coupling one insert's
 * failure to the other; out of scope for AAF-001.
 *
 * `encryptApiKey` (and `JSON.stringify`) run synchronously and can throw
 * (e.g. missing `ENCRYPTION_KEY`, circular args) — wrapped in try/catch so a
 * bad capture attempt never throws into the caller (`logAuditRow`, itself
 * called from the tool-call wrapper).
 */
/** Max time the wrapped handler will wait for the capture insert before returning
 *  anyway. The insert normally commits in a few ms; this is a safety cap so a slow
 *  DB can never hang a tool call. */
const CAPTURE_PERSIST_TIMEOUT_MS = 3000;

/**
 * Minimal params needed to persist an AAF-001 forensic capture. A subset of
 * `AuditRowParams` (which also carries audit-log-only fields like `runId` /
 * `responseText` / `status` that the capture row doesn't need) so callers
 * outside this module — e.g. `lib/mcp/server.ts`'s real inline tool shadow —
 * don't have to construct a full audit row just to capture a high-risk call.
 */
export interface HighRiskCaptureInput {
  clientId: number;
  toolName: string;
  keyId: number | null;
  userId: number | null;
  inputArgs: unknown;
}

/**
 * AAF-001 forensic capture. AWAITED by the wrapped handler for high-risk tools (a
 * rare subset — deletes/sends/voids/etc.) so the encrypted record is DURABLE: a
 * plain fire-and-forget insert fired after the MCP response can be dropped before it
 * commits under the production server (which is why the e2e caught this where the
 * mocked-DB unit test structurally could not). Bounded by CAPTURE_PERSIST_TIMEOUT_MS
 * and fully try/caught so it never throws into, or hangs, the tool call.
 */
export async function persistHighRiskCapture(p: HighRiskCaptureInput): Promise<void> {
  let ciphertext: string;
  try {
    ciphertext = encryptApiKey(JSON.stringify(redactSecretsOnly(p.inputArgs)));
  } catch (err) {
    console.warn('[mcp-telemetry] capture encrypt failed:', err);
    return;
  }
  try {
    await Promise.race([
      db.insert(agentActionCaptures).values({
        clientId: p.clientId,
        auditLogId: null,
        toolName: p.toolName,
        keyId: p.keyId ?? null,
        userId: p.userId ?? null,
        ciphertext,
      }),
      new Promise<void>((resolve) => setTimeout(resolve, CAPTURE_PERSIST_TIMEOUT_MS)),
    ]);
  } catch (err) {
    console.warn('[mcp-telemetry] capture insert failed:', err);
  }
}

interface ToolResultEnvelope {
  content?: Array<{ type?: string; text?: string }>;
  _meta?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Pull the JSON-encoded text payload out of an MCP tool result. Tools in this
 * codebase return `{ content: [{ type: 'text', text: '...' }] }` via the
 * `json()` helper in lib/mcp/server.ts — so the first text content block is
 * the response body for byte/token accounting.
 *
 * If a tool returns no text (image-only, resource-only, etc.) this returns
 * an empty string — we still log the call but `responseBytes` will be 0.
 */
function extractResponseText(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as ToolResultEnvelope;
  if (!Array.isArray(r.content)) return '';
  for (const block of r.content) {
    if (block && typeof block.text === 'string') return block.text;
  }
  return '';
}

/**
 * Wrap `server.registerTool` so every subsequent registration is
 * instrumented. Call this at the top of `buildMcpServer()` BEFORE any
 * `registerTool` calls (including those made by adapter modules).
 *
 * After this returns, the original `server.registerTool` is replaced with a
 * version that wraps the handler. The wrapping is invisible to the SDK and
 * the rest of the codebase — same signature, same return value, just plus
 * telemetry on every invocation.
 */
export function wrapRegisterTool(server: McpServer, ctx: PortalMcpContext): void {
  // Bail in test environments where the DB pool isn't available — there's no
  // value in writing telemetry rows during the unit-test suite.
  if (process.env.MCP_TELEMETRY_DISABLED === '1') return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = server.registerTool.bind(server) as any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): any => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = async (...args: any[]): Promise<ToolResultEnvelope> => {
      const start = performance.now();
      const inputArgs = args[0] ?? {};
      const requestBytes = (() => {
        try {
          return Buffer.byteLength(JSON.stringify(inputArgs), 'utf8');
        } catch {
          return 0;
        }
      })();

      // AAF-003 — per-credential rate limit, BEFORE the handler runs. Fail
      // open: a limiter outage must never take down the MCP surface, so any
      // error from checkRateLimit (belt-and-suspenders on top of
      // checkRateLimit's own fail-open) allows the call through rather than
      // blocking it. Note: this whole wrapper — including the rate limit —
      // is skipped when MCP_TELEMETRY_DISABLED=1 short-circuits above; a
      // limiter is a control, not telemetry, but there's no other chokepoint
      // to hook it into today.
      const cred = credentialKey(ctx);
      if (cred) {
        try {
          const allowed = await checkRateLimit('mcp-tool:' + cred, OVERALL_LIMIT, 60_000);
          if (!allowed) {
            return {
              content: [
                {
                  type: 'text',
                  text: 'Rate limit exceeded: too many MCP tool calls in the last minute. Slow down and retry shortly.',
                },
              ],
              isError: true,
            };
          }
        } catch (err) {
          console.warn('[mcp-telemetry] rate limit check failed, allowing call:', err);
        }

        // Detective backstop — never gates execution, runs alongside it.
        checkHighRiskAnomaly(name, cred, ctx);
      }

      let result: ToolResultEnvelope;
      let success = true;
      let errorMessage: string | null = null;

      try {
        result = (await handler(...args)) as ToolResultEnvelope;
        // Tools signal logical errors via `isError: true` rather than throwing
        // (the `denied()` helper for example). Reflect that in telemetry.
        if (result?.isError === true) {
          success = false;
          errorMessage = extractResponseText(result).slice(0, 500) || 'tool returned isError';
        }
      } catch (err) {
        success = false;
        errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
        const durationMs = Math.round(performance.now() - start);
        logToolCall({
          clientId: ctx.client.id,
          apiKeyId: ctx.keyId ?? null,
          userId: ctx.userId ?? null,
          toolName: name,
          requestBytes,
          responseBytes: 0,
          estimatedTokens: 0,
          durationMs,
          success: false,
          errorMessage,
        });
        const auditRow: AuditRowParams = {
          clientId: ctx.client.id,
          apiKeyId: ctx.keyId ?? null,
          userId: ctx.userId ?? null,
          runId: ctx.runId ?? null,
          toolName: name,
          inputArgs,
          responseText: '',
          status: 'error',
          errorMessage,
          durationMs,
        };
        logAuditRow(auditRow);
        if (isHighRiskTool(name)) {
          await persistHighRiskCapture({
            clientId: auditRow.clientId,
            toolName: auditRow.toolName,
            keyId: auditRow.apiKeyId,
            userId: auditRow.userId,
            inputArgs: auditRow.inputArgs,
          });
        }
        throw err;
      }

      const durationMs = Math.round(performance.now() - start);
      const responseText = extractResponseText(result);
      const responseBytes = Buffer.byteLength(responseText, 'utf8');
      const estimatedTokens = estimateTokens(responseText);

      logToolCall({
        clientId: ctx.client.id,
        apiKeyId: ctx.keyId ?? null,
        userId: ctx.userId ?? null,
        toolName: name,
        requestBytes,
        responseBytes,
        estimatedTokens,
        durationMs,
        success,
        errorMessage,
      });
      const auditRow: AuditRowParams = {
        clientId: ctx.client.id,
        apiKeyId: ctx.keyId ?? null,
        userId: ctx.userId ?? null,
        runId: ctx.runId ?? null,
        toolName: name,
        inputArgs,
        responseText,
        // isError:true counts as a logical denial/error; map to 'error' for the
        // audit trail to be consistent with the thrown-exception case.
        status: success ? 'success' : 'error',
        errorMessage,
        durationMs,
      };
      logAuditRow(auditRow);
      // AAF-001: durably persist the high-risk forensic capture BEFORE returning
      // (awaited only for the rare high-risk subset — see persistHighRiskCapture).
      if (isHighRiskTool(name)) {
        await persistHighRiskCapture({
          clientId: auditRow.clientId,
          toolName: auditRow.toolName,
          keyId: auditRow.apiKeyId,
          userId: auditRow.userId,
          inputArgs: auditRow.inputArgs,
        });
      }

      // Inject `_meta.usage` per MCP spec 2025-06-18 conventions. Existing
      // `_meta` values are preserved; we only add a `usage` field. Clients
      // that don't read `_meta` are unaffected.
      if (result && typeof result === 'object') {
        result._meta = {
          ...(result._meta ?? {}),
          usage: {
            tool_name: name,
            response_bytes: responseBytes,
            estimated_tokens: estimatedTokens,
            duration_ms: durationMs,
            version: TELEMETRY_VERSION,
          },
        };
      }

      return result;
    };

    return original(name, config, wrapped);
  };
}
