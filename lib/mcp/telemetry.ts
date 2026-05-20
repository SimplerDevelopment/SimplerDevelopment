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
import { mcpToolCalls } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';

const TELEMETRY_VERSION = '1.0';

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
