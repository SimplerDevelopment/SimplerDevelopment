/**
 * Shared writer for agent_action_log.
 *
 * Used by both choke points:
 *   - lib/ai/portal-tools/index.ts  (portal AI assistant + automation engine)
 *   - lib/mcp/server.ts              (MCP tool handlers)
 *
 * Rules:
 *   - One row per tool invocation regardless of outcome.
 *   - NEVER store raw params — only the SHA-256 hash of JSON.stringify(input).
 *   - A logging failure MUST NOT break the tool call (all errors are swallowed).
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { agentActionLog } from '@/lib/db/schema';

export interface AgentActionEntry {
  clientId: number;
  userId?: number | null;
  source: 'mcp' | 'automation' | 'assistant';
  tool: string;
  scopeRequired?: string | null;
  scopeAllowed?: boolean | null;
  paramsHash: string;
  outcome: 'success' | 'denied' | 'error';
  errorMessage?: string | null;
  ruleId?: number | null;
  keyId?: number | null;
  durationMs?: number | null;
}

/**
 * Hash arbitrary input for storage in paramsHash.
 * Never store the raw params — only this hash.
 */
export function hashParams(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/**
 * Insert one row into agent_action_log.
 * Best-effort: any DB error is swallowed and console.warn'd so the tool
 * call that triggered logging is never broken by a logging failure.
 */
export async function logAgentAction(entry: AgentActionEntry): Promise<void> {
  try {
    await db.insert(agentActionLog).values({
      clientId: entry.clientId,
      userId: entry.userId ?? null,
      source: entry.source,
      tool: entry.tool,
      scopeRequired: entry.scopeRequired ?? null,
      scopeAllowed: entry.scopeAllowed ?? null,
      paramsHash: entry.paramsHash,
      outcome: entry.outcome,
      errorMessage: entry.errorMessage ?? null,
      ruleId: entry.ruleId ?? null,
      keyId: entry.keyId ?? null,
      durationMs: entry.durationMs ?? null,
    });
  } catch (err) {
    // Best-effort — logging must never break the tool call.
    console.warn('[agent-action-log] Failed to write audit row:', err);
  }
}
