import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getPitchDeckByDomainAndSlug } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';
import { getBrandingByProfileId, getBrandingByClientId, getBrandingByWebsiteId, resolveFaviconUrlForClient } from '@/lib/branding';
import { applyAbToDeckSlides } from '@/lib/ab/render';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import type { Metadata } from 'next';
import PitchDeckPresentation, { type SurveyDataForDeck } from './PitchDeckPresentation';

/**
 * Resolve the deck for a public request, enforcing that draft preview
 * (`?preview=1`) is OWNER-ONLY. Published decks resolve for everyone; drafts
 * resolve only when an authenticated portal session owns the deck — mirroring
 * the legacy `app/pitch-deck/[slug]/page.tsx` gate. Without this, anyone who
 * knows a tenant domain + deck slug could append `?preview=1` and read
 * unpublished slides. Returns null when nothing should be served (the caller
 * should `notFound()`), and never leaks a draft to a non-owner.
 */
async function resolveDeckForRequest(domain: string, slug: string, requestedPreview: boolean) {
  if (requestedPreview) {
    const session = await auth();
    const client = session?.user?.id
      ? await getPortalClient(parseInt(session.user.id, 10))
      : null;
    if (client) {
      const draft = await getPitchDeckByDomainAndSlug(domain, slug, true);
      if (draft && draft.clientId === client.id) return draft;
    }
    // Authenticated-but-not-owner, or unauthenticated: fall through to the
    // published-only path below so a draft slug returns 404, not the draft.
  }
  return getPitchDeckByDomainAndSlug(domain, slug, false);
}

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
    resolveDeckForRequest(domain, slug, preview),
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
  // `?preview=1` (set by EditorHeader for draft decks) lets the OWNING client
  // preview drafts in addition to published. resolveDeckForRequest enforces
  // that draft preview requires an authenticated session whose client owns the
  // deck — without it, only published decks resolve (and a draft slug 404s).
  const preview = sp.preview === '1' || sp.preview === 'true';
  const deck = await resolveDeckForRequest(domain, slug, preview);

  if (!deck) {
    notFound();
  }

  const theme = (deck.theme || {}) as PitchDeckTheme;
  const rawSlides = resolveSlides(deck.slides);

  // Apply A/B variant selection for this visitor (no-op when no test is running).
  const ab = await applyAbToDeckSlides({ deckId: deck.id, slides: rawSlides });
  // Variant payloads may be stored in V1 shape — normalize again (no-op for V2).
  const slides = resolveSlides(ab.slides);

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
