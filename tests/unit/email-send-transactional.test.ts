// @vitest-environment node
/**
 * Unit tests for lib/email/send-transactional.ts.
 *
 * The module mixes pure helpers (formatCents, formatAddress, formatEmailDate,
 * buildItemsHtml) with a DB- and Resend-coupled `sendTransactionalEmail` flow.
 * We mock @/lib/db (so the chainable query builder returns table-specific
 * rows the test seeds), drizzle-orm operators, the resend client, the
 * block-renderer, branding helpers, and default-templates list so each test
 * can exercise a specific branch of the sender.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — vi.hoisted runs before all vi.mock factories so
// they can safely close over these references without the "before init"
// error that plain top-level consts would produce.
// ---------------------------------------------------------------------------
const H = vi.hoisted(() => {
  interface DbState {
    customTemplate: Array<Record<string, unknown>>;
    clientWebsiteForBranding: Array<Record<string, unknown>>;
    clientWebsiteForInfo: Array<Record<string, unknown>>;
    brandingProfile: Array<Record<string, unknown>>;
  }
  const dbState: DbState = {
    customTemplate: [],
    clientWebsiteForBranding: [],
    clientWebsiteForInfo: [],
    brandingProfile: [],
  };
  return {
    dbState,
    resendSendMock: vi.fn(),
    applyBrandingMock: vi.fn(),
    brandingProfileToEmailBrandingMock: vi.fn(),
    renderBlocksMock: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy({
    websiteEmailTemplates: wrap('websiteEmailTemplates'),
    clientWebsites: wrap('clientWebsites'),
    brandingProfiles: wrap('brandingProfiles'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db', () => {
  const makeQuery = (selection?: Record<string, unknown>) => {
    let table = '';
    const chain: Record<string, unknown> = {
      from(t: { __table: string }) {
        table = t.__table;
        return chain;
      },
      where() {
        return chain;
      },
      limit() {
        if (table === 'websiteEmailTemplates') return H.dbState.customTemplate;
        if (table === 'clientWebsites') {
          const keys = Object.keys(selection || {});
          if (keys.includes('domain') || keys.includes('subdomain')) {
            return H.dbState.clientWebsiteForInfo;
          }
          return H.dbState.clientWebsiteForBranding;
        }
        if (table === 'brandingProfiles') return H.dbState.brandingProfile;
        return [];
      },
    };
    return chain;
  };
  return {
    db: {
      select(selection?: Record<string, unknown>) {
        return makeQuery(selection);
      },
    },
  };
});

vi.mock('@/lib/email', () => ({
  resend: {
    emails: {
      send: (...args: unknown[]) => H.resendSendMock(...args),
    },
  },
}));

vi.mock('@/lib/email/render-blocks-to-email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => H.renderBlocksMock(...args),
}));

const eventDefMap: Record<string, { defaultSubject: string }> = {
  'order.confirmed': { defaultSubject: 'Order %%orderNumber%% confirmed' },
};
vi.mock('@/lib/email/website-email-events', () => ({
  replaceVariables: (tmpl: string, data: Record<string, string>) =>
    tmpl.replace(/%%(\w+)%%/g, (m, key) => (data[key] !== undefined ? data[key] : m)),
  getEventDefinition: (event: string) => eventDefMap[event],
}));

vi.mock('@/lib/email/default-email-templates', () => ({
  getDefaultTemplates: () => [
    {
      event: 'order.confirmed',
      blocks: [{ id: 'b1', type: 'heading', order: 0, text: 'Hi %%firstName%%' }],
      htmlContent: '',
      name: 'Order Confirmed',
      subject: 'Order %%orderNumber%% confirmed',
      description: '',
      variables: [],
      isRequired: false,
    },
    {
      event: 'empty.event',
      blocks: [],
      htmlContent: '',
      name: 'Empty',
      subject: 'Empty',
      description: '',
      variables: [],
      isRequired: false,
    },
  ],
}));

vi.mock('@/lib/email/apply-branding-to-blocks', () => ({
  applyBrandingToBlocks: (...args: unknown[]) => H.applyBrandingMock(...args),
  brandingProfileToEmailBranding: (...args: unknown[]) =>
    H.brandingProfileToEmailBrandingMock(...args),
}));

// ---------------------------------------------------------------------------
// SUT import (after mocks)
// ---------------------------------------------------------------------------
import {
  sendTransactionalEmail,
  getWebsiteUrls,
  formatCents,
  formatAddress,
  formatEmailDate,
  buildItemsHtml,
} from '@/lib/email/send-transactional';

// ---------------------------------------------------------------------------
// Env restoration
// ---------------------------------------------------------------------------
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const ORIGINAL_FROM = process.env.RESEND_FROM_EMAIL;

beforeEach(() => {
  // Reset shared mock state.
  H.dbState.customTemplate = [];
  H.dbState.clientWebsiteForBranding = [];
  H.dbState.clientWebsiteForInfo = [];
  H.dbState.brandingProfile = [];
  H.resendSendMock.mockReset();
  H.resendSendMock.mockResolvedValue({ data: { id: 'msg_abc' }, error: null });
  H.applyBrandingMock.mockReset();
  H.applyBrandingMock.mockImplementation((blocks: Array<Record<string, unknown>>) =>
    blocks.map(b => ({ ...b, branded: true })),
  );
  H.brandingProfileToEmailBrandingMock.mockReset();
  H.brandingProfileToEmailBrandingMock.mockImplementation(
    (profile: Record<string, unknown>, name?: string) => ({
      name: name ?? 'Test',
      primaryColor: profile.primaryColor ?? '#000',
    }),
  );
  H.renderBlocksMock.mockReset();
  H.renderBlocksMock.mockImplementation((blocks: Array<Record<string, unknown>>) =>
    `<rendered>${blocks.map(b => String(b.type)).join('|')}</rendered>`,
  );
  process.env.NEXTAUTH_URL = 'https://example.test';
  process.env.RESEND_FROM_EMAIL = 'noreply@example.test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_NEXTAUTH_URL === undefined) delete process.env.NEXTAUTH_URL;
  else process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
  if (ORIGINAL_FROM === undefined) delete process.env.RESEND_FROM_EMAIL;
  else process.env.RESEND_FROM_EMAIL = ORIGINAL_FROM;
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe('formatCents', () => {
  it('renders dollars + cents with $ prefix', () => {
    expect(formatCents(14999)).toBe('$149.99');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(50)).toBe('$0.50');
  });

  it('rounds to 2 decimals', () => {
    expect(formatCents(99)).toBe('$0.99');
    expect(formatCents(1001)).toBe('$10.01');
  });
});

describe('formatAddress', () => {
  it('returns N/A for null', () => {
    expect(formatAddress(null)).toBe('N/A');
  });

  it('renders line1/city/state/postalCode without country for US', () => {
    expect(
      formatAddress({
        line1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }),
    ).toBe('123 Main St, Austin, TX 78701');
  });

  it('includes line2 when present', () => {
    expect(
      formatAddress({
        line1: '123 Main St',
        line2: 'Apt 4',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'US',
      }),
    ).toBe('123 Main St, Apt 4, Austin, TX 78701');
  });

  it('includes non-US country', () => {
    expect(
      formatAddress({
        line1: '1 Test Rd',
        city: 'Toronto',
        state: 'ON',
        postalCode: 'M5H',
        country: 'CA',
      }),
    ).toBe('1 Test Rd, Toronto, ON M5H, CA');
  });
});

describe('formatEmailDate', () => {
  it('returns N/A for null', () => {
    expect(formatEmailDate(null)).toBe('N/A');
  });

  it('formats a Date in long form', () => {
    const out = formatEmailDate(new Date('2026-06-15T12:00:00Z'));
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/June/);
  });

  it('parses ISO strings', () => {
    const out = formatEmailDate('2026-12-25T00:00:00Z');
    expect(out).toMatch(/December/);
  });
});

describe('buildItemsHtml', () => {
  it('builds a table with header rows and item rows', () => {
    const html = buildItemsHtml([
      { productName: 'Mug', quantity: 2, unitPrice: 1000, total: 2000 },
    ]);
    expect(html).toContain('<table');
    expect(html).toContain('Item');
    expect(html).toContain('Qty');
    expect(html).toContain('Total');
    expect(html).toContain('Mug');
    expect(html).toContain('$20.00');
  });

  it('includes variantName in the product line when present', () => {
    const html = buildItemsHtml([
      {
        productName: 'Shirt',
        variantName: 'Large / Blue',
        quantity: 1,
        unitPrice: 2500,
        total: 2500,
      },
    ]);
    expect(html).toContain('Shirt — Large / Blue');
  });

  it('renders an empty body when items is empty', () => {
    const html = buildItemsHtml([]);
    expect(html).toContain('<table');
    expect(html).toContain('Item');
    // No <tr> beyond the header row
    const rowMatches = html.match(/<tr>/g) || [];
    expect(rowMatches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getWebsiteUrls
// ---------------------------------------------------------------------------

describe('getWebsiteUrls', () => {
  it('returns a siteUrl using the domain when present', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    const urls = await getWebsiteUrls(1);
    expect(urls.siteName).toBe('Acme');
    expect(urls.siteUrl).toBe('https://example.test/sites/acme');
    expect(urls.accountUrl).toBe('https://example.test/sites/acme/account');
    expect(urls.orderUrl('ORD-1')).toBe('https://example.test/sites/acme/account/orders/ORD-1');
    expect(urls.resetPasswordUrl('tok')).toBe(
      'https://example.test/sites/acme/account/reset-password?token=tok',
    );
    expect(urls.bookingCancelUrl('tok2')).toBe(
      'https://example.test/book/cancel?token=tok2',
    );
    expect(urls.baseUrl).toBe('https://example.test');
  });

  it('falls back to subdomain when domain is missing', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Beta', domain: null, subdomain: 'beta' }];
    const urls = await getWebsiteUrls(1);
    expect(urls.siteUrl).toBe('https://example.test/sites/beta');
  });

  it('falls back to baseUrl when site row has no domain or subdomain', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Gamma', domain: null, subdomain: null }];
    const urls = await getWebsiteUrls(1);
    expect(urls.siteUrl).toBe('https://example.test');
    expect(urls.accountUrl).toBe('https://example.test/account');
  });

  it('returns "Our Store" + default base when no row exists', async () => {
    delete process.env.NEXTAUTH_URL;
    H.dbState.clientWebsiteForInfo = [];
    const urls = await getWebsiteUrls(1);
    expect(urls.siteName).toBe('Our Store');
    expect(urls.baseUrl).toBe('https://simplerdevelopment.com');
  });
});

// ---------------------------------------------------------------------------
// sendTransactionalEmail
// ---------------------------------------------------------------------------

describe('sendTransactionalEmail', () => {
  it('uses the default template when no custom template exists', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'alice@example.test',
      variables: { orderNumber: 'ORD-1', firstName: 'Alice' },
    });

    expect(result).toEqual({ success: true, messageId: 'msg_abc' });
    expect(H.resendSendMock).toHaveBeenCalledTimes(1);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.to).toBe('alice@example.test');
    expect(payload.subject).toBe('Order ORD-1 confirmed');
    // FROM_EMAIL is captured at module-load (default fallback used)
    expect(payload.from).toMatch(/^Acme <[^>]+>$/);
    expect(payload.html).toContain('<!DOCTYPE html>');
    expect(payload.html).toContain('<rendered>heading</rendered>');
    expect(payload.html).toContain('Powered by SimplerDevelopment');
  });

  it('falls back to a generic subject when event has no definition', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Gamma', domain: 'gamma', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Gamma' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'unknown.event',
      to: 'x@y.test',
      variables: {},
    });

    expect(result.success).toBe(true);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Notification from Gamma');
    expect(payload.html).toContain('You have a new notification from Gamma');
  });

  it('uses the custom template (blockContent path) when one exists and is enabled', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'Custom %%orderNumber%%',
        blockContent: { blocks: [{ id: 'h1', type: 'heading', order: 0, text: 'Hi' }] },
        htmlContent: null,
        brandingProfileId: 99,
      },
    ];
    H.dbState.brandingProfile = [{ id: 99, name: 'AcmeBrand', primaryColor: '#abc' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'b@b.test',
      variables: { orderNumber: 'ORD-99', firstName: 'Bob' },
    });

    expect(result.success).toBe(true);
    expect(H.applyBrandingMock).toHaveBeenCalledTimes(1);
    expect(H.brandingProfileToEmailBrandingMock).toHaveBeenCalledTimes(1);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Custom ORD-99');
    expect(payload.html).toContain('<rendered>heading</rendered>');
  });

  it('uses the custom template (htmlContent path) when blockContent is absent', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'Raw subject',
        blockContent: null,
        htmlContent: '<p>Raw %%firstName%% body</p>',
        brandingProfileId: null,
      },
    ];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'c@c.test',
      variables: { firstName: 'Carol' },
    });

    expect(result.success).toBe(true);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Raw subject');
    expect(payload.html).toContain('<p>Raw Carol body</p>');
    expect(H.applyBrandingMock).not.toHaveBeenCalled();
  });

  it('falls through to default template when custom template has neither blocks nor html', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'Empty subj',
        blockContent: null,
        htmlContent: null,
        brandingProfileId: null,
      },
    ];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'd@d.test',
      variables: { firstName: 'Dan' },
    });

    expect(result.success).toBe(true);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Empty subj');
    expect(payload.html).toContain('<rendered>heading</rendered>');
  });

  it('applies branding to default-template blocks when site has a profile', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: 42, name: 'Acme' }];
    H.dbState.brandingProfile = [{ id: 42, name: 'AcmeBrand', primaryColor: '#123' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'e@e.test',
      variables: { firstName: 'Eve' },
    });

    expect(result.success).toBe(true);
    expect(H.applyBrandingMock).toHaveBeenCalledTimes(1);
  });

  it('renders the empty-template fallback when default has no blocks', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'empty.event',
      to: 'f@f.test',
      variables: {},
    });

    expect(result.success).toBe(true);
    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.html).toContain('You have a new notification from Acme');
  });

  it('overrides the sender name when fromName is provided', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'g@g.test',
      variables: {},
      fromName: 'Order Confirmations',
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.from).toMatch(/^Order Confirmations <[^>]+>$/);
  });

  it('returns success: false with the Resend error message when send returns an error', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: { message: 'rate-limited' } });

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'h@h.test',
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('rate-limited');
  });

  it('stringifies a Resend error with no message field', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];
    H.resendSendMock.mockResolvedValueOnce({ data: null, error: { code: 'X', message: '' } });

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'i@i.test',
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('"code":"X"');
  });

  it('returns success: false and captures the message when Resend throws', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];
    H.resendSendMock.mockRejectedValueOnce(new Error('boom'));

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'j@j.test',
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  it('captures a non-Error thrown value as a string', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];
    H.resendSendMock.mockRejectedValueOnce('non-error');

    const result = await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'k@k.test',
      variables: {},
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('non-error');
  });

  it('honors a custom branding profile id from the template over the site profile', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'X',
        blockContent: { blocks: [{ id: 'h', type: 'heading', order: 0 }] },
        htmlContent: null,
        brandingProfileId: 7,
      },
    ];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: 999, name: 'Acme' }];
    H.dbState.brandingProfile = [{ id: 7, name: 'TemplateBrand' }];

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'm@m.test',
      variables: {},
    });

    expect(H.brandingProfileToEmailBrandingMock).toHaveBeenCalledTimes(1);
    const callArgs = H.brandingProfileToEmailBrandingMock.mock.calls[0];
    expect((callArgs[0] as { id: number }).id).toBe(7);
  });

  it('skips branding when neither template nor site provides a profile id', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'X',
        blockContent: { blocks: [{ id: 'h', type: 'heading', order: 0 }] },
        htmlContent: null,
        brandingProfileId: null,
      },
    ];
    H.dbState.clientWebsiteForBranding = [{ brandingProfileId: null, name: 'Acme' }];

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'n@n.test',
      variables: {},
    });

    expect(H.applyBrandingMock).not.toHaveBeenCalled();
  });

  it('returns null branding when profile row is missing despite a profile id', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'X',
        blockContent: { blocks: [{ id: 'h', type: 'heading', order: 0 }] },
        htmlContent: null,
        brandingProfileId: 12345,
      },
    ];
    H.dbState.brandingProfile = []; // not found

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'o@o.test',
      variables: {},
    });

    expect(H.applyBrandingMock).not.toHaveBeenCalled();
  });

  it('merges siteName/siteUrl/currentYear into the variable bag', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: 'For %%siteName%% in %%currentYear%%',
        blockContent: null,
        htmlContent: '<p>%%siteUrl%%</p>',
        brandingProfileId: null,
      },
    ];

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'p@p.test',
      variables: {},
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toContain('For Acme in ');
    expect(payload.subject).toMatch(/\d{4}$/);
    expect(payload.html).toContain('https://example.test/sites/acme');
  });

  it('lets user-supplied variables override merged defaults', async () => {
    H.dbState.clientWebsiteForInfo = [{ name: 'Acme', domain: 'acme', subdomain: null }];
    H.dbState.customTemplate = [
      {
        subject: '%%siteName%%',
        blockContent: null,
        htmlContent: '<p>x</p>',
        brandingProfileId: null,
      },
    ];

    await sendTransactionalEmail({
      websiteId: 1,
      event: 'order.confirmed',
      to: 'q@q.test',
      variables: { siteName: 'Overridden' },
    });

    const payload = H.resendSendMock.mock.calls[0][0];
    expect(payload.subject).toBe('Overridden');
  });
});
