/**
 * lib/mcp/client-scope — per-call tenant resolution.
 *
 * The logic here decides which company every MCP tool call acts on, so its
 * failure modes are tenancy failure modes: an omitted clientId that silently
 * defaults, an out-of-allowlist id that resolves anyway, or a read/write
 * classifier that lets a viewer through. Those are unit-testable without a DB
 * (the membership intersection is covered against a real DB by
 * tests/integration/api/mcp/user-scoped-clients.test.ts).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/portal-client', () => ({ getPortalClientsWithRoles: vi.fn(async () => []) }));

import { MCP_TOOL_NAMES } from '../fixtures/mcp-tool-names';
import {
  applyTarget,
  clientIdFromRpcBody,
  hydrateReachable,
  isReadOnlyTool,
  isTenantExemptTool,
  reachableOf,
  resolveTarget,
  roleDenial,
} from '@/lib/mcp/client-scope';
import { getPortalClientsWithRoles } from '@/lib/portal-client';
import type { PortalMcpContext, ReachableClient } from '@/lib/mcp-auth';

function client(id: number, company: string) {
  return { id, company } as ReachableClient['client'];
}

function ctxFor(reachable: ReachableClient[]): PortalMcpContext {
  return {
    userId: 7,
    keyId: 1,
    credentialKind: 'oauth_access_token',
    requireCmsApproval: false,
    scopes: ['*'],
    client: reachable[0].client,
    reachable,
  } as PortalMcpContext;
}

const ACME: ReachableClient = { client: client(12, 'Acme Dental'), role: 'owner' };
const BETA: ReachableClient = { client: client(19, 'Beta Roofing'), role: 'viewer' };

afterEach(() => {
  delete process.env.AUTH_ROLE_ENFORCE;
});

describe('resolveTarget', () => {
  it('auto-selects when only one company is reachable', () => {
    const result = resolveTarget(ctxFor([ACME]), undefined);
    expect(result).toEqual({ ok: true, target: ACME });
  });

  it('refuses an omitted clientId when several are reachable, and names them', () => {
    const result = resolveTarget(ctxFor([ACME, BETA]), undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The enumeration IS the feature: it is what lets the model ask the user
    // instead of guessing.
    expect(result.message).toContain('12  Acme Dental');
    expect(result.message).toContain('19  Beta Roofing');
    expect(result.message).toMatch(/ASK/);
  });

  it('refuses a company outside the reachable set', () => {
    const result = resolveTarget(ctxFor([ACME, BETA]), 44);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('44 is not available');
    // Says nothing was written — an agent that retries blindly is worse than one
    // that reports the refusal.
    expect(result.message).toContain('Nothing was read or written');
  });

  it('accepts a reachable company, including as a numeric string', () => {
    expect(resolveTarget(ctxFor([ACME, BETA]), 19)).toEqual({ ok: true, target: BETA });
    expect(resolveTarget(ctxFor([ACME, BETA]), '19')).toEqual({ ok: true, target: BETA });
  });

  it('refuses when the roster is empty (access removed since the grant)', () => {
    const ctx = { userId: 7, scopes: ['*'], client: ACME.client, reachable: [] } as unknown as PortalMcpContext;
    expect(reachableOf(ctx)).toEqual([]);
    const result = resolveTarget(ctx, 12);
    expect(result.ok).toBe(false);
  });
});

describe('applyTarget', () => {
  it('swaps ctx.client to the target so registration-time reads are correct', () => {
    // The 31 registrars that hoist `const clientId = ctx.client.id` are the whole
    // reason resolution happens before the server is built. If this ever stops
    // replacing `client`, those modules silently write the default company.
    const applied = applyTarget(ctxFor([ACME, BETA]), { ok: true, target: BETA });
    expect(applied.client.id).toBe(19);
    expect(applied.target).toBe(BETA);
    expect(applied.targetError).toBeUndefined();
  });

  it('leaves the default in place and carries the error when unresolved', () => {
    const applied = applyTarget(ctxFor([ACME, BETA]), { ok: false, message: 'nope' });
    expect(applied.client.id).toBe(12);
    expect(applied.target).toBeUndefined();
    expect(applied.targetError).toBe('nope');
  });
});

describe('clientIdFromRpcBody', () => {
  const call = (args: Record<string, unknown>) => ({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'posts_list', arguments: args },
  });

  it('reads the clientId off a tool call', () => {
    expect(clientIdFromRpcBody(call({ clientId: 19 }))).toEqual({ kind: 'call', clientId: 19 });
  });

  it('reports an omitted clientId as a call with none', () => {
    expect(clientIdFromRpcBody(call({}))).toEqual({ kind: 'call', clientId: undefined });
  });

  it('ignores non-tool-call traffic', () => {
    expect(clientIdFromRpcBody({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).toEqual({ kind: 'none' });
    expect(clientIdFromRpcBody(null)).toEqual({ kind: 'none' });
  });

  it('accepts a batch that agrees on one company', () => {
    expect(clientIdFromRpcBody([call({ clientId: 19 }), call({ clientId: 19 })]))
      .toEqual({ kind: 'call', clientId: 19 });
  });

  it('flags a batch that mixes companies', () => {
    // One server serves the whole batch, so this cannot be honored — and picking
    // either one would write a company the caller didn't name.
    expect(clientIdFromRpcBody([call({ clientId: 12 }), call({ clientId: 19 })]))
      .toEqual({ kind: 'conflict' });
  });

  it('does not count exempt tools toward company mixing', () => {
    // whoami carries no clientId by design; treating its absent id as `null`
    // would refuse [whoami, posts_create{clientId}] as a mixed batch.
    const whoami = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } };
    expect(clientIdFromRpcBody([whoami, call({ clientId: 19 })]))
      .toEqual({ kind: 'call', clientId: 19 });
    expect(clientIdFromRpcBody([whoami])).toEqual({ kind: 'none' });
  });
});

describe('hydrateReachable', () => {
  const baseCtx = {
    userId: 7,
    keyId: 1,
    credentialKind: 'oauth_access_token',
    requireCmsApproval: false,
    scopes: ['*'],
    client: client(12, 'Acme Dental'),
    allowedClientIds: [12, 19],
  } as PortalMcpContext;

  it('keeps the default company when it is still reachable', async () => {
    vi.mocked(getPortalClientsWithRoles).mockResolvedValueOnce([
      { id: 12, company: 'Acme Dental', role: 'owner' },
      { id: 19, company: 'Beta Roofing', role: 'viewer' },
    ] as Awaited<ReturnType<typeof getPortalClientsWithRoles>>);
    const hydrated = await hydrateReachable(baseCtx);
    expect(hydrated.client.id).toBe(12);
    expect(hydrated.reachable?.map((r) => r.client.id)).toEqual([12, 19]);
  });

  it('re-points a revoked default company at a still-reachable one', async () => {
    // Membership on the DEFAULT (12) was deleted; 19 remains. Everything that is
    // not a tools/call runs against ctx.client, so leaving it at 12 would keep
    // serving the revoked company's brand/catalog/identity.
    vi.mocked(getPortalClientsWithRoles).mockResolvedValueOnce([
      { id: 19, company: 'Beta Roofing', role: 'viewer' },
    ] as Awaited<ReturnType<typeof getPortalClientsWithRoles>>);
    const hydrated = await hydrateReachable(baseCtx);
    expect(hydrated.client.id).toBe(19);
    expect(hydrated.reachable?.map((r) => r.client.id)).toEqual([19]);
  });
});

describe('isReadOnlyTool', () => {
  it('classifies reads', () => {
    for (const name of [
      'whoami', 'posts_list', 'posts_get', 'brain_search', 'crm_contacts_search',
      'usage_get', 'store_analytics_get', 'brain_glossary_lookup',
      'brain_org_units_tree', 'ai_credits_balance', 'list_workflows', 'email_lists',
    ]) {
      expect(isReadOnlyTool(name), name).toBe(true);
    }
  });

  it('classifies writes', () => {
    for (const name of [
      'posts_create', 'posts_update', 'posts_delete', 'crm_deals_move_stage',
      'email_campaigns_send', 'crm_deal_artifact_link', 'team_invite',
      'store_products_adjust_inventory', 'kanban_move_card', 'contracts_void',
    ]) {
      expect(isReadOnlyTool(name), name).toBe(false);
    }
  });

  it('treats an unrecognised tool as a write (fails closed)', () => {
    // A new tool that matches no verb must be over-restricted, never
    // accidentally writable by a viewer.
    expect(isReadOnlyTool('frobnicate_widgets')).toBe(false);
  });
});

describe('isReadOnlyTool — full registry (PUX-053)', () => {
  // The classifier matches any segment in any position, so a word that is a
  // verb in one tool name and a noun in another misfires. These ran over the
  // whole registry rather than a hand-picked sample because the risk is the
  // cases nobody thought to list.

  it('classifies brain note reads as reads, not writes', () => {
    // 'note' used to be a WRITE_VERB (for pathviz_note), which made every one
    // of these a write and would have cost viewers the reads outright once
    // AUTH_ROLE_ENFORCE=1 flips.
    for (const name of [
      'brain_get_note',
      'brain_get_note_template',
      'brain_list_note_history',
      'brain_list_note_templates',
    ]) {
      expect(isReadOnlyTool(name), name).toBe(true);
    }
  });

  it('still classifies the two tools that made those words verbs as writes', () => {
    // They carry no read verb either, so the fail-closed branch answers for
    // them. This is the assertion that makes the subtraction safe — if someone
    // "tidies" the fail-closed branch away, these flip to reads.
    expect(isReadOnlyTool('pathviz_note')).toBe(false);
    expect(isReadOnlyTool('kanban_card_log_time')).toBe(false);
  });

  it('classifies a no-verb read that used to fail closed', () => {
    expect(isReadOnlyTool('brain_playbook_runs_active_for_entity')).toBe(true);
  });

  it('never lets a read verb outvote a write verb', () => {
    // The tempting fix for PUX-053 was "read wins". It would classify these as
    // READS, because 'lists' is a read verb — turning an availability bug into
    // an integrity one. This is the guard against that fix being applied later.
    for (const name of ['email_lists_create', 'email_lists_delete', 'email_lists_update']) {
      expect(isReadOnlyTool(name), name).toBe(false);
    }
  });

  it('classifies every unambiguous mutation in the registry as a write', () => {
    // Swept across all ~481 registered names, not a sample: any tool ending in
    // a plain create/update/delete/send/publish mutates, whatever else its name
    // contains. A regression here means viewers gained write access.
    const mutations = MCP_TOOL_NAMES.filter((n) =>
      /_(create|update|delete|remove|send|publish|revoke|void)$/.test(n),
    );
    expect(mutations.length).toBeGreaterThan(50);
    expect(mutations.filter((n) => isReadOnlyTool(n))).toEqual([]);
  });

  it('classifies every plain _get and _list in the registry as a read', () => {
    // The mirror invariant. A regression here is the PUX-053 failure mode
    // recurring: a noun collides with a write verb and silently costs a read.
    //
    // The trailing-verb test alone is not enough, and getting that wrong is
    // instructive: `brain_delete_saved_search` and `brain_update_saved_search`
    // end in `_search` but mutate a saved search — "search" is the noun there.
    // Exactly the noun/verb collision this card is about, pointing the other
    // way. So an explicit mutation verb anywhere in the name disqualifies it.
    const reads = MCP_TOOL_NAMES.filter(
      (n) =>
        /_(get|list|search)$/.test(n) &&
        !/(^|_)(create|update|delete|remove|send|publish|revoke|void|add|set|move|archive|restore|import|export)(_|$)/.test(n),
    );
    expect(reads.length).toBeGreaterThan(50);
    expect(reads.filter((n) => !isReadOnlyTool(n))).toEqual([]);
  });
});

describe('isTenantExemptTool', () => {
  it('exempts whoami so the roster is discoverable without already knowing it', () => {
    // Without this, a caller on an ambiguous roster cannot learn the roster: every
    // tool including whoami would demand a clientId first.
    expect(isTenantExemptTool('whoami')).toBe(true);
  });

  it('exempts nothing that touches tenant data', () => {
    for (const name of ['posts_list', 'projects_create', 'client_get', 'sites_list']) {
      expect(isTenantExemptTool(name), name).toBe(false);
    }
  });
});

describe('roleDenial', () => {
  it('allows a write for an owner', () => {
    expect(roleDenial('posts_create', ACME, 7)).toBeNull();
  });

  it('allows a read for a viewer', () => {
    process.env.AUTH_ROLE_ENFORCE = '1';
    expect(roleDenial('posts_list', BETA, 7)).toBeNull();
  });

  it('denies a write for a viewer once enforcement is on', () => {
    process.env.AUTH_ROLE_ENFORCE = '1';
    expect(roleDenial('posts_create', BETA, 7)).toContain('viewer');
  });

  it('logs but allows during the log-only rollout', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(roleDenial('posts_create', BETA, 7)).toBeNull();
      expect(warn).toHaveBeenCalledOnce();
      expect(String(warn.mock.calls[0][0])).toContain('mcp.role.insufficient');
    } finally {
      // Restore, or the spy leaks into every later file in this worker.
      warn.mockRestore();
    }
  });

  it('skips enforcement when no role was resolved', () => {
    process.env.AUTH_ROLE_ENFORCE = '1';
    expect(roleDenial('posts_create', { client: client(12, 'Acme'), role: null }, 7)).toBeNull();
  });
});
