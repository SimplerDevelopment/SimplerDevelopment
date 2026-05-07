import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import { getBrandingByProfileId, getBrandingByClientId, getBrandingByWebsiteId } from '@/lib/branding';
import type { Metadata } from 'next';
import PitchDeckPresentation, { type SurveyDataForDeck } from './PitchDeckPresentation';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

function resolveSlides(raw: unknown): PitchDeckSlideV2[] {
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const [deck, site] = await Promise.all([
    getPitchDeckByDomainAndSlug(domain, slug),
    getClientWebsiteByDomain(domain),
  ]);
  if (!deck) return { title: 'Not Found' };

  // Falls back to the slug if title is somehow blank — keeps OG/twitter tags
  // from rendering as " | SiteName" on edge-case data.
  const title = deck.title?.trim() || deck.slug;
  const description = deck.description?.trim() || `${title} - Pitch Deck`;
  const branding = site ? await getBrandingByWebsiteId(site.id) : null;
  const ogImage = branding?.ogImageUrl;
  const siteName = site?.name;

  const metadata: Metadata = {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      ...(siteName ? { siteName } : {}),
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };

  if (branding?.faviconUrl) {
    metadata.icons = { icon: branding.faviconUrl };
  }

  return metadata;
}

export default async function PublicPitchDeckPage({ params }: PageProps) {
  const { domain, slug } = await params;
  const deck = await getPitchDeckByDomainAndSlug(domain, slug);

  if (!deck) {
    notFound();
  }

  const theme = (deck.theme || {}) as PitchDeckTheme;
  const slides = resolveSlides(deck.slides);
  const surveyData = await fetchSurveyData(slides);

  // Prefer the deck's explicitly assigned branding profile, then fall back to
  // the client's default profile. Without this, Hero / Button / CTA blocks that
  // read useBranding() fall through to Tailwind defaults on the live deck.
  const branding = deck.brandingProfileId
    ? await getBrandingByProfileId(deck.brandingProfileId)
    : await getBrandingByClientId(deck.clientId);

  // key={deck.id} forces a remount when navigating between two deck slugs via
  // next/link. Without it React reuses the same instance and stale state
  // (current slide index, decisionChoices, surveyAnswers, ...) leaks across
  // decks — manifests as the first decision option silently doing nothing.
  return <PitchDeckPresentation key={deck.id} slides={slides} theme={theme} title={deck.title} surveys={surveyData} branding={branding} />;
}
