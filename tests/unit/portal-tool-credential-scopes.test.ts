// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/audit/agent-action-log', () => ({ logAgentAction: vi.fn(), hashParams: () => 'hash' }));
const { stage } = vi.hoisted(() => ({ stage: vi.fn() }));
vi.mock('@/lib/mcp/pending-changes', () => ({ stageOrApply: stage }));
import { executePortalTool, HANDLERS } from '@/lib/ai/portal-tools';

const originalRead = HANDLERS.get_crm_contacts;
const originalWrite = HANDLERS.create_crm_deal;
afterEach(() => {
  HANDLERS.get_crm_contacts = originalRead;
  HANDLERS.create_crm_deal = originalWrite;
  stage.mockReset();
});

describe('AI tool credential scope boundary', () => {
  it('chat:write does not grant CRM data access through the assistant', async () => {
    const handler = HANDLERS.get_crm_contacts = vi.fn();
    await expect(executePortalTool('get_crm_contacts', {}, 1, 1, { scopes: ['chat:write'] })).rejects.toThrow('crm:read');
    expect(handler).not.toHaveBeenCalled();
  });

  it('crm:read does not permit writes or approval staging', async () => {
    const handler = HANDLERS.create_crm_deal = vi.fn();
    await expect(executePortalTool('create_crm_deal', {}, 1, 1, { scopes: ['crm:read'], gate: {} as never })).rejects.toThrow('crm:write');
    expect(handler).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
  });

  it.each([[], ['portal:read'], ['sites:read']].map(scopes => ({ scopes })))('fails closed on insufficient scopes $scopes', async ({ scopes }) => {
    const handler = HANDLERS.get_crm_contacts = vi.fn();
    await expect(executePortalTool('get_crm_contacts', {}, 1, 1, { scopes })).rejects.toThrow('Insufficient scope');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([['crm:read'], ['crm:*'], ['*']].map(scopes => ({ scopes })))('accepts the explicitly granted resource scope $scopes', async ({ scopes }) => {
    const handler = HANDLERS.get_crm_contacts = vi.fn().mockResolvedValue({ contacts: [] });
    expect(await executePortalTool('get_crm_contacts', {}, 1, 1, { scopes })).toEqual({ contacts: [] });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('preserves the separate session-cookie permission path', async () => {
    const handler = HANDLERS.get_crm_contacts = vi.fn().mockResolvedValue({ contacts: [] });
    await executePortalTool('get_crm_contacts', {}, 1, 1, { source: 'assistant' });
    expect(handler).toHaveBeenCalledOnce();
  });
});
