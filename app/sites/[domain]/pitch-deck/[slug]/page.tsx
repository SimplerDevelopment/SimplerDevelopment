import { notFound } from 'next/navigation';
import { getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import type { Metadata } from 'next';
import PitchDeckPresentation from './PitchDeckPresentation';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

function resolveSlides(raw: unknown): PitchDeckSlideV2[] {
  const arr = (raw || []) as PitchDeckSlide[] | PitchDeckSlideV2[];
  if (!arr.length) return [];
  if (isV2Slides(arr)) return arr;
  return convertAllSlidesToV2(arr as PitchDeckSlide[]);
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

  return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} />;
}
