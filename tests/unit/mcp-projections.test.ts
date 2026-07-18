// @vitest-environment node
/**
 * Unit tests for lib/mcp/projections.ts.
 *
 * Projections are plain column-reference maps used by Drizzle `.select(cols)`
 * in MCP write-echoes. The contract under test:
 *   - SLIM_* maps OMIT the heavy blob columns (content, slides, htmlContent,
 *     blockContent, customCss, customJs, seoDescription, ogImage,
 *     canonicalUrl) so MCP responses stay small.
 *   - FULL_* maps SUPERSET the slim map and add the heavy blobs back.
 *   - The three `*Projection(flag)` helpers pick FULL when truthy and SLIM
 *     when falsy / omitted.
 *   - Every value in each map is identity-equal to the schema column it
 *     names — protects against a future refactor that swaps a column ref
 *     for a different one (e.g. `posts.title` → `posts.name`).
 */
import { describe, it, expect } from 'vitest';
import {
  SLIM_POST_COLUMNS,
  FULL_POST_COLUMNS,
  postProjection,
  SLIM_DECK_COLUMNS,
  FULL_DECK_COLUMNS,
  deckProjection,
  SLIM_CAMPAIGN_COLUMNS,
  FULL_CAMPAIGN_COLUMNS,
  campaignProjection,
} from '@/lib/mcp/projections';
import { posts, pitchDecks, emailCampaigns } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------
describe('post projections', () => {
  describe('SLIM_POST_COLUMNS', () => {
    it('contains exactly the slim keys (no heavy blobs)', () => {
      expect(Object.keys(SLIM_POST_COLUMNS).sort()).toEqual(
        [
          'id',
          'title',
          'slug',
          'postType',
          'excerpt',
          'coverImage',
          'published',
          'publishedAt',
          'websiteId',
          'seoTitle',
          'noIndex',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    });

    it.each([
      'content',
      'customCss',
      'customJs',
      'seoDescription',
      'ogImage',
      'canonicalUrl',
    ])('omits heavy/long-text column %s', (key) => {
      expect(SLIM_POST_COLUMNS).not.toHaveProperty(key);
    });

    it('every value is the matching posts.<col> schema reference', () => {
      expect(SLIM_POST_COLUMNS.id).toBe(posts.id);
      expect(SLIM_POST_COLUMNS.title).toBe(posts.title);
      expect(SLIM_POST_COLUMNS.slug).toBe(posts.slug);
      expect(SLIM_POST_COLUMNS.postType).toBe(posts.postType);
      expect(SLIM_POST_COLUMNS.excerpt).toBe(posts.excerpt);
      expect(SLIM_POST_COLUMNS.coverImage).toBe(posts.coverImage);
      expect(SLIM_POST_COLUMNS.published).toBe(posts.published);
      expect(SLIM_POST_COLUMNS.publishedAt).toBe(posts.publishedAt);
      expect(SLIM_POST_COLUMNS.websiteId).toBe(posts.websiteId);
      expect(SLIM_POST_COLUMNS.seoTitle).toBe(posts.seoTitle);
      expect(SLIM_POST_COLUMNS.noIndex).toBe(posts.noIndex);
      expect(SLIM_POST_COLUMNS.createdAt).toBe(posts.createdAt);
      expect(SLIM_POST_COLUMNS.updatedAt).toBe(posts.updatedAt);
    });
  });

  describe('FULL_POST_COLUMNS', () => {
    it('contains every slim key plus the heavy blob keys', () => {
      const slimKeys = Object.keys(SLIM_POST_COLUMNS);
      const fullKeys = Object.keys(FULL_POST_COLUMNS);
      for (const key of slimKeys) expect(fullKeys).toContain(key);

      for (const extra of [
        'content',
        'customCss',
        'customJs',
        'seoDescription',
        'ogImage',
        'canonicalUrl',
      ]) {
        expect(fullKeys).toContain(extra);
      }
      // exactly slim + 6 extras
      expect(fullKeys.length).toBe(slimKeys.length + 6);
    });

    it('inherits the same column refs from SLIM for shared keys', () => {
      for (const key of Object.keys(SLIM_POST_COLUMNS) as Array<
        keyof typeof SLIM_POST_COLUMNS
      >) {
        expect(
          (FULL_POST_COLUMNS as Record<string, unknown>)[key],
        ).toBe((SLIM_POST_COLUMNS as Record<string, unknown>)[key]);
      }
    });

    it('binds the extra columns to posts.<col>', () => {
      expect(FULL_POST_COLUMNS.content).toBe(posts.content);
      expect(FULL_POST_COLUMNS.customCss).toBe(posts.customCss);
      expect(FULL_POST_COLUMNS.customJs).toBe(posts.customJs);
      expect(FULL_POST_COLUMNS.seoDescription).toBe(posts.seoDescription);
      expect(FULL_POST_COLUMNS.ogImage).toBe(posts.ogImage);
      expect(FULL_POST_COLUMNS.canonicalUrl).toBe(posts.canonicalUrl);
    });
  });

  describe('postProjection()', () => {
    it('returns SLIM when includeContent is undefined', () => {
      expect(postProjection()).toBe(SLIM_POST_COLUMNS);
    });

    it('returns SLIM when includeContent is false', () => {
      expect(postProjection(false)).toBe(SLIM_POST_COLUMNS);
    });

    it('returns FULL when includeContent is true', () => {
      expect(postProjection(true)).toBe(FULL_POST_COLUMNS);
    });

    // Defensive: helper is typed `boolean | undefined` but JS callers can
    // still pass other falsy/truthy values — the conditional uses a plain
    // ternary, so coerce-friendly behaviour is part of the public contract.
    it('treats other falsy inputs as SLIM', () => {
      // @ts-expect-error — exercise loose JS-land calling
      expect(postProjection(null)).toBe(SLIM_POST_COLUMNS);
      // @ts-expect-error
      expect(postProjection(0)).toBe(SLIM_POST_COLUMNS);
      // @ts-expect-error
      expect(postProjection('')).toBe(SLIM_POST_COLUMNS);
    });

    it('treats other truthy inputs as FULL', () => {
      // @ts-expect-error
      expect(postProjection(1)).toBe(FULL_POST_COLUMNS);
      // @ts-expect-error
      expect(postProjection('yes')).toBe(FULL_POST_COLUMNS);
      // @ts-expect-error
      expect(postProjection({})).toBe(FULL_POST_COLUMNS);
    });
  });
});

// ---------------------------------------------------------------------------
// Pitch decks
// ---------------------------------------------------------------------------
describe('deck projections', () => {
  describe('SLIM_DECK_COLUMNS', () => {
    it('contains exactly the slim keys (no slides blob)', () => {
      expect(Object.keys(SLIM_DECK_COLUMNS).sort()).toEqual(
        [
          'id',
          'title',
          'slug',
          'description',
          'status',
          'formatVersion',
          'brandingProfileId',
          'theme',
          'sourceUrl',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    });

    it('omits the heavy slides column', () => {
      expect(SLIM_DECK_COLUMNS).not.toHaveProperty('slides');
    });

    it('every value is the matching pitchDecks.<col> schema reference', () => {
      expect(SLIM_DECK_COLUMNS.id).toBe(pitchDecks.id);
      expect(SLIM_DECK_COLUMNS.title).toBe(pitchDecks.title);
      expect(SLIM_DECK_COLUMNS.slug).toBe(pitchDecks.slug);
      expect(SLIM_DECK_COLUMNS.description).toBe(pitchDecks.description);
      expect(SLIM_DECK_COLUMNS.status).toBe(pitchDecks.status);
      expect(SLIM_DECK_COLUMNS.formatVersion).toBe(pitchDecks.formatVersion);
      expect(SLIM_DECK_COLUMNS.brandingProfileId).toBe(
        pitchDecks.brandingProfileId,
      );
      expect(SLIM_DECK_COLUMNS.theme).toBe(pitchDecks.theme);
      expect(SLIM_DECK_COLUMNS.sourceUrl).toBe(pitchDecks.sourceUrl);
      expect(SLIM_DECK_COLUMNS.createdAt).toBe(pitchDecks.createdAt);
      expect(SLIM_DECK_COLUMNS.updatedAt).toBe(pitchDecks.updatedAt);
    });
  });

  describe('FULL_DECK_COLUMNS', () => {
    it('superset of SLIM_DECK_COLUMNS with `slides` added', () => {
      const slimKeys = Object.keys(SLIM_DECK_COLUMNS);
      const fullKeys = Object.keys(FULL_DECK_COLUMNS);
      for (const k of slimKeys) expect(fullKeys).toContain(k);
      expect(fullKeys).toContain('slides');
      expect(fullKeys.length).toBe(slimKeys.length + 1);
    });

    it('inherits slim refs and binds `slides` to pitchDecks.slides', () => {
      for (const key of Object.keys(SLIM_DECK_COLUMNS) as Array<
        keyof typeof SLIM_DECK_COLUMNS
      >) {
        expect((FULL_DECK_COLUMNS as Record<string, unknown>)[key]).toBe(
          (SLIM_DECK_COLUMNS as Record<string, unknown>)[key],
        );
      }
      expect(FULL_DECK_COLUMNS.slides).toBe(pitchDecks.slides);
    });
  });

  describe('deckProjection()', () => {
    it('returns SLIM when includeSlides is undefined', () => {
      expect(deckProjection()).toBe(SLIM_DECK_COLUMNS);
    });

    it('returns SLIM when includeSlides is false', () => {
      expect(deckProjection(false)).toBe(SLIM_DECK_COLUMNS);
    });

    it('returns FULL when includeSlides is true', () => {
      expect(deckProjection(true)).toBe(FULL_DECK_COLUMNS);
    });

    it('honours coerce-friendly falsy/truthy inputs', () => {
      // @ts-expect-error — JS-land callers
      expect(deckProjection(null)).toBe(SLIM_DECK_COLUMNS);
      // @ts-expect-error
      expect(deckProjection(0)).toBe(SLIM_DECK_COLUMNS);
      // @ts-expect-error
      expect(deckProjection('')).toBe(SLIM_DECK_COLUMNS);
      // @ts-expect-error
      expect(deckProjection(1)).toBe(FULL_DECK_COLUMNS);
      // @ts-expect-error
      expect(deckProjection('y')).toBe(FULL_DECK_COLUMNS);
    });
  });
});

// ---------------------------------------------------------------------------
// Email campaigns
// ---------------------------------------------------------------------------
describe('campaign projections', () => {
  describe('SLIM_CAMPAIGN_COLUMNS', () => {
    it('contains exactly the slim keys (no htmlContent / blockContent)', () => {
      expect(Object.keys(SLIM_CAMPAIGN_COLUMNS).sort()).toEqual(
        [
          'id',
          'name',
          'subject',
          'previewText',
          'fromName',
          'fromEmail',
          'replyTo',
          'listId',
          'clientId',
          'status',
          'scheduledAt',
          'sentAt',
          'totalRecipients',
          'totalSent',
          'totalOpened',
          'totalClicked',
          'totalBounced',
          'totalUnsubscribed',
          'createdBy',
          'createdAt',
          'updatedAt',
        ].sort(),
      );
    });

    it.each(['htmlContent', 'blockContent'])(
      'omits heavy column %s',
      (key) => {
        expect(SLIM_CAMPAIGN_COLUMNS).not.toHaveProperty(key);
      },
    );

    it('every value is the matching emailCampaigns.<col> reference', () => {
      expect(SLIM_CAMPAIGN_COLUMNS.id).toBe(emailCampaigns.id);
      expect(SLIM_CAMPAIGN_COLUMNS.name).toBe(emailCampaigns.name);
      expect(SLIM_CAMPAIGN_COLUMNS.subject).toBe(emailCampaigns.subject);
      expect(SLIM_CAMPAIGN_COLUMNS.previewText).toBe(
        emailCampaigns.previewText,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.fromName).toBe(emailCampaigns.fromName);
      expect(SLIM_CAMPAIGN_COLUMNS.fromEmail).toBe(emailCampaigns.fromEmail);
      expect(SLIM_CAMPAIGN_COLUMNS.replyTo).toBe(emailCampaigns.replyTo);
      expect(SLIM_CAMPAIGN_COLUMNS.listId).toBe(emailCampaigns.listId);
      expect(SLIM_CAMPAIGN_COLUMNS.clientId).toBe(emailCampaigns.clientId);
      expect(SLIM_CAMPAIGN_COLUMNS.status).toBe(emailCampaigns.status);
      expect(SLIM_CAMPAIGN_COLUMNS.scheduledAt).toBe(
        emailCampaigns.scheduledAt,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.sentAt).toBe(emailCampaigns.sentAt);
      expect(SLIM_CAMPAIGN_COLUMNS.totalRecipients).toBe(
        emailCampaigns.totalRecipients,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.totalSent).toBe(emailCampaigns.totalSent);
      expect(SLIM_CAMPAIGN_COLUMNS.totalOpened).toBe(
        emailCampaigns.totalOpened,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.totalClicked).toBe(
        emailCampaigns.totalClicked,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.totalBounced).toBe(
        emailCampaigns.totalBounced,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.totalUnsubscribed).toBe(
        emailCampaigns.totalUnsubscribed,
      );
      expect(SLIM_CAMPAIGN_COLUMNS.createdBy).toBe(emailCampaigns.createdBy);
      expect(SLIM_CAMPAIGN_COLUMNS.createdAt).toBe(emailCampaigns.createdAt);
      expect(SLIM_CAMPAIGN_COLUMNS.updatedAt).toBe(emailCampaigns.updatedAt);
    });
  });

  describe('FULL_CAMPAIGN_COLUMNS', () => {
    it('superset of slim with htmlContent and blockContent added', () => {
      const slimKeys = Object.keys(SLIM_CAMPAIGN_COLUMNS);
      const fullKeys = Object.keys(FULL_CAMPAIGN_COLUMNS);
      for (const k of slimKeys) expect(fullKeys).toContain(k);
      expect(fullKeys).toContain('htmlContent');
      expect(fullKeys).toContain('blockContent');
      expect(fullKeys.length).toBe(slimKeys.length + 2);
    });

    it('inherits slim refs and binds the extra cols to emailCampaigns.*', () => {
      for (const key of Object.keys(SLIM_CAMPAIGN_COLUMNS) as Array<
        keyof typeof SLIM_CAMPAIGN_COLUMNS
      >) {
        expect(
          (FULL_CAMPAIGN_COLUMNS as Record<string, unknown>)[key],
        ).toBe((SLIM_CAMPAIGN_COLUMNS as Record<string, unknown>)[key]);
      }
      expect(FULL_CAMPAIGN_COLUMNS.htmlContent).toBe(emailCampaigns.htmlContent);
      expect(FULL_CAMPAIGN_COLUMNS.blockContent).toBe(
        emailCampaigns.blockContent,
      );
    });
  });

  describe('campaignProjection()', () => {
    it('returns SLIM when includeContent is undefined', () => {
      expect(campaignProjection()).toBe(SLIM_CAMPAIGN_COLUMNS);
    });

    it('returns SLIM when includeContent is false', () => {
      expect(campaignProjection(false)).toBe(SLIM_CAMPAIGN_COLUMNS);
    });

    it('returns FULL when includeContent is true', () => {
      expect(campaignProjection(true)).toBe(FULL_CAMPAIGN_COLUMNS);
    });

    it('honours coerce-friendly falsy/truthy inputs', () => {
      // @ts-expect-error — JS-land callers
      expect(campaignProjection(null)).toBe(SLIM_CAMPAIGN_COLUMNS);
      // @ts-expect-error
      expect(campaignProjection(0)).toBe(SLIM_CAMPAIGN_COLUMNS);
      // @ts-expect-error
      expect(campaignProjection(NaN)).toBe(SLIM_CAMPAIGN_COLUMNS);
      // @ts-expect-error
      expect(campaignProjection(1)).toBe(FULL_CAMPAIGN_COLUMNS);
      // @ts-expect-error
      expect(campaignProjection([])).toBe(FULL_CAMPAIGN_COLUMNS);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting invariants
// ---------------------------------------------------------------------------
describe('projection helpers — cross-cutting invariants', () => {
  it('SLIM and FULL maps are distinct object identities per domain', () => {
    expect(SLIM_POST_COLUMNS).not.toBe(FULL_POST_COLUMNS);
    expect(SLIM_DECK_COLUMNS).not.toBe(FULL_DECK_COLUMNS);
    expect(SLIM_CAMPAIGN_COLUMNS).not.toBe(FULL_CAMPAIGN_COLUMNS);
  });

  it('the *Projection helpers return the exact module constants — no clones', () => {
    // Important: Drizzle uses object identity for SQL builders, so returning a
    // shallow copy would break query construction in subtle ways. Pin it down.
    expect(postProjection(true)).toBe(FULL_POST_COLUMNS);
    expect(postProjection(false)).toBe(SLIM_POST_COLUMNS);
    expect(deckProjection(true)).toBe(FULL_DECK_COLUMNS);
    expect(deckProjection(false)).toBe(SLIM_DECK_COLUMNS);
    expect(campaignProjection(true)).toBe(FULL_CAMPAIGN_COLUMNS);
    expect(campaignProjection(false)).toBe(SLIM_CAMPAIGN_COLUMNS);
  });

  it('repeated calls return stable references (idempotent)', () => {
    expect(postProjection(true)).toBe(postProjection(true));
    expect(postProjection(false)).toBe(postProjection(false));
    expect(deckProjection(true)).toBe(deckProjection(true));
    expect(deckProjection(false)).toBe(deckProjection(false));
    expect(campaignProjection(true)).toBe(campaignProjection(true));
    expect(campaignProjection(false)).toBe(campaignProjection(false));
  });
});
