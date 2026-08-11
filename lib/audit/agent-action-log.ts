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
  const row = {
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
  };

  // Retried once on deadlock. This table carries three FKs — client_id,
  // user_id, rule_id — so every insert takes FOR KEY SHARE locks on those
  // parent rows. Callers invoke this fire-and-forget (`void logAgentAction(…)`),
  // so an insert can still be in flight when something else touches the same
  // parents; two of those interleaved produce a genuine deadlock and Postgres
  // kills one side with 40P01.
  //
  // A deadlock victim is transient by definition — the other transaction
  // completed, so an immediate retry succeeds. Without it the row is silently
  // dropped, which is how this surfaced: a CI tenancy run failed two unrelated
  // tests while `[agent-action-log] Failed to write audit row: deadlock
  // detected` scrolled past in the output. An audit trail that quietly loses
  // rows under concurrency is worse than a slow one.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.insert(agentActionLog).values(row);
      return;
    } catch (err) {
      const code = (err as { code?: string; cause?: { code?: string } })?.code
        ?? (err as { cause?: { code?: string } })?.cause?.code;
      if (code === '40P01' && attempt === 0) continue; // deadlock_detected
      // Best-effort — logging must never break the tool call.
      console.warn('[agent-action-log] Failed to write audit row:', err);
      return;
    }
  }
}
