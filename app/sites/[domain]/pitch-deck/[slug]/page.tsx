import { notFound } from 'next/navigation';
import { getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import type { Metadata } from 'next';
import PitchDeckPresentation from './PitchDeckPresentation';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
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

  const slides = (deck.slides || []) as {
    id: string;
    type: string;
    headline?: string;
    subheadline?: string;
    body?: string;
    bullets?: string[];
    stats?: { label: string; value: string }[];
    steps?: { title: string; description: string }[];
    members?: { name: string; role: string; image?: string }[];
    tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  }[];

  const theme = (deck.theme || {}) as {
    primaryColor: string;
    accentColor: string;
    backgroundColor: string;
    textColor: string;
    headingFont: string;
    bodyFont: string;
    logo?: string;
  };

  return <PitchDeckPresentation slides={slides} theme={theme} title={deck.title} />;
}
