// @vitest-environment node
/**
 * Unit tests for lib/branding.ts — the DB-backed branding resolvers, the
 * pure helpers (resolveFaviconUrl, brandingToPitchDeckTheme, isDarkColor
 * via the converter), and the re-export of brandingToCssVars.
 *
 * The DB layer is stubbed via a queue of results — every call to db.select()
 * shifts the next prepared row(s) off the queue. The drizzle helpers (eq, and,
 * desc) are imported from drizzle-orm and used only as identity tokens by the
 * helpers under test, so we leave them un-mocked.
 *
 * Schema tables are mocked as empty objects since the chainable select stub
 * doesn't introspect them — it just resolves to whatever rows the test queued.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// DB mock — chainable select() that supports .from().where().limit() and
// .from().where().orderBy() shapes. Each terminal awaits/thenables resolve
// to the next set of rows in `queue`.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const queue: unknown[][] = [];
  function nextRows(): unknown[] {
    return queue.shift() ?? [];
  }
  function makeTerminal(): PromiseLike<unknown[]> & {
    limit: (...args: unknown[]) => PromiseLike<unknown[]>;
    orderBy: (...args: unknown[]) => unknown;
  } {
    let resolved: unknown[] | undefined;
    const ensure = (): unknown[] => {
      if (resolved === undefined) resolved = nextRows();
      return resolved;
    };
    return {
      then(onFulfilled?: (v: unknown[]) => unknown) {
        return Promise.resolve(ensure()).then(onFulfilled);
      },
      limit(_n: unknown) {
        return Promise.resolve(ensure());
      },
      orderBy(..._args: unknown[]) {
        return makeTerminal();
      },
    } as PromiseLike<unknown[]> & {
      limit: (...args: unknown[]) => PromiseLike<unknown[]>;
      orderBy: (...args: unknown[]) => unknown;
    };
  }
  const dbMock = {
    select: ((..._args: unknown[]) => ({
      from: (..._fargs: unknown[]) => ({
        where: (..._wargs: unknown[]) => makeTerminal(),
        orderBy: (..._oargs: unknown[]) => makeTerminal(),
        limit: (..._largs: unknown[]) => Promise.resolve(nextRows()),
        then(onFulfilled?: (v: unknown[]) => unknown) {
          return Promise.resolve(nextRows()).then(onFulfilled);
        },
      }),
    })) as unknown as { select: (...args: unknown[]) => unknown },
  };
  return { queue, dbMock };
});

function pushRows(rows: unknown[]): void {
  h.queue.push(rows);
}

vi.mock('@/lib/db', () => ({ db: h.dbMock }));

vi.mock('@/lib/db/schema', () => ({
  siteBranding: { websiteId: 'siteBranding.websiteId' },
  clientWebsites: {
    id: 'clientWebsites.id',
    clientId: 'clientWebsites.clientId',
    active: 'clientWebsites.active',
    brandingProfileId: 'clientWebsites.brandingProfileId',
  },
  brandingProfiles: {
    id: 'brandingProfiles.id',
    clientId: 'brandingProfiles.clientId',
    isDefault: 'brandingProfiles.isDefault',
    logoUrl: 'brandingProfiles.logoUrl',
    name: 'brandingProfiles.name',
    primaryColor: 'brandingProfiles.primaryColor',
    accentColor: 'brandingProfiles.accentColor',
  },
  brandingMessaging: {
    id: 'brandingMessaging.id',
    clientId: 'brandingMessaging.clientId',
    brandingProfileId: 'brandingMessaging.brandingProfileId',
  },
  bookingPages: {
    slug: 'bookingPages.slug',
    brandingProfileId: 'bookingPages.brandingProfileId',
    clientId: 'bookingPages.clientId',
    color: 'bookingPages.color',
  },
  surveys: {
    slug: 'surveys.slug',
    brandingProfileId: 'surveys.brandingProfileId',
    clientId: 'surveys.clientId',
    color: 'surveys.color',
  },
}));

// Now import the module under test.
import {
  resolveFaviconUrl,
  brandingToPitchDeckTheme,
  brandingToCssVars,
  getBrandingByProfileId,
  getBrandingByWebsiteId,
  getBrandingByClientId,
  getBrandingByBookingPageSlug,
  getBrandingBySurveySlug,
  getProfilesByClientId,
  getBrandMessaging,
  getBrandDefaults,
} from '@/lib/branding';
import type { ResolvedBranding } from '@/lib/branding-types';

beforeEach(() => {
  h.queue.length = 0;
});

// ---------------------------------------------------------------------------
// resolveFaviconUrl
// ---------------------------------------------------------------------------

describe('resolveFaviconUrl', () => {
  it('returns undefined when branding is null', () => {
    expect(resolveFaviconUrl(null)).toBeUndefined();
  });

  it('returns undefined when branding is undefined', () => {
    expect(resolveFaviconUrl(undefined)).toBeUndefined();
  });

  it('prefers faviconUrl when set', () => {
    expect(
      resolveFaviconUrl({
        faviconUrl: '/fav.ico',
        logoSquareUrl: '/sq.png',
        logoIconUrl: '/icon.png',
      }),
    ).toBe('/fav.ico');
  });

  it('falls back to logoSquareUrl when faviconUrl missing', () => {
    expect(
      resolveFaviconUrl({
        faviconUrl: undefined,
        logoSquareUrl: '/sq.png',
        logoIconUrl: '/icon.png',
      }),
    ).toBe('/sq.png');
  });

  it('falls back to logoIconUrl when favicon and square missing', () => {
    expect(
      resolveFaviconUrl({
        faviconUrl: undefined,
        logoSquareUrl: '',
        logoIconUrl: '/icon.png',
      }),
    ).toBe('/icon.png');
  });

  it('returns undefined when nothing is set', () => {
    expect(
      resolveFaviconUrl({ faviconUrl: '', logoSquareUrl: '', logoIconUrl: '' }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// brandingToPitchDeckTheme
// ---------------------------------------------------------------------------

function fullBranding(overrides: Partial<ResolvedBranding> = {}): ResolvedBranding {
  return {
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    accentColor: '#0000ff',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    headingFont: 'Lora',
    bodyFont: 'Roboto',
    logoUrl: 'https://x/logo.png',
    logoSquareUrl: '',
    logoRectUrl: '',
    logoIconUrl: '',
    logoText: '',
    logoAlt: '',
    navTemplate: 'classic',
    navPosition: 'top',
    navBackground: '#ffffff',
    navTextColor: '#111111',
    ...overrides,
  };
}

describe('brandingToPitchDeckTheme', () => {
  it('overrides light backgrounds with the dark deck preset', () => {
    const out = brandingToPitchDeckTheme(fullBranding({ backgroundColor: '#ffffff', textColor: '#111111' }));
    expect(out.backgroundColor).toBe('#0f172a');
    expect(out.textColor).toBe('#f8fafc');
    expect(out.primaryColor).toBe('#ff0000');
    expect(out.accentColor).toBe('#0000ff');
    expect(out.headingFont).toBe('Lora');
    expect(out.bodyFont).toBe('Roboto');
    expect(out.logo).toBe('https://x/logo.png');
  });

  it('keeps the brand background when it is already dark', () => {
    const out = brandingToPitchDeckTheme(
      fullBranding({ backgroundColor: '#000000', textColor: '#eeeeee' }),
    );
    expect(out.backgroundColor).toBe('#000000');
    expect(out.textColor).toBe('#eeeeee');
  });

  it('defaults heading/body font to Inter when blank', () => {
    const out = brandingToPitchDeckTheme(
      fullBranding({ headingFont: '', bodyFont: '' }),
    );
    expect(out.headingFont).toBe('Inter');
    expect(out.bodyFont).toBe('Inter');
  });

  it('falls back to logoRectUrl when logoUrl missing', () => {
    const out = brandingToPitchDeckTheme(
      fullBranding({ logoUrl: '', logoRectUrl: '/rect.png' }),
    );
    expect(out.logo).toBe('/rect.png');
  });

  it('emits undefined logo when no logo set', () => {
    const out = brandingToPitchDeckTheme(
      fullBranding({ logoUrl: '', logoRectUrl: '' }),
    );
    expect(out.logo).toBeUndefined();
  });

  it('treats short or malformed background hex as light', () => {
    // length < 6 hits the early-return path in isDarkColor
    const out = brandingToPitchDeckTheme(fullBranding({ backgroundColor: '#fff' }));
    expect(out.backgroundColor).toBe('#0f172a');
  });
});

// ---------------------------------------------------------------------------
// brandingToCssVars (re-exported)
// ---------------------------------------------------------------------------

describe('brandingToCssVars re-export', () => {
  it('is a function that emits brand CSS custom properties', () => {
    expect(typeof brandingToCssVars).toBe('function');
    const vars = brandingToCssVars(fullBranding());
    expect(vars['--brand-primary']).toBe('#ff0000');
    expect(vars['--brand-bg']).toBe('#ffffff');
  });
});

// ---------------------------------------------------------------------------
// getBrandingByProfileId
// ---------------------------------------------------------------------------

describe('getBrandingByProfileId', () => {
  it('maps row fields when profile exists', async () => {
    pushRows([
      {
        primaryColor: '#abc123',
        secondaryColor: '#222222',
        accentColor: '#aaa111',
        backgroundColor: '#fafafa',
        textColor: '#000000',
        headingFont: 'Inter',
        bodyFont: 'Inter',
        logoUrl: '/logo.png',
        navTemplate: 'modern',
        faviconUrl: '/fav.ico',
      },
    ]);
    const out = await getBrandingByProfileId(42);
    expect(out.primaryColor).toBe('#abc123');
    expect(out.navTemplate).toBe('modern');
    expect(out.faviconUrl).toBe('/fav.ico');
    // un-set field falls back to DEFAULTS
    expect(out.logoSquareUrl).toBe('');
  });

  it('returns defaults when profile does not exist', async () => {
    pushRows([]);
    const out = await getBrandingByProfileId(999);
    expect(out.primaryColor).toBe('#2563eb');
    expect(out.navTemplate).toBe('classic');
  });
});

// ---------------------------------------------------------------------------
// getBrandingByWebsiteId
// ---------------------------------------------------------------------------

describe('getBrandingByWebsiteId', () => {
  it('delegates to the assigned branding profile when present', async () => {
    // 1st select: site row with brandingProfileId=7
    pushRows([{ brandingProfileId: 7 }]);
    // 2nd select (inside getBrandingByProfileId): profile row
    pushRows([{ primaryColor: '#deadbe' }]);
    const out = await getBrandingByWebsiteId(1);
    expect(out.primaryColor).toBe('#deadbe');
  });

  it('falls back to siteBranding row when no profile is assigned', async () => {
    // 1st select: site row without brandingProfileId
    pushRows([{ brandingProfileId: null }]);
    // 2nd select: siteBranding row
    pushRows([{ primaryColor: '#123abc', logoUrl: '/sb.png' }]);
    const out = await getBrandingByWebsiteId(1);
    expect(out.primaryColor).toBe('#123abc');
    expect(out.logoUrl).toBe('/sb.png');
  });

  it('returns defaults when neither profile nor siteBranding exists', async () => {
    pushRows([]); // no clientWebsites row
    pushRows([]); // no siteBranding row
    const out = await getBrandingByWebsiteId(1);
    expect(out.primaryColor).toBe('#2563eb');
  });
});

// ---------------------------------------------------------------------------
// getBrandingByClientId
// ---------------------------------------------------------------------------

describe('getBrandingByClientId', () => {
  it('returns the client default branding profile when present', async () => {
    pushRows([{ primaryColor: '#cafeba', isDefault: true }]);
    const out = await getBrandingByClientId(5);
    expect(out.primaryColor).toBe('#cafeba');
    expect((out as { websiteId?: number }).websiteId).toBeUndefined();
  });

  it('falls back to first active website branding when no default profile', async () => {
    pushRows([]); // no default profile
    pushRows([{ id: 17 }]); // first active website
    // getBrandingByWebsiteId: site has no profile
    pushRows([{ brandingProfileId: null }]);
    // and siteBranding row
    pushRows([{ primaryColor: '#beefed' }]);
    const out = await getBrandingByClientId(5);
    expect(out.primaryColor).toBe('#beefed');
    expect(out.websiteId).toBe(17);
  });

  it('returns defaults when client has no profile and no active website', async () => {
    pushRows([]); // no default profile
    pushRows([]); // no websites
    const out = await getBrandingByClientId(5);
    expect(out.primaryColor).toBe('#2563eb');
    expect(out.websiteId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getBrandingByBookingPageSlug
// ---------------------------------------------------------------------------

describe('getBrandingByBookingPageSlug', () => {
  it('returns null when slug does not exist', async () => {
    pushRows([]);
    const out = await getBrandingByBookingPageSlug('missing');
    expect(out).toBeNull();
  });

  it('delegates to profile branding when booking page has profile', async () => {
    pushRows([{ brandingProfileId: 9, clientId: 1, color: null }]);
    pushRows([{ primaryColor: '#9991aa' }]); // profile row
    const out = await getBrandingByBookingPageSlug('demo');
    expect(out?.primaryColor).toBe('#9991aa');
  });

  it('overrides DEFAULTS primary with page color when client has no profile', async () => {
    pushRows([{ brandingProfileId: null, clientId: 1, color: '#ff00ff' }]);
    // getBrandingByClientId: no default profile, no website
    pushRows([]); // default profile lookup
    pushRows([]); // active websites
    const out = await getBrandingByBookingPageSlug('demo');
    expect(out?.primaryColor).toBe('#ff00ff');
  });

  it('keeps client-resolved primary when not the default and ignores page color', async () => {
    pushRows([{ brandingProfileId: null, clientId: 1, color: '#ff00ff' }]);
    pushRows([{ primaryColor: '#abcabc', isDefault: true }]); // client has a default
    const out = await getBrandingByBookingPageSlug('demo');
    expect(out?.primaryColor).toBe('#abcabc');
  });
});

// ---------------------------------------------------------------------------
// getBrandingBySurveySlug
// ---------------------------------------------------------------------------

describe('getBrandingBySurveySlug', () => {
  it('returns null when slug does not exist', async () => {
    pushRows([]);
    expect(await getBrandingBySurveySlug('missing')).toBeNull();
  });

  it('delegates to profile branding when survey has profile', async () => {
    pushRows([{ brandingProfileId: 3, clientId: 1, color: null }]);
    pushRows([{ primaryColor: '#abcdef' }]);
    const out = await getBrandingBySurveySlug('quiz');
    expect(out?.primaryColor).toBe('#abcdef');
  });

  it('overrides DEFAULTS primary with survey color when client has no profile', async () => {
    pushRows([{ brandingProfileId: null, clientId: 1, color: '#112233' }]);
    pushRows([]); // no default profile
    pushRows([]); // no active website
    const out = await getBrandingBySurveySlug('quiz');
    expect(out?.primaryColor).toBe('#112233');
  });

  it('keeps client default when not the DEFAULTS primary', async () => {
    pushRows([{ brandingProfileId: null, clientId: 1, color: '#112233' }]);
    pushRows([{ primaryColor: '#999999', isDefault: true }]);
    const out = await getBrandingBySurveySlug('quiz');
    expect(out?.primaryColor).toBe('#999999');
  });
});

// ---------------------------------------------------------------------------
// getProfilesByClientId
// ---------------------------------------------------------------------------

describe('getProfilesByClientId', () => {
  it('returns the list of profile summaries from the DB', async () => {
    pushRows([
      { id: 1, name: 'Primary', isDefault: true, primaryColor: '#000', accentColor: '#fff', logoUrl: null },
      { id: 2, name: 'Alt', isDefault: false, primaryColor: null, accentColor: null, logoUrl: null },
    ]);
    const out = await getProfilesByClientId(5);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: 1,
      name: 'Primary',
      isDefault: true,
      primaryColor: '#000',
      accentColor: '#fff',
      logoUrl: null,
    });
  });

  it('returns an empty array when client has no profiles', async () => {
    pushRows([]);
    const out = await getProfilesByClientId(5);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getBrandMessaging
// ---------------------------------------------------------------------------

describe('getBrandMessaging', () => {
  it('returns undefined when no messaging row exists for client', async () => {
    pushRows([]); // first messaging row for client
    const out = await getBrandMessaging(7);
    expect(out).toBeUndefined();
  });

  it('returns profile-scoped messaging when brandingProfileId set and row found', async () => {
    pushRows([{ companyName: 'Scoped Inc.', tagline: 'Scoped tag' }]);
    const out = await getBrandMessaging(7, 11);
    expect(out?.companyName).toBe('Scoped Inc.');
    expect(out?.tagline).toBe('Scoped tag');
  });

  it('falls back to the client default messaging when scoped row missing', async () => {
    pushRows([]); // scoped lookup empty
    pushRows([{ companyName: 'Default Inc.' }]); // default messaging
    const out = await getBrandMessaging(7, 11);
    expect(out?.companyName).toBe('Default Inc.');
  });

  it('skips the profile lookup when brandingProfileId is null', async () => {
    pushRows([{ companyName: 'Direct' }]); // single default lookup
    const out = await getBrandMessaging(7, null);
    expect(out?.companyName).toBe('Direct');
  });
});

// ---------------------------------------------------------------------------
// getBrandDefaults
// ---------------------------------------------------------------------------

describe('getBrandDefaults', () => {
  it('returns messaging + logoUrl when brandingProfileId provided', async () => {
    // First messaging lookup (scoped) — hits, so no fallback runs
    pushRows([{ companyName: 'Co.' }]);
    // Profile logo lookup
    pushRows([{ logoUrl: '/profile-logo.png' }]);
    const out = await getBrandDefaults({ clientId: 1, brandingProfileId: 2 });
    expect(out.messaging?.companyName).toBe('Co.');
    expect(out.logoUrl).toBe('/profile-logo.png');
    expect(out.useSentinels).toBe(true);
  });

  it('omits logoUrl when no brandingProfileId provided', async () => {
    pushRows([{ companyName: 'Co.' }]); // default messaging lookup
    const out = await getBrandDefaults({ clientId: 1 });
    expect(out.messaging?.companyName).toBe('Co.');
    expect(out.logoUrl).toBeUndefined();
  });

  it('respects useSentinels=false override', async () => {
    pushRows([{ companyName: 'Co.' }]);
    const out = await getBrandDefaults({ clientId: 1, useSentinels: false });
    expect(out.useSentinels).toBe(false);
  });

  it('handles a missing profile logo row gracefully', async () => {
    pushRows([{ companyName: 'Co.' }]); // scoped messaging
    pushRows([]); // logo lookup empty
    const out = await getBrandDefaults({ clientId: 1, brandingProfileId: 2 });
    expect(out.logoUrl).toBeUndefined();
  });
});
