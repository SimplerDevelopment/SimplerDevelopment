import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import type { Metadata } from 'next';
import PitchDeckPresentation from '@/app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation';

/** Convert v1 slides on read if needed */
function resolveSlides(raw: unknown, theme: PitchDeckTheme): PitchDeckSlideV2[] {
  const arr = (raw || []) as PitchDeckSlide[] | PitchDeckSlideV2[];
  if (!arr.length) return [];
  if (isV2Slides(arr)) return arr;
  return convertAllSlidesToV2(arr as PitchDeckSlide[]);
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
  const deck = await getDeck(slug, preview === '1');
  if (!deck) return { title: 'Not Found' };
  return {
    title: deck.title,
    description: deck.description || `${deck.title} - Pitch Deck`,
    robots: deck.status !== 'published' ? { index: false } : undefined,
  };
}

export default async function PublicPitchDeckPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const isPreview = preview === '1';

  // If preview mode, verify the user is authenticated and owns this deck
  if (isPreview) {
    const session = await auth();
    if (!session?.user?.id) notFound();
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) notFound();

    const deck = await getDeck(slug, true);
    if (!deck || deck.clientId !== client.id) notFound();

    const theme = (deck.theme || {}) as PitchDeckTheme;
    const slides = resolveSlides(deck.slides, theme);
    return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} isDraft={deck.status !== 'published'} />;
  }

  const deck = await getDeck(slug, false);
  if (!deck) notFound();

  const theme = (deck.theme || {}) as PitchDeckTheme;
  const slides = resolveSlides(deck.slides, theme);
  return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} />;
}
