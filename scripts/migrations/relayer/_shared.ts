/**
 * Shared block-builder primitives + DB upsert for the Relayer (userelayer.com) migration.
 *
 * Brand system (captured from the live Framer site via computed styles, NOT guesses):
 *   FOREST  #032916  dark sections: hero, briefing CTA, footer; also dark text on cream
 *   CREAM   #E1DDD5  dominant warm light background (Missing Layer + pill band)
 *   OFFWHITE#F6F5F3  text on dark sections
 *   MINT    #23EE92  accent: "for OEMs"/"product briefing" highlights, CTA pills, circuit lines
 *   WHITE   #FFFFFF  form / panel cards
 *   Type:   Artific Trial (proprietary Framer font) → substitutes:
 *             headings: "Space Grotesk"  body: "Hanken Grotesk"
 *           big display, weight 600, tight negative tracking; pill CTAs (radius 52px).
 *
 * Every page-import script MUST build via these helpers so all pages share tokens,
 * section rhythm, and SEO/upsert behavior.
 *
 *   import { T, makePage, upsertPage, WEBSITE_ID, ASSETS } from './_shared';
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
if (process.env.RL_DATABASE_URL) process.env.DATABASE_URL = process.env.RL_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd = PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host.');
  process.exit(1);
}

// ─── Resolved IDs (written by setup-client.ts) ────────────────────────────────
function loadIds(): { clientId?: number; websiteId?: number; userId?: number } {
  try {
    return JSON.parse(readFileSync(join(__dirname, '_ids.json'), 'utf8'));
  } catch {
    return {};
  }
}
const IDS = loadIds();
export const CLIENT_ID = parseInt(process.env.RL_CLIENT_ID || '', 10) || IDS.clientId || 0;
export const WEBSITE_ID = parseInt(process.env.RL_WEBSITE_ID || '', 10) || IDS.websiteId || 0;

// ─── Brand assets (public Framer CDN SVGs — referenced directly per skill) ─────
export const ASSETS = {
  favicon: 'https://framerusercontent.com/images/fFFb6lgPyN8eeIA59rXaIP8nE2I.png',
  og: 'https://framerusercontent.com/images/V2gxs3cjqwVdfwldVMDwJ5RIyw.png',
  heroCircuit: 'https://framerusercontent.com/images/zKREeIfyd2kp1X3Wh4bq9dNYk.svg',
  bandCircuit: 'https://framerusercontent.com/images/YgaGVbI8SfTQ3UdFcYkRBZvD6mg.svg',
  fragmented: 'https://framerusercontent.com/images/0bzNyC3plP1DNhanCGkBwdX0KU.svg', // BEFORE panel
  seamless: 'https://framerusercontent.com/images/puE6h7h4VWx9oPK2qqAil4iucdo.svg', // AFTER panel
};

// ─── Design tokens ─────────────────────────────────────────────────────────────
export const T = {
  FOREST: '#032916', FOREST2: '#0A3A22', CREAM: '#E1DDD5', CREAM2: '#EBE8E1',
  OFFWHITE: '#F6F5F3', MINT: '#23EE92', MINT_D: '#1ED584', WHITE: '#FFFFFF',
  // text colors
  INK: '#032916',           // primary text on cream/white
  INK_SOFT: '#3C4F44',      // secondary/body text on cream
  ON_DARK: '#F6F5F3',       // primary text on forest
  ON_DARK_SOFT: 'rgba(246,245,243,0.74)',
  // fonts
  HEAD: '"Space Grotesk", sans-serif',
  BODY: '"Hanken Grotesk", sans-serif',
};

type Dict = Record<string, unknown>;

/** Card on a dark forest section. */
export const cardOnDark = {
  backgroundColor: T.FOREST2, borderWidth: '1px', borderColor: 'rgba(35,238,146,0.18)', borderStyle: 'solid',
  borderRadius: '20px', customCSS: 'box-shadow:0 24px 60px rgba(0,0,0,0.28);transition:all .3s ease',
};

