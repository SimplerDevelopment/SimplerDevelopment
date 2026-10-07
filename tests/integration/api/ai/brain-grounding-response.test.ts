import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { aiCreditBalances, aiCreditLedger, aiMessages } from '@/lib/db/schema';
import { sessionForNewClientUser } from '@/tests/helpers/session';

const { entitlement, grade } = vi.hoisted(() => ({ entitlement: vi.fn(), grade: vi.fn() }));
vi.mock('@/lib/brain/entitlement', () => ({ requireBrainEntitlement: entitlement }));
vi.mock('@/lib/ai/resolve-client-key', () => ({ resolveClientApiKey: async () => ({ key: 'test-key', source: 'platform' }) }));
vi.mock('@/lib/ai/plan-gate', () => ({ checkAiPlanGate: async () => ({ allowed: true }) }));
vi.mock('@/lib/ai/brain-tools/classifier', () => ({ classifyIntent: async () => ({ intent: 'lookup', complexity: 'simple', reasoning: 'test' }) }));
vi.mock('@/lib/ai/brain-tools/planner', () => ({ generatePlan: vi.fn() }));
vi.mock('@/lib/brain/agent-preferences', () => ({ getAgentPreferences: async () => ({}), trackIntentUsage: vi.fn() }));
vi.mock('@/lib/brain/agent-preferences-api', () => ({ formatPreferencesForPrompt: () => '' }));
vi.mock('@/lib/ai/brain-tools', () => ({ BRAIN_TOOLS: [], executeBrainTool: async () => JSON.stringify({ id: 42, title: 'Primary database', body: 'PostgreSQL' }) }));
vi.mock('@/lib/ai/audit', () => ({ recordAiUsage: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      countTokens: async () => ({ input_tokens: 10 }),
      create: async (params: { tool_choice?: { name?: string } }) => ({
        usage: { input_tokens: 1, output_tokens: 1 },
        stop_reason: params.tool_choice ? 'end_turn' : 'tool_use',
        content: params.tool_choice
          ? [{ type: 'tool_use', name: 'grade', input: grade() }]
          : [{ type: 'tool_use', id: 'tool1', name: 'brain_search', input: {} }],
      }),
      stream: () => ({
        abort: vi.fn(),
        async *[Symbol.asyncIterator]() {
          yield { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } };
          yield { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } };
          yield { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'We chose SynthBase.' } };
          yield { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } };
          yield { type: 'message_stop' };
        },
      }),
    };
  },
}));

describe('Brain verified response delivery @tenancy @ai', () => {
  let clientId: number;
  beforeEach(async () => {
    const tenant = await sessionForNewClientUser('grounding');
    clientId = tenant.client.id;
    await db.insert(aiCreditBalances).values({ clientId, balance: 50_000 });
    entitlement.mockReset().mockResolvedValue({ client: tenant.client, userId: tenant.user.id });
    grade.mockReset().mockReturnValue({});
  });

  it('does not deliver or persist unsupported streamed claims when the grade is malformed', async () => {
    const { POST } = await import('@/app/api/portal/brain/agent/route');
    const response = await POST(new Request('http://localhost/api/portal/brain/agent', {
      method: 'POST', body: JSON.stringify({ message: 'Which database did we choose?' }),
    }));
    const body = await response.text();
    expect(entitlement).toHaveBeenCalledWith({ action: 'write' });
    expect(body).not.toContain('SynthBase');
    expect(body).toContain('enough reliable information');
    const frames = body.split('\n\n').filter(frame => frame.startsWith('data: ')).map(frame => JSON.parse(frame.slice(6)));
    expect(frames.findIndex(frame => frame.type === 'confidence')).toBeLessThan(frames.findIndex(frame => frame.type === 'token'));
    const persisted = await db.select().from(aiMessages);
    expect(persisted.filter(row => row.role === 'assistant')).toHaveLength(1);
    expect(persisted.find(row => row.role === 'assistant')?.content).not.toContain('SynthBase');
    const ledger = await db.select().from(aiCreditLedger).where(eq(aiCreditLedger.clientId, clientId));
    expect(ledger).toHaveLength(3);
    expect(ledger.every(row => row.type === 'usage' && row.amount === -2)).toBe(true);
  });
});
