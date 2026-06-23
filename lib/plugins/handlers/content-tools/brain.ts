// GET /brain/scraped-urls — read-only dedup helper for `scrape-<slug>` runs.
//
// The plugin host calls this at the start of each scrape run to find out
// which source_urls under a competitor's domain are already in brain_notes
// for the calling client, so it can skip re-fetching them.
//
// Auth: callback router uses our JWT chain (kid → registered_app_signing_keys
// → HMAC verify). This handler requires the `postcaptain:internal:brain:read`
// scope. The JWT's clientId claim is already verified by the dispatcher;
// here we just use ctx.client.id as the WHERE filter.
//
// Tenancy: the query is scoped to ctx.client.id so a JWT minted for client A
// can never read brain notes for client B, regardless of what query string
// they send.

import { and, eq, ilike } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainNotes } from '@/lib/db/schema/brain';
import type { CallbackHandler } from '../types';
import { ok, fail } from '../types';

// Cap the result size so a misbehaving caller (or a tenant with millions of
// notes) can't blow the response budget. 5k URLs is enough to dedup a single
// competitor — well above any realistic sitemap.
const MAX_URLS = 5_000;

const getScrapedUrls: CallbackHandler = {
  method: 'GET',
  path: '/brain/scraped-urls',
  scope: 'postcaptain:internal:brain:read',
  async handle(req, ctx) {
    const url = new URL(req.url);
    const domain = (url.searchParams.get('domain') ?? '').trim().toLowerCase();
    if (!domain) {
      return fail('validation_error', "Missing required query parameter 'domain'.", 400);
    }
    // Defensive shape check — we only want a hostname, not a URL.
    if (domain.includes('/') || domain.includes(' ') || domain.length > 253) {
      return fail('validation_error', "Invalid 'domain' value.", 400);
    }
    // Normalise away a leading "www." so a competitor configured as
    // www.foo.com matches notes whose source_url is https://foo.com/x.
    const bare = domain.replace(/^www\./, '');

    const rows = await db
      .select({ sourceUrl: brainNotes.sourceUrl })
      .from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, ctx.client.id),
        ilike(brainNotes.sourceUrl, `%${bare}%`),
      ))
      .limit(MAX_URLS);

    const urls = rows
      .map((r) => r.sourceUrl)
      .filter((u): u is string => typeof u === 'string' && u.length > 0);

    return ok({ urls, count: urls.length });
  },
};

export const brainHandlers: CallbackHandler[] = [getScrapedUrls];