export function makePage() {
  let o = 0;
  const ord = () => o++;
  const blocks: unknown[] = [];

  const section = (id: string, bg: string, pad: number, children: unknown[], extra: Dict = {}, style: Dict = {}) => ({
    id, type: 'section', order: ord(), maxWidth: '1200px',
    style: { backgroundColor: bg, paddingTop: `${pad}px`, paddingBottom: `${pad}px`, paddingLeft: '24px', paddingRight: '24px', ...style },
    blocks: children, ...extra,
  });

  const heading = (id: string, text: string, level = 2, color = T.INK, align = 'center', extraStyle: Dict = {}) => ({
    id, type: 'heading', order: ord(), content: text, level, alignment: align,
    style: { color, fontFamily: T.HEAD, fontWeight: '600', letterSpacing: '-0.02em', lineHeight: '1.05', textAlign: align, ...extraStyle },
  });

  const overline = (id: string, text: string, color = T.MINT_D, align = 'center') => ({
    id, type: 'text', order: ord(), content: text, alignment: align,
    style: { color, fontFamily: T.BODY, fontWeight: '600', letterSpacing: '0.22em', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: align, marginBottom: '14px' },
  });

  const lead = (id: string, text: string, color = T.INK_SOFT, align = 'center', extraStyle: Dict = {}) => ({
    id, type: 'text', order: ord(), content: text, alignment: align,
    style: { color, fontFamily: T.BODY, fontSize: '1.25rem', lineHeight: '1.6', textAlign: align, maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto', marginTop: '16px', ...extraStyle },
  });

  const text = (id: string, content: string, color = T.INK_SOFT, align = 'left', extraStyle: Dict = {}) => ({
    id, type: 'text', order: ord(), content, alignment: align,
    style: { color, fontFamily: T.BODY, fontSize: '1.0625rem', lineHeight: '1.7', textAlign: align, ...extraStyle },
  });

  /** A rounded "pill" tag (forest bg, mint label). Used for the hero capability tags. */
  const pill = (id: string, label: string) => ({
    id, type: 'text', order: ord(), content: label, alignment: 'center',
    style: {
      display: 'block', width: 'fit-content', marginLeft: 'auto', marginRight: 'auto',
      backgroundColor: 'rgba(3,41,22,0.92)', color: T.OFFWHITE, textAlign: 'center',
      fontFamily: T.BODY, fontWeight: '600', fontSize: '0.9375rem',
      paddingTop: '12px', paddingBottom: '12px', paddingLeft: '22px', paddingRight: '22px',
      borderRadius: '999px', borderWidth: '1px', borderColor: 'rgba(35,238,146,0.5)', borderStyle: 'solid',
    },
  });

  const image = (id: string, url: string, alt: string, opts: Dict = {}) => ({
    id, type: 'image', order: ord(), url, alt, width: 'full', alignment: 'center', ...opts,
  });

  const spacer = (id: string, h: 'sm' | 'md' | 'lg' | 'xl' = 'md') => ({ id, type: 'spacer', order: ord(), height: h });
  const divider = (id: string, color = 'rgba(3,41,22,0.12)') => ({ id, type: 'divider', order: ord(), lineStyle: 'solid', style: { borderColor: color } });

  /** Pill CTA. variant primary = mint pill w/ forest text; secondary = mint outline. */
  const button = (id: string, txt: string, url: string, variant: 'primary' | 'secondary' | 'outline' = 'primary', opts: Dict = {}) => ({
    id, type: 'button', order: ord(), text: txt, url, variant, size: 'lg', alignment: 'left',
    icon: 'arrow_forward', iconPosition: 'right', hoverEffect: variant === 'primary' ? 'lift' : 'slide', ...opts,
  });

  /**
   * Dark forest-green hero with the mint circuit-line motif on the right.
   * Faithful to userelayer.com: white display title (mint highlight handled by caller via
   * the title string), off-white body, mint pill CTA.
   */
  const hero = (opts: {
    id?: string; title: string; subtitle?: string; description?: string;
    ctaText?: string; ctaLink?: string; secondaryCtaText?: string; secondaryCtaLink?: string;
    backgroundImage?: string; minHeight?: string;
  }) => {
    const style: Dict = {
      backgroundColor: T.FOREST, minHeight: opts.minHeight ?? '88vh', paddingTop: '150px', paddingBottom: '110px',
    };
    const bg = opts.backgroundImage ?? ASSETS.heroCircuit;
    style.backgroundImage = `url(${bg})`;
    style.backgroundSize = 'contain';
    style.backgroundPosition = 'right bottom';
    style.customCSS = 'background-repeat:no-repeat;';
    return {
      id: opts.id ?? 'hero', type: 'hero', order: ord(),
      title: opts.title, subtitle: opts.subtitle, description: opts.description,
      ctaText: opts.ctaText, ctaLink: opts.ctaLink,
      secondaryCtaText: opts.secondaryCtaText, secondaryCtaLink: opts.secondaryCtaLink,
      style,
      elementStyles: {
        subtitle: { color: T.MINT, fontFamily: T.BODY, fontWeight: '600', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '0.75rem' },
        title: { color: T.OFFWHITE, fontFamily: T.HEAD, fontWeight: '600', fontSize: 'clamp(2.75rem,6vw,5.25rem)', letterSpacing: '-0.025em', lineHeight: '1.02' },
        description: { color: T.ON_DARK_SOFT, fontFamily: T.BODY, fontSize: '1.25rem', lineHeight: '1.55', maxWidth: '520px' },
        cta: { color: T.FOREST, fontWeight: '600' },
        secondaryCta: { color: T.OFFWHITE, borderColor: T.MINT, fontWeight: '600' },
      },
    };
  };

  /** Final CTA — dark forest "Schedule a product briefing"-style section. */
  const ctaBlock = (opts: { id?: string; title: string; description?: string; primaryButtonText?: string; primaryButtonUrl?: string; secondaryButtonText?: string; secondaryButtonUrl?: string }) => ({
    id: opts.id ?? 'cta', type: 'cta', order: ord(),
    title: opts.title, description: opts.description,
    primaryButtonText: opts.primaryButtonText ?? 'Request a briefing', primaryButtonUrl: opts.primaryButtonUrl ?? '/contact',
    secondaryButtonText: opts.secondaryButtonText, secondaryButtonUrl: opts.secondaryButtonUrl,
    backgroundStyle: 'solid',
    style: { backgroundColor: T.FOREST, paddingTop: '110px', paddingBottom: '110px' },
    elementStyles: {
      title: { color: T.OFFWHITE, fontFamily: T.HEAD, fontWeight: '600', letterSpacing: '-0.02em' },
      description: { color: T.ON_DARK_SOFT, fontFamily: T.BODY },
      primaryButton: { color: T.FOREST, fontWeight: '600' },
      secondaryButton: { color: T.OFFWHITE, borderColor: T.MINT, fontWeight: '600' },
    },
  });

  const add = (b: unknown) => { if (b) blocks.push(b); return b; };

  return { ord, blocks, add, section, heading, overline, lead, text, pill, image, spacer, divider, button, hero, ctaBlock };
}

export interface PageMeta { slug: string; title: string; seoTitle?: string; seoDescription?: string; ogImage?: string; postType?: string; customCss?: string; customJs?: string; }

/** Idempotent upsert of a page post by (websiteId, slug). Creates as DRAFT. */
export async function upsertPage(meta: PageMeta, blocks: unknown[]) {
  if (!WEBSITE_ID) throw new Error('WEBSITE_ID not resolved — run setup-client.ts first (writes _ids.json).');
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { posts } = await import('../../../lib/db/schema');
  const clean = (blocks as Array<{ type?: string } | null | undefined>).filter((b) => b && b.type !== 'site-footer');
  const content = JSON.stringify({ blocks: clean, version: '1.0' });
  const values = {
    title: meta.title, slug: meta.slug, postType: meta.postType ?? 'page', content,
    published: false, websiteId: WEBSITE_ID,
    seoTitle: meta.seoTitle ?? meta.title, seoDescription: meta.seoDescription ?? '',
    ogImage: meta.ogImage ?? ASSETS.og,
    customCss: meta.customCss ?? null, customJs: meta.customJs ?? null,
  };
  const existing = await db.select().from(posts).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, meta.slug))).limit(1);
  if (existing.length > 0) {
    await db.update(posts).set({ ...values, updatedAt: new Date() }).where(eq(posts.id, existing[0].id));
    console.log(`[upsertPage] Updated "${meta.slug}" id=${existing[0].id} (${clean.length} blocks)`);
    return existing[0].id;
  }
  const [created] = await db.insert(posts).values(values).returning();
  console.log(`[upsertPage] Created "${meta.slug}" id=${created.id} (${clean.length} blocks)`);
  return created.id;
}
