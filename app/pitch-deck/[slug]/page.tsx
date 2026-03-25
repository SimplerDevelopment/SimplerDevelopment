import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { Metadata } from 'next';
import PitchDeckPresentation from '@/app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getDeck(slug: string) {
  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.slug, slug), eq(pitchDecks.status, 'published')))
    .limit(1);
  return deck ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const deck = await getDeck(slug);
  if (!deck) return { title: 'Not Found' };
  return { title: deck.title, description: deck.description || `${deck.title} - Pitch Deck` };
}

export default async function PublicPitchDeckPage({ params }: PageProps) {
  const { slug } = await params;
  const deck = await getDeck(slug);
  if (!deck) notFound();

  const slides = (deck.slides || []) as {
    id: string; type: string; headline?: string; subheadline?: string;
    body?: string; bullets?: string[]; stats?: { label: string; value: string }[];
    steps?: { title: string; description: string }[];
    members?: { name: string; role: string; image?: string }[];
    tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  }[];

  const theme = (deck.theme || {}) as {
    primaryColor: string; accentColor: string; backgroundColor: string;
    textColor: string; headingFont: string; bodyFont: string; logo?: string;
  };

  return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} />;
}
