import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { pitchDecks, surveys, clientWebsites } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import { getBrandingByProfileId, getBrandingByClientId } from '@/lib/branding';
import type { Metadata } from 'next';
import PitchDeckPresentation from '@/app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation';
import type { SurveyDataForDeck } from '@/app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation';

/** Convert v1 slides on read if needed */
function resolveSlides(raw: unknown, theme: PitchDeckTheme): PitchDeckSlideV2[] {
  const arr = (raw || []) as PitchDeckSlide[] | PitchDeckSlideV2[];
  if (!arr.length) return [];
  if (isV2Slides(arr)) return arr;
  return convertAllSlidesToV2(arr as PitchDeckSlide[]);
}

/** Fetch survey data for any survey slides in the deck */
async function fetchSurveyData(deckSlides: PitchDeckSlideV2[]): Promise<Record<number, SurveyDataForDeck>> {
  const surveyIds = deckSlides
    .filter(s => s.surveySlide && s.surveyId)
    .map(s => s.surveyId!);
  if (surveyIds.length === 0) return {};

  const uniqueIds = [...new Set(surveyIds)];
  const rows = await db.select({
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
  }).from(surveys).where(inArray(surveys.id, uniqueIds));

  const result: Record<number, SurveyDataForDeck> = {};
  for (const row of rows) {
    // Only include active surveys (or drafts for preview)
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

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

async function getDeck(slug: string, allowDraft: boolean) {
  if (allowDraft) {
    // Preview mode: allow any status
    const [deck] = await db.select().from(pitchDecks)
      .where(eq(pitchDecks.slug, slug))
      .limit(1);
    return deck ?? null;
  }
  // Public: published only
  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.slug, slug), eq(pitchDecks.status, 'published')))
    .limit(1);
  return deck ?? null;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  // Only expose metadata in authenticated preview mode. Public access on the
  // main app host is blocked — pitch decks must be viewed on the owning
  // tenant's subdomain (routed via /sites/[domain]/pitch-deck/[slug]).
  if (preview !== '1') return { title: 'Not Found', robots: { index: false } };
  const deck = await getDeck(slug, true);
  if (!deck) return { title: 'Not Found' };
  return {
    title: deck.title,
    description: deck.description || `${deck.title} - Pitch Deck`,
    robots: { index: false },
  };
}

/**
 * Resolve the owning tenant's subdomain for a published deck.
 * Prefers `clientWebsites.subdomain` (the slug used for <sub>.simplerdevelopment.com);
 * falls back to `clientWebsites.domain` if a custom domain is configured.
 * Returns null if the deck has no active website with a routable host.
 */
async function getTenantHostForDeck(clientId: number): Promise<string | null> {
  const [site] = await db
    .select({
      subdomain: clientWebsites.subdomain,
      domain: clientWebsites.domain,
    })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, clientId), eq(clientWebsites.active, true)))
    .orderBy(clientWebsites.id)
    .limit(1);
  if (!site) return null;
  if (site.subdomain) return `${site.subdomain}.simplerdevelopment.com`;
  if (site.domain) return site.domain;
  return null;
}

export default async function PublicPitchDeckPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === '1';

  // Authenticated preview path — used by the portal's "Preview" button for
  // draft decks. Still scoped to the logged-in client so one tenant can't
  // preview another tenant's deck.
  if (isPreview) {
    const session = await auth();
    if (!session?.user?.id) notFound();
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) notFound();

    const deck = await getDeck(slug, true);
    if (!deck || deck.clientId !== client.id) notFound();

    const theme = (deck.theme || {}) as PitchDeckTheme;
    const slides = resolveSlides(deck.slides, theme);
    const surveyData = await fetchSurveyData(slides);
    const branding = deck.brandingProfileId
      ? await getBrandingByProfileId(deck.brandingProfileId)
      : await getBrandingByClientId(deck.clientId);
    return <PitchDeckPresentation key={deck.id} slides={slides} theme={theme} title={deck.title} isDraft={deck.status !== 'published'} surveys={surveyData} branding={branding} />;
  }

  // Non-preview: the main-app host never renders published decks — it
  // redirects to the owning tenant's subdomain so the tenant-scoped
  // /sites/[domain]/pitch-deck/[slug] route handles rendering. Guessing a
  // slug on the apex domain can never leak cross-tenant content — at worst
  // it redirects to the correct tenant, which will only render if the
  // deck belongs to that tenant (already enforced by getPitchDeckByDomainAndSlug).
  const deck = await getDeck(slug, false);
  if (!deck) notFound();

  // Local dev: `<sub>.simplerdevelopment.com` doesn't resolve from localhost,
  // so the cross-host redirect would dead-end. Render the deck inline instead.
  const headersList = await headers();
  const reqHost = headersList.get('host') || '';
  const isLocal = reqHost.startsWith('localhost') || reqHost.startsWith('127.0.0.1');
  if (isLocal) {
    const theme = (deck.theme || {}) as PitchDeckTheme;
    const slides = resolveSlides(deck.slides, theme);
    const surveyData = await fetchSurveyData(slides);
    const branding = deck.brandingProfileId
      ? await getBrandingByProfileId(deck.brandingProfileId)
      : await getBrandingByClientId(deck.clientId);
    return <PitchDeckPresentation key={deck.id} slides={slides} theme={theme} title={deck.title} surveys={surveyData} branding={branding} />;
  }

  const host = await getTenantHostForDeck(deck.clientId);
  if (!host) notFound();

  redirect(`https://${host}/pitch-deck/${slug}`);
}
