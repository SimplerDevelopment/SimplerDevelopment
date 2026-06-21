/**
 * Canonical public pitch-deck route.
 *
 * `/pitch-deck/:slug` 308-redirects here (next.config), and the portal's
 * Preview / View-Live buttons generate `/slides/:slug`, so this is the route
 * that actually serves decks on the main app host.
 *
 * Behavior:
 *  - `?preview=1` → authenticated inline render (draft allowed, own-tenant only).
 *  - published deck, request already on the owning tenant's host (or localhost,
 *    or no routable host) → render INLINE. This is the loop-breaker: the
 *    platform tenant (client 104) owns the apex `simplerdevelopment.com`, so
 *    redirecting its decks to "the tenant host" used to target the apex itself
 *    and infinite-loop. Rendering in place when target === current host fixes it.
 *  - published deck owned by a different tenant → 302 to that tenant's
 *    `https://<host>/slides/<slug>` (preserving the query string), so decks are
 *    served on the owning tenant's domain.
 */
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pitchDecks, surveys, clientWebsites } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import { applyAbToDeckSlides } from '@/lib/ab/render';
import { getBrandingByProfileId, getBrandingByClientId } from '@/lib/branding';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import type { Metadata } from 'next';
import PitchDeckPresentation from '@/app/sites/[domain]/slides/[slug]/PitchDeckPresentation';
import type { SurveyDataForDeck } from '@/app/sites/[domain]/slides/[slug]/PitchDeckPresentation';

export const dynamic = 'force-dynamic'; // depends on DB lookup + request host
export const runtime = 'nodejs';

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
};

/** Convert v1 slides on read if needed. */
function resolveSlides(raw: unknown, _theme: PitchDeckTheme): PitchDeckSlideV2[] {
  const arr = (raw || []) as PitchDeckSlide[] | PitchDeckSlideV2[];
  if (!arr.length) return [];
  if (isV2Slides(arr)) return arr;
  return convertAllSlidesToV2(arr as PitchDeckSlide[]);
}

/** Fetch survey data for any survey slides in the deck. */
async function fetchSurveyData(deckSlides: PitchDeckSlideV2[]): Promise<Record<number, SurveyDataForDeck>> {
  const surveyIds = deckSlides.filter((s) => s.surveySlide && s.surveyId).map((s) => s.surveyId!);
  if (surveyIds.length === 0) return {};
  const uniqueIds = [...new Set(surveyIds)];
  const rows = await db
    .select({
      id: surveys.id,
      title: surveys.title,
      slug: surveys.slug,
      fields: surveys.fields,
      requireEmail: surveys.requireEmail,
      thankYouTitle: surveys.thankYouTitle,
      thankYouMessage: surveys.thankYouMessage,
      redirectUrl: surveys.redirectUrl,
      status: surveys.status,
      recommendation: surveys.recommendation,
    })
    .from(surveys)
    .where(inArray(surveys.id, uniqueIds));
  const result: Record<number, SurveyDataForDeck> = {};
  for (const row of rows) {
    result[row.id] = {
      id: row.id,
      title: row.title,
      slug: row.slug,
      fields: (row.fields || []) as SurveyDataForDeck['fields'],
      requireEmail: row.requireEmail,
      thankYouTitle: row.thankYouTitle || 'Thank you!',
      thankYouMessage: row.thankYouMessage || '',
      redirectUrl: row.redirectUrl,
      recommendation: row.recommendation,
    };
  }
  return result;
}

async function getDeck(slug: string, allowDraft: boolean) {
  if (allowDraft) {
    const [deck] = await db.select().from(pitchDecks).where(eq(pitchDecks.slug, slug)).limit(1);
    return deck ?? null;
  }
  const [deck] = await db
    .select()
    .from(pitchDecks)
    .where(and(eq(pitchDecks.slug, slug), eq(pitchDecks.status, 'published')))
    .limit(1);
  return deck ?? null;
}

/** Owning tenant's primary host: prefer a real custom domain, else the
 *  `<subdomain>.simplerdevelopment.com` host. */
async function resolvePrimaryHost(clientId: number): Promise<string | null> {
  const sites = await db
    .select({ domain: clientWebsites.domain, subdomain: clientWebsites.subdomain })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true)))
    .orderBy(clientWebsites.id)
    .limit(5);
  const primary = sites.find((s) => s.domain && !s.domain.endsWith('.simplerdevelopment.com')) ?? sites[0];
  if (!primary) return null;
  if (primary.domain) return primary.domain;
  if (primary.subdomain) return `${primary.subdomain}.simplerdevelopment.com`;
  return null;
}

async function renderDeckInline(deck: typeof pitchDecks.$inferSelect) {
  const theme = (deck.theme || {}) as PitchDeckTheme;
  const rawSlides = resolveSlides(deck.slides, theme);
  const ab = await applyAbToDeckSlides({ deckId: deck.id, slides: rawSlides });
  const slides = resolveSlides(ab.slides, theme);
  const surveyData = await fetchSurveyData(slides);
  const branding = deck.brandingProfileId
    ? await getBrandingByProfileId(deck.brandingProfileId)
    : await getBrandingByClientId(deck.clientId);
  return (
    <PitchDeckPresentation
      key={deck.id}
      slides={slides}
      theme={theme}
      title={deck.title}
      isDraft={deck.status !== 'published'}
      surveys={surveyData}
      branding={branding}
    />
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const deck = await getDeck(slug, sp.preview === '1');
  if (!deck) return { title: 'Not Found', robots: { index: false } };
  const title = deck.title?.trim() || deck.slug;
  const description = deck.description?.trim() || `${title} — Pitch Deck`;
  const branding = deck.brandingProfileId
    ? await getBrandingByProfileId(deck.brandingProfileId)
    : await getBrandingByClientId(deck.clientId);
  const metadata: Metadata = {
    title,
    description,
    robots: { index: false },
    openGraph: { title, description, type: 'website' },
  };
  if (branding?.faviconUrl) metadata.icons = { icon: branding.faviconUrl };
  return metadata;
}

export default async function SlidesRoute({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const isPreview = sp.preview === '1';

  // Authenticated preview — own-tenant draft access only.
  if (isPreview) {
    const session = await auth();
    if (!session?.user?.id) notFound();
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) notFound();
    const deck = await getDeck(slug, true);
    if (!deck || deck.clientId !== client.id) notFound();
    return renderDeckInline(deck);
  }

  const deck = await getDeck(slug, false);
  if (!deck) notFound();

  const host = await resolvePrimaryHost(deck.clientId);
  const headersList = await headers();
  const reqHost = (headersList.get('host') || '').toLowerCase().split(':')[0];
  const isLocal = reqHost.startsWith('localhost') || reqHost.startsWith('127.0.0.1');

  // Render in place when: localhost (cross-host redirect would dead-end), no
  // routable host, or the redirect target is the host we're already on (the
  // platform tenant owns the apex — redirecting there loops). Otherwise send
  // the viewer to the owning tenant's host.
  if (isLocal || !host || host.toLowerCase() === reqHost) {
    return renderDeckInline(deck);
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const qsStr = qs.toString();
  redirect(`https://${host}/slides/${slug}${qsStr ? `?${qsStr}` : ''}`);
}
