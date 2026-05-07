// Portal CRUD for trigger links. Slugs are auto-generated server-side when
// the caller doesn't supply one — random base32 keeps them URL-safe and short.
// We retry a small handful of times on collision; the slug column has a
// UNIQUE index so two concurrent inserts can never both win.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { triggerLinks } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, desc, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';

// Crockford base32 alphabet — all-lowercase, no ambiguous chars (i/l/o/u
// removed). 8-character slug = 32^8 ≈ 1.1e12 possibilities.
const BASE32_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';

function generateSlug(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
  }
  return out;
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9-]{3,64}$/.test(s);
}

// GET /api/portal/trigger-links — list with click counts
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  // Single round-trip: derive click count via correlated subquery. Hard-code
  // outer-table column names here — see feedback_drizzle_correlated_subqueries
  // (Drizzle silently strips qualifiers in template-literal sql when you
  // interpolate `${table.col}`).
  const rows = await db
    .select({
      id: triggerLinks.id,
      slug: triggerLinks.slug,
      destinationUrl: triggerLinks.destinationUrl,
      label: triggerLinks.label,
      contactFieldKey: triggerLinks.contactFieldKey,
      createdBy: triggerLinks.createdBy,
      createdAt: triggerLinks.createdAt,
      updatedAt: triggerLinks.updatedAt,
      clickCount: sql<number>`(
        SELECT COUNT(*)::int FROM trigger_link_clicks
        WHERE trigger_link_clicks.link_id = trigger_links.id
      )`,
    })
    .from(triggerLinks)
    .where(eq(triggerLinks.clientId, client.id))
    .orderBy(desc(triggerLinks.createdAt));

  return NextResponse.json({ success: true, data: { links: rows } });
}

// POST /api/portal/trigger-links — create a link, auto-generate slug if not
// provided. Returns 409 on slug collision after retries (very unlikely).
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { destinationUrl, label, contactFieldKey } = body as {
    destinationUrl?: string;
    label?: string;
    contactFieldKey?: string;
    slug?: string;
  };
  const requestedSlug: string | undefined = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : undefined;

  if (!destinationUrl || typeof destinationUrl !== 'string') {
    return NextResponse.json(
      { success: false, error: 'destinationUrl is required' },
      { status: 400 },
    );
  }
  // Loose URL validation — full RFC compliance isn't worth it. We just want
  // the redirect to work in a browser, so anything `new URL` can parse and
  // that has http/https is fine. Allow relative paths too (for trigger links
  // that point at internal app pages).
  if (!destinationUrl.startsWith('/')) {
    try {
      const u = new URL(destinationUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return NextResponse.json(
          { success: false, error: 'destinationUrl must be http(s) or a relative path starting with /' },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { success: false, error: 'destinationUrl is not a valid URL' },
        { status: 400 },
      );
    }
  }

  if (requestedSlug && !isValidSlug(requestedSlug)) {
    return NextResponse.json(
      { success: false, error: 'slug must be 3-64 chars, lowercase alphanumeric or dash' },
      { status: 400 },
    );
  }

  // Try inserting up to 5 times when auto-generating. With 32^8 keyspace and
  // realistic table sizes the second attempt should never be needed.
  const maxAttempts = requestedSlug ? 1 : 5;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = requestedSlug ?? generateSlug();
    try {
      const [row] = await db
        .insert(triggerLinks)
        .values({
          clientId: client.id,
          slug,
          destinationUrl,
          label: label ?? null,
          contactFieldKey: contactFieldKey ?? null,
          createdBy: userId,
        })
        .returning();
      return NextResponse.json({ success: true, data: { link: row } });
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Postgres unique violation; only retry when we generated the slug.
      const isUnique = /unique/i.test(msg) || /duplicate key/i.test(msg);
      if (!isUnique || requestedSlug) break;
    }
  }

  const status = requestedSlug ? 409 : 500;
  return NextResponse.json(
    {
      success: false,
      error: requestedSlug
        ? 'slug already in use'
        : 'failed to allocate a unique slug — try again',
      detail: lastError instanceof Error ? lastError.message : String(lastError),
    },
    { status },
  );
}

