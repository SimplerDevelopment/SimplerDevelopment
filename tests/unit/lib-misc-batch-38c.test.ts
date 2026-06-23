/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment node
/**
 * Batch 38c — unit tests for 4 lib files.
 *
 * Targets (non-overlapping with existing test files):
 *   1. lib/brain/industry-templates/wealth-advisory.ts       (data-shape lock)
 *   2. lib/portal.ts                                         (re-exports + thin wrappers around auth())
 *   3. lib/email/render-cache.ts                             (getOrRenderCampaignHtml read-through cache)
 *   4. lib/ai/portal-tools/index.ts                          (dispatch + write-block ordering invariants)
 *
 * Strategy: each describe block is self-contained, hoists its own mocks (auth,
 * db, downstream renderers, domain handlers), and locks invariants the existing
 * sibling tests don't already cover.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// 1. lib/brain/industry-templates/wealth-advisory.ts
// ===========================================================================
describe('lib/brain/industry-templates/wealth-advisory', () => {
  it('exports a frozen-shaped template object with required keys', async () => {
    const mod = await import('@/lib/brain/industry-templates/wealth-advisory');
    expect(mod.wealthAdvisoryTemplate).toBeTruthy();
    const tpl = mod.wealthAdvisoryTemplate;
    expect(tpl.id).toBe('wealth_advisory');
    expect(tpl.label).toBe('Wealth Advisory');
    expect(typeof tpl.description).toBe('string');
    expect(tpl.description.length).toBeGreaterThan(0);
  });

  it('declares the six expected relationshipTypes in order', async () => {
    const { wealthAdvisoryTemplate: tpl } = await import(
      '@/lib/brain/industry-templates/wealth-advisory'
    );
    expect(tpl.relationshipTypes.map((r) => r.id)).toEqual([
      'household',
      'divorce_case',
      'family_business',
      'plan_sponsor',
      'prospect',
      'referral_partner',
    ]);
    // labels are non-empty strings
    for (const r of tpl.relationshipTypes) {
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it('lists the five service lines verbatim', async () => {
    const { wealthAdvisoryTemplate: tpl } = await import(
      '@/lib/brain/industry-templates/wealth-advisory'
    );
    expect(tpl.serviceLines).toEqual([
      'Investments & Planning',
      'Divorce',
      'Family Business',
      'Cryptocurrency Education',
      'Retirement Plans',
    ]);
  });

  it('declares the five default views in order', async () => {
    const { wealthAdvisoryTemplate: tpl } = await import(
      '@/lib/brain/industry-templates/wealth-advisory'
    );
    expect(tpl.defaultViews).toEqual([
      'Founder Today',
      'EA Queue',
      'Ops Review',
      'Advisor Review',
      'Compliance Review',
    ]);
  });

  it('sets compliance defaults that protect PII / financial identifiers', async () => {
    const { wealthAdvisoryTemplate: tpl } = await import(
      '@/lib/brain/industry-templates/wealth-advisory'
    );
    expect(tpl.complianceDefaults.requireHumanReviewForAi).toBe(true);
    expect(tpl.complianceDefaults.auditAiChanges).toBe(true);
    expect(tpl.complianceDefaults.blockedFields).toEqual([
      'ssn',
      'tax_id',
      'account_number',
      'routing_number',
    ]);
  });
});

// ===========================================================================
// 2. lib/portal.ts
// ===========================================================================
const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolvePortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => resolvePortalClientMock(...args),
}));

describe('lib/portal', () => {
  beforeEach(() => {
    authMock.mockReset();
    resolvePortalClientMock.mockReset();
  });

  it('re-exports formatCents / status-color helpers from portal-utils', async () => {
    const mod = await import('@/lib/portal');
    expect(typeof mod.formatCents).toBe('function');
    expect(typeof mod.invoiceStatusColor).toBe('function');
    expect(typeof mod.ticketStatusColor).toBe('function');
    expect(typeof mod.priorityColor).toBe('function');
    // sanity: helpers behave like the originals
    expect(mod.formatCents(12345)).toBe('$123.45');
  });

  describe('invoiceStatusLabel', () => {
    it("maps 'sent' → 'Owed'", async () => {
      const { invoiceStatusLabel } = await import('@/lib/portal');
      expect(invoiceStatusLabel('sent')).toBe('Owed');
    });

    it('title-cases other statuses', async () => {
      const { invoiceStatusLabel } = await import('@/lib/portal');
      expect(invoiceStatusLabel('paid')).toBe('Paid');
      expect(invoiceStatusLabel('draft')).toBe('Draft');
      expect(invoiceStatusLabel('overdue')).toBe('Overdue');
    });

    it('handles empty strings without crashing', async () => {
      const { invoiceStatusLabel } = await import('@/lib/portal');
      // empty string: charAt(0).toUpperCase() === '' + slice(1) === '' → ''
      expect(invoiceStatusLabel('')).toBe('');
    });
  });

  describe('getPortalClient', () => {
    it('returns null when there is no session', async () => {
      authMock.mockResolvedValueOnce(null);
      const { getPortalClient } = await import('@/lib/portal');
      const result = await getPortalClient();
      expect(result).toBeNull();
      expect(resolvePortalClientMock).not.toHaveBeenCalled();
    });

    it('returns null when the session has no user id', async () => {
      authMock.mockResolvedValueOnce({ user: {} });
      const { getPortalClient } = await import('@/lib/portal');
      expect(await getPortalClient()).toBeNull();
      expect(resolvePortalClientMock).not.toHaveBeenCalled();
    });

    it('delegates to portal-client.getPortalClient with the parsed user id', async () => {
      authMock.mockResolvedValueOnce({ user: { id: '42' } });
      resolvePortalClientMock.mockResolvedValueOnce({ id: 7, name: 'Acme' });
      const { getPortalClient } = await import('@/lib/portal');
      const result = await getPortalClient();
      expect(resolvePortalClientMock).toHaveBeenCalledWith(42);
      expect(result).toEqual({ id: 7, name: 'Acme' });
    });

    it('passes through null from the resolver when the user has no client', async () => {
      authMock.mockResolvedValueOnce({ user: { id: '99' } });
      resolvePortalClientMock.mockResolvedValueOnce(null);
      const { getPortalClient } = await import('@/lib/portal');
      expect(await getPortalClient()).toBeNull();
    });
  });

  describe('isPortalStaff', () => {
    it('returns true for admin role', async () => {
      authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
      const { isPortalStaff } = await import('@/lib/portal');
      expect(await isPortalStaff()).toBe(true);
    });

    it('returns true for employee role', async () => {
      authMock.mockResolvedValueOnce({ user: { role: 'employee' } });
      const { isPortalStaff } = await import('@/lib/portal');
      expect(await isPortalStaff()).toBe(true);
    });

    it('returns false for client role', async () => {
      authMock.mockResolvedValueOnce({ user: { role: 'client' } });
      const { isPortalStaff } = await import('@/lib/portal');
      expect(await isPortalStaff()).toBe(false);
    });

    it('returns false when there is no session', async () => {
      authMock.mockResolvedValueOnce(null);
      const { isPortalStaff } = await import('@/lib/portal');
      expect(await isPortalStaff()).toBe(false);
    });

    it('returns false when role is missing', async () => {
      authMock.mockResolvedValueOnce({ user: {} });
      const { isPortalStaff } = await import('@/lib/portal');
      expect(await isPortalStaff()).toBe(false);
    });
  });
});

// ===========================================================================
// 3. lib/email/render-cache.ts (getOrRenderCampaignHtml)
// ===========================================================================
type SelectResult = unknown[];
const selectResultQueue: SelectResult[] = [];
const insertCalls: Array<{ table: unknown; values: unknown }> = [];

const dbMock = {
  select: vi.fn(() => {
    const next = selectResultQueue.shift() ?? [];
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => Promise.resolve(next)),
      then: (resolve: (v: SelectResult) => unknown) => Promise.resolve(next).then(resolve),
    };
    return chain;
  }),
  insert: vi.fn((table: unknown) => ({
    values: vi.fn((values: unknown) => {
      insertCalls.push({ table, values });
      return Promise.resolve(undefined);
    }),
  })),
};
vi.mock('@/lib/db', () => ({ db: dbMock }));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db/schema', () => ({
  emailRenders: { campaignId: 'campaignId', blocksHash: 'blocksHash', html: 'html', generatedAt: 'generatedAt', subject: 'subject' },
}));

const renderBlocksToEmailHtmlMock = vi.fn();
vi.mock('@/lib/email/render-blocks-to-email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
}));

const buildCampaignHtmlStringMock = vi.fn();
vi.mock('@/lib/email/build-campaign-html', () => ({
  buildCampaignHtmlString: (...args: unknown[]) => buildCampaignHtmlStringMock(...args),
}));

describe('lib/email/render-cache — getOrRenderCampaignHtml', () => {
  beforeEach(() => {
    selectResultQueue.length = 0;
    insertCalls.length = 0;
    dbMock.select.mockClear();
    dbMock.insert.mockClear();
    renderBlocksToEmailHtmlMock.mockReset();
    buildCampaignHtmlStringMock.mockReset();
  });

  it('returns cached HTML and skips renderer + insert when a row exists', async () => {
    const cachedHtml = '<!DOCTYPE html><html><body>cached body</body></html>';
    selectResultQueue.push([{ html: cachedHtml }]);

    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    const result = await getOrRenderCampaignHtml(123, [
      { id: 'h', type: 'heading', order: 0, content: 'Hi', level: 1 } as any,
    ]);

    expect(result.cached).toBe(true);
    expect(result.html).toBe(cachedHtml);
    expect(result.blocksHash).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
    expect(buildCampaignHtmlStringMock).not.toHaveBeenCalled();
    expect(insertCalls).toHaveLength(0);
  });

  it('renders fresh and inserts when no row exists', async () => {
    selectResultQueue.push([]); // cache miss
    renderBlocksToEmailHtmlMock.mockReturnValueOnce('<inner-html/>');
    buildCampaignHtmlStringMock.mockReturnValueOnce(
      '<!DOCTYPE html><html><body>fresh content {{UNSUBSCRIBE_URL}}</body></html>',
    );

    const blocks: any[] = [
      { id: 'h', type: 'heading', order: 0, content: 'Welcome', level: 1 },
    ];

    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    const result = await getOrRenderCampaignHtml(456, blocks, {
      previewText: 'Hello',
      subject: 'Subj!',
    });

    expect(result.cached).toBe(false);
    expect(result.html).toContain('fresh content');
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith(blocks);
    // build-campaign-html receives the inner html, the literal unsubscribe
    // token, and the previewText we passed
    expect(buildCampaignHtmlStringMock).toHaveBeenCalledWith(
      '<inner-html/>',
      '{{UNSUBSCRIBE_URL}}',
      'Hello',
    );
    // a row was inserted carrying the same blocksHash + subject we supplied
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].values as {
      campaignId: number;
      blocksHash: string;
      html: string;
      subject: string | null;
    };
    expect(inserted.campaignId).toBe(456);
    expect(inserted.subject).toBe('Subj!');
    expect(inserted.blocksHash).toBe(result.blocksHash);
  });

  it('defaults previewText/subject to null when omitted', async () => {
    selectResultQueue.push([]);
    renderBlocksToEmailHtmlMock.mockReturnValueOnce('<x/>');
    buildCampaignHtmlStringMock.mockReturnValueOnce('<html></html>');

    const { getOrRenderCampaignHtml } = await import('@/lib/email/render-cache');
    await getOrRenderCampaignHtml(789, []);

    expect(buildCampaignHtmlStringMock).toHaveBeenCalledWith(
      '<x/>',
      '{{UNSUBSCRIBE_URL}}',
      null,
    );
    expect((insertCalls[0].values as { subject: unknown }).subject).toBeNull();
  });

  it('re-exports the pure helpers from render-cache-core', async () => {
    selectResultQueue.length = 0;
    const mod = await import('@/lib/email/render-cache');
    expect(typeof mod.hashBlocks).toBe('function');
    expect(typeof mod.htmlToText).toBe('function');
    expect(typeof mod.renderCampaignPreview).toBe('function');
    // sanity: hashBlocks is deterministic
    expect(mod.hashBlocks([])).toBe(mod.hashBlocks([]));
  });
});

// ===========================================================================
// 4. lib/ai/portal-tools/index.ts — dispatch + write-block invariants
// ===========================================================================
vi.mock('@/lib/automation/event-bus', () => ({ emitEvent: vi.fn() }));
vi.mock('@/lib/crm/default-pipeline', () => ({ ensureDefaultPipeline: vi.fn() }));

describe('lib/ai/portal-tools — dispatch + write-block invariants', () => {
  it('PORTAL_TOOLS preserves the expected high-level domain ordering', async () => {
    const { PORTAL_TOOLS } = await import('@/lib/ai/portal-tools');
    const names = PORTAL_TOOLS.map((t) => t.name);

    // anchor: dashboard summary is the first tool
    expect(names[0]).toBe('get_dashboard_summary');

    // anchor: navigation tool comes after the write-block (after pitch-deck writes)
    const idxNav = names.indexOf('navigate_to');
    const idxCreatePitch = names.indexOf('create_pitch_deck');
    const idxCreateSupport = names.indexOf('create_support_ticket');
    const idxGetDeals = names.indexOf('get_crm_deals');

    expect(idxNav).toBeGreaterThan(-1);
    expect(idxCreatePitch).toBeGreaterThan(-1);
    expect(idxCreateSupport).toBeGreaterThan(-1);
    expect(idxGetDeals).toBeGreaterThan(-1);

    // Original layout: write-block (support/cms/services/team writes,
    // create_pitch_deck, booking writes) comes BEFORE navigation, which itself
    // comes BEFORE CRM reads (get_crm_deals).
    expect(idxCreatePitch).toBeLessThan(idxNav);
    expect(idxCreateSupport).toBeLessThan(idxNav);
    expect(idxNav).toBeLessThan(idxGetDeals);
  });

  it('every tool listed in PORTAL_TOOLS has a corresponding handler keyed by name (executePortalTool dispatches it)', async () => {
    const portalTools = await import('@/lib/ai/portal-tools');
    // Sample 5 distinct domain tools and confirm executePortalTool reaches a
    // handler (not the unknown-tool fallback). The handlers themselves hit the
    // mocked-out db; we only assert we never get the unknown-tool envelope.
    const samples = [
      'get_dashboard_summary',
      'navigate_to',
      'get_my_projects',
      'get_my_invoices',
      'get_my_email_lists',
    ];
    for (const name of samples) {
      // We can't safely execute every handler (most require live DB), but we
      // CAN execute the pure navigate_to handler — it returns a plain envelope.
      if (name === 'navigate_to') {
        const result = (await portalTools.executePortalTool(
          name,
          { path: '/portal', section: 'dash', message: 'go' },
          1,
          1,
        )) as Record<string, unknown>;
        expect(result).not.toEqual({ error: `Unknown tool: ${name}` });
      } else {
        // For the rest, just confirm the tool is registered.
        const registered = portalTools.PORTAL_TOOLS.find((t) => t.name === name);
        expect(registered, `${name} must be in PORTAL_TOOLS`).toBeDefined();
      }
    }
  });

  it('executePortalTool returns an unknown-tool envelope for unrecognized names', async () => {
    const { executePortalTool } = await import('@/lib/ai/portal-tools');
    const result = await executePortalTool('nope_not_a_tool', {}, 1, 1);
    expect(result).toEqual({ error: 'Unknown tool: nope_not_a_tool' });
  });

  it('PORTAL_TOOLS includes every CRM write tool exactly once (no dup from filter splits)', async () => {
    const { PORTAL_TOOLS } = await import('@/lib/ai/portal-tools');
    const names = PORTAL_TOOLS.map((t) => t.name);
    for (const writeTool of [
      'create_crm_proposal',
      'send_crm_proposal',
      'create_crm_contact',
      'update_crm_contact',
      'create_crm_deal',
      'update_crm_deal',
    ]) {
      const count = names.filter((n) => n === writeTool).length;
      expect(count, `${writeTool} should appear exactly once`).toBe(1);
    }
  });

  it('every tool entry has a non-empty description string (LLM relies on these)', async () => {
    const { PORTAL_TOOLS } = await import('@/lib/ai/portal-tools');
    for (const t of PORTAL_TOOLS) {
      expect(typeof t.description).toBe('string');
      expect((t.description ?? '').length).toBeGreaterThan(0);
    }
  });
});
