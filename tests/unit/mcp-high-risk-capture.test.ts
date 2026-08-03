// @vitest-environment node
/**
 * Unit tests for the AAF-001 high-risk-tool argument capture wired into
 * `lib/mcp/telemetry.ts` (see `vault/04 - Decisions/ADR high-risk-agent-arg-capture.md`).
 *
 * db is mocked so this stays a fast, deterministic unit test — mirrors the
 * pattern in tests/unit/mcp-audit-instrumentation.test.ts (which covers the
 * existing agent_action_logs write; this file covers the additive
 * agent_action_captures write for high-risk tools only).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

const TEST_KEY = randomBytes(32).toString('hex');

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
import { agentAuditLogs, agentActionCaptures } from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';

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

describe('high-risk-tool argument capture', () => {
  beforeEach(() => {
    inserts.length = 0;
    delete process.env.MCP_TELEMETRY_DISABLED;
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  it('inserts an agent_action_captures row for a high-risk tool call', async () => {
    const { server, registered } = wrappedServer(ctx);
    server.registerTool('email_campaigns_send', {}, async () => ({
      content: [{ type: 'text', text: 'sent' }],
    }));

    await registered['email_campaigns_send']({
      campaignId: 1,
      recipients: ['a@example.com', 'b@example.com'],
      password: 'should-not-appear-in-plaintext-column', // pragma: allowlist secret
    });

    const capture = inserts.find((i) => i.table === agentActionCaptures);
    expect(capture, 'a high-risk tool call should insert an agent_action_captures row').toBeDefined();

    const v = capture!.values;
    expect(v.clientId).toBe(42);
    expect(v.toolName).toBe('email_campaigns_send');
    expect(v.keyId).toBe(3);
    expect(v.userId).toBe(7);
    expect(typeof v.ciphertext).toBe('string');

    // The stored value must be ciphertext, not the raw plaintext arguments.
    expect(v.ciphertext).not.toContain('should-not-appear-in-plaintext-column');
    expect(v.ciphertext).not.toContain('a@example.com');

    // Decrypting reveals the redacted-but-untruncated args.
    const decrypted = JSON.parse(decryptApiKey(v.ciphertext as string));
    expect(decrypted.campaignId).toBe(1);
    expect(decrypted.recipients).toEqual(['a@example.com', 'b@example.com']);
    expect(decrypted.password).toBe('[REDACTED]');

    // Additive, not a replacement: the existing redacted audit row still exists.
    const audit = inserts.find((i) => i.table === agentAuditLogs);
    expect(audit).toBeDefined();
  });

  it('does NOT insert an agent_action_captures row for a benign tool call', async () => {
    const { server, registered } = wrappedServer(ctx);
    server.registerTool('crm_deals_list', {}, async () => ({
      content: [{ type: 'text', text: '[]' }],
    }));

    await registered['crm_deals_list']({ pipelineId: 1 });

    const capture = inserts.find((i) => i.table === agentActionCaptures);
    expect(capture).toBeUndefined();

    // The existing audit log path is unaffected.
    const audit = inserts.find((i) => i.table === agentAuditLogs);
    expect(audit).toBeDefined();
  });

  it('never throws into the tool call even if encryption is misconfigured', async () => {
    delete process.env.ENCRYPTION_KEY; // encryptApiKey() throws synchronously without this

    const { server, registered } = wrappedServer(ctx);
    server.registerTool('proposals_send', {}, async () => ({
      content: [{ type: 'text', text: 'ok' }],
    }));

    // Must resolve normally — a capture failure must never break the tool call.
    const result = await registered['proposals_send']({ to: 'client@example.com' });
    expect(result).toBeDefined();

    const capture = inserts.find((i) => i.table === agentActionCaptures);
    expect(capture).toBeUndefined();
  });
});
