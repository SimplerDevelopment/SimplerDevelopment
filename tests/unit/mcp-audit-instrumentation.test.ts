/**
 * Verifies the agent-action audit-trail INSTRUMENTATION: invoking a tool wrapped
 * by `wrapRegisterTool` writes a redacted row to agent_action_logs (the audit
 * trail), in addition to the existing mcp_tool_calls telemetry. db is mocked so
 * this stays a fast, deterministic unit test that asserts the wiring + redaction
 * without a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every db.insert(table).values(v) call.
const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = [];
vi.mock('@/lib/db', () => ({
  db: {
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        return { then: (f?: () => void) => { f?.(); return { catch: () => {} }; }, catch: () => {} };
      },
    }),
  },
}));

import { wrapRegisterTool } from '@/lib/mcp/telemetry';
import { agentAuditLogs } from '@/lib/db/schema';

type Handler = (...args: unknown[]) => unknown;

function wrappedServer(ctx: unknown) {
  const registered: Record<string, Handler> = {};
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => {
      registered[name] = handler;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapRegisterTool(server as any, ctx as any);
  return { server, registered };
}

const ctx = { userId: 7, keyId: 3, client: { id: 42 }, scopes: [] as string[], runId: 'run-xyz' };

describe('MCP audit-trail instrumentation', () => {
  beforeEach(() => {
    inserts.length = 0;
    delete process.env.MCP_TELEMETRY_DISABLED;
  });

  it('writes a redacted agent_action_logs row on a successful tool call', async () => {
    const { server, registered } = wrappedServer(ctx);
    server.registerTool('test_audit_tool', {}, async () => ({ content: [{ type: 'text', text: 'result-ok' }] }));

    await registered['test_audit_tool']({ password: 'sekret', name: 'hello' });

    const audit = inserts.find((i) => i.table === agentAuditLogs);
    expect(audit, 'an agent_action_logs row should be inserted').toBeDefined();
    const v = audit!.values;
    expect(v.clientId).toBe(42);
    expect(v.toolName).toBe('test_audit_tool');
    expect(v.runId).toBe('run-xyz');
    expect(v.status).toBe('success');
    expect(v.outputSummary).toContain('result-ok');
    const inputs = v.inputsSummary as Record<string, unknown>;
    expect(inputs.password).toBe('[REDACTED]'); // secret redacted
    expect(inputs.name).toBe('hello'); // non-secret preserved
  });

  it('records status=error (and still redacts) when the tool throws', async () => {
    const { server, registered } = wrappedServer(ctx);
    server.registerTool('failing_tool', {}, async () => {
      throw new Error('boom');
    });

    await expect(registered['failing_tool']({ token: 'abc' })).rejects.toThrow('boom');

    const audit = [...inserts].reverse().find((i) => i.table === agentAuditLogs);
    expect(audit?.values.status).toBe('error');
    expect((audit?.values.inputsSummary as Record<string, unknown>).token).toBe('[REDACTED]');
  });
});
