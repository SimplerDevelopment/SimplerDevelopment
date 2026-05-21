import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import { getBrandingByProfileId, getBrandingByClientId, getBrandingByWebsiteId, resolveFaviconUrlForClient } from '@/lib/branding';
import type { Metadata } from 'next';
import PitchDeckPresentation, { type SurveyDataForDeck } from './PitchDeckPresentation';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const sp = await searchParams;
  const preview = sp.preview === '1' || sp.preview === 'true';
  const [deck, site] = await Promise.all([
    getPitchDeckByDomainAndSlug(domain, slug, preview),
    getClientWebsiteByDomain(domain),
  ]);
  if (!deck) return { title: { absolute: 'Not Found' } };

  // Resolution order mirrors the posts table: deck SEO field -> deck content
  // -> brand fallback. Trim guards against whitespace-only overrides bleeding
  // empty strings into <head>.
  const title = deck.seoTitle?.trim() || deck.title?.trim() || deck.slug;
  const description = deck.seoDescription?.trim() || deck.description?.trim() || `${title} - Pitch Deck`;
  const branding = site ? await getBrandingByWebsiteId(site.id) : null;
  // OG image fallback chain — match the site layout's chain so X / Facebook /
  // LinkedIn always have a share image even when a deck-specific one isn't set.
  const ogImage =
    deck.ogImage?.trim() ||
    branding?.ogImageUrl ||
    branding?.logoUrl ||
    branding?.logoSquareUrl ||
    undefined;
  const siteName = site?.name;
  const canonicalUrl = site ? `https://${site.domain}/slides/${slug}` : undefined;

  const metadata: Metadata = {
    // Absolute title bypasses the root layout's `%s | SimplerDevelopment`
    // template so deck titles render as authored, with no agency suffix.
    title: { absolute: title },
    description,
    openGraph: {
      type: 'website',
      locale: 'en_US',
      title,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
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

  if (deck.canonicalUrl?.trim()) {
    metadata.alternates = { canonical: deck.canonicalUrl.trim() };
  } else if (canonicalUrl) {
    metadata.alternates = { canonical: canonicalUrl };
  }
  if (deck.noIndex) {
    metadata.robots = { index: false, follow: false };
  }
  const faviconUrl = await resolveFaviconUrlForClient(deck.clientId, branding);
  if (faviconUrl) {
    // sizes:'any' marks the icon as scalable so browsers prefer it over any
    // ICO/PNG with a fixed size that may slip into the head from elsewhere.
    metadata.icons = { icon: [{ url: faviconUrl, sizes: 'any' }] };
  }

  return metadata;
}

export default async function PublicPitchDeckPage({ params, searchParams }: PageProps) {
  const { domain, slug } = await params;
  const sp = await searchParams;
  // `?preview=1` (set by EditorHeader for draft decks) lets the public route
  // serve drafts in addition to published. Without it, only published decks
  // resolve — matches the legacy behavior.
  const preview = sp.preview === '1' || sp.preview === 'true';
  const deck = await getPitchDeckByDomainAndSlug(domain, slug, preview);

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
