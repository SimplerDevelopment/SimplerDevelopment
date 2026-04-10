import { notFound } from 'next/navigation';
import { getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
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
    };
  }
  return result;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const deck = await getPitchDeckByDomainAndSlug(domain, slug);
  if (!deck) return { title: 'Not Found' };

  return {
    title: deck.title,
    description: deck.description || `${deck.title} - Pitch Deck`,
  };
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

  return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} surveys={surveyData} />;
}
