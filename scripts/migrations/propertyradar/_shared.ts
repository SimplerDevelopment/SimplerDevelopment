/**
 * Shared block-builder primitives + DB upsert for the PropertyRadar migration.
 * EVERY page-import script must build via these helpers so all pages share the
 * same tokens, section rhythm, footer, and SEO/upsert behavior.
 *
 * Usage in an import-<page>.ts:
 *   import { T, makePage, footerBlock, upsertPage, WEBSITE_ID } from './_shared';
 *   const p = makePage();
 *   p.add(p.hero({ title, subtitle, description, ctaText, ctaLink, secondaryCtaText, secondaryCtaLink }));
 *   p.add(p.section('sec-x', T.TINT, 96, [ p.overline('ov','LABEL'), p.heading('h','Title'), ...children ]));
 *   p.add(footerBlock(p.ord()));
 *   await upsertPage({ slug:'about', title:'About', seoTitle, seoDescription, ogImage }, p.blocks);
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd = PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host.');
  process.exit(1);
}

export const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);

// ─── Design tokens (mirror DESIGN_SYSTEM.md) ───────────────────────────────────
export const T = {
  NAVY: '#0A1F44', NAVY2: '#123563', BLUE: '#19467F', GREEN: '#38CB89', GREEN_D: '#2BA56C',
  TINT: '#ECF9FF', TINT2: '#F5FAFD', MINT: '#E9FBF2', WHITE: '#FFFFFF', INK: '#41506B', LINE: '#E2E8F2',
  PF: 'Poppins, sans-serif',
  // pastel category coding
  PASTEL: { inv: '#AC98F0', res: '#A1DDBD', com: '#A0CEEA', mort: '#E69BC3', svc: '#F5C97B', media: '#9FB3C8' },
};

export const cardOnLight = {
  backgroundColor: T.WHITE, borderWidth: '1px', borderColor: T.LINE, borderStyle: 'solid',
  borderRadius: '16px', customCSS: 'box-shadow:0 10px 40px rgba(10,31,68,0.06);transition:all .3s ease',
};
export const navyGlow = (pos = '50% 0%') =>
  `background-image: radial-gradient(ellipse 80% 55% at ${pos}, rgba(56,203,137,0.14) 0%, transparent 60%);`;

type Dict = Record<string, unknown>;

export function makePage() {
  let o = 0;
  const ord = () => o++;
  const blocks: unknown[] = [];

  const section = (id: string, bg: string, pad: number, children: unknown[], extra: Dict = {}, style: Dict = {}) => ({
    id, type: 'section', order: ord(), maxWidth: '1200px',
    style: { backgroundColor: bg, paddingTop: `${pad}px`, paddingBottom: `${pad}px`, paddingLeft: '24px', paddingRight: '24px', ...style },
    blocks: children, ...extra,
  });

  const heading = (id: string, text: string, level = 2, color = T.NAVY, align = 'center') => ({
    id, type: 'heading', order: ord(), content: text, level, alignment: align,
    style: { color, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: align },
  });

  const overline = (id: string, text: string, color = T.GREEN_D, align = 'center') => ({
    id, type: 'text', order: ord(), content: text, alignment: align,
    style: { color, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: align, marginBottom: '12px' },
  });

  const lead = (id: string, text: string, color = T.INK, align = 'center') => ({
    id, type: 'text', order: ord(), content: text, alignment: align,
    style: { color, fontFamily: T.PF, fontSize: '1.1875rem', lineHeight: '1.6', textAlign: align, maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto', marginTop: '14px' },
  });

  const text = (id: string, content: string, color = T.INK, align = 'left', extraStyle: Dict = {}) => ({
    id, type: 'text', order: ord(), content, alignment: align,
    style: { color, fontFamily: T.PF, fontSize: '1.0625rem', lineHeight: '1.7', textAlign: align, ...extraStyle },
  });

  const htmlRender = (id: string, html: string, width: 'full' | 'contained' = 'contained') => ({
    id, type: 'html-render', order: ord(), html, width,
  });
  const image = (id: string, url: string, alt: string, opts: Dict = {}) => ({
    id, type: 'image', order: ord(), url, alt, width: 'large', alignment: 'center', ...opts,
  });

  const spacer = (id: string, h: 'sm' | 'md' | 'lg' | 'xl' = 'md') => ({ id, type: 'spacer', order: ord(), height: h });
  const divider = (id: string) => ({ id, type: 'divider', order: ord(), lineStyle: 'solid', style: { borderColor: T.LINE } });

  const button = (id: string, txt: string, url: string, variant: 'primary' | 'secondary' | 'outline' = 'primary', opts: Dict = {}) => ({
    id, type: 'button', order: ord(), text: txt, url, variant, size: 'lg', alignment: 'center',
    icon: 'arrow_forward', iconPosition: 'right', hoverEffect: variant === 'primary' ? 'lift' : 'slide', ...opts,
  });

  /** Dark navy hero with green glow. opts.dark=false for a light hero variant. */
  const hero = (opts: {
    id?: string; title: string; subtitle?: string; description?: string;
    ctaText?: string; ctaLink?: string; secondaryCtaText?: string; secondaryCtaLink?: string;
    dark?: boolean; backgroundImage?: string; minHeight?: string;
  }) => {
    // BRAND-FAITHFUL: PropertyRadar is light-dominant. Heroes default to LIGHT
    // (tint bg, navy title, green CTA). Pass dark:true only for a rare accent.
    const dark = opts.dark === true;
    const bg = dark ? T.NAVY : T.TINT;
    const titleColor = dark ? T.WHITE : T.NAVY;
    const descColor = dark ? 'rgba(255,255,255,0.74)' : T.INK;
    const style: Dict = {
      backgroundColor: bg, minHeight: opts.minHeight ?? '56vh', paddingTop: '140px', paddingBottom: '96px',
      customCSS: dark ? 'background-image: radial-gradient(ellipse 70% 60% at 70% 25%, rgba(56,203,137,0.16) 0%, transparent 60%);' : undefined,
    };
    if (opts.backgroundImage) { style.backgroundImage = `url(${opts.backgroundImage})`; style.backgroundSize = 'cover'; style.backgroundPosition = 'center'; }
    return {
      id: opts.id ?? 'hero', type: 'hero', order: ord(),
      title: opts.title, subtitle: opts.subtitle, description: opts.description,
      ctaText: opts.ctaText, ctaLink: opts.ctaLink,
      secondaryCtaText: opts.secondaryCtaText, secondaryCtaLink: opts.secondaryCtaLink,
      style,
      elementStyles: {
        subtitle: { color: dark ? T.GREEN : T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.75rem' },
        title: { color: titleColor, fontFamily: T.PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4.5vw,3.75rem)', letterSpacing: '-0.02em', lineHeight: '1.06', customCSS: dark ? 'text-shadow:0 2px 34px rgba(0,0,0,0.4)' : undefined },
        description: { color: descColor, fontSize: '1.1875rem', lineHeight: '1.65', maxWidth: '660px' },
        cta: { color: T.NAVY, fontWeight: '600' },
        secondaryCta: { color: dark ? '#FFFFFF' : T.NAVY, borderColor: T.GREEN, fontWeight: '600' },
      },
    };
  };

  /** Final CTA section — LIGHT mint with a soft green glow (brand-faithful). */
  const ctaBlock = (opts: { id?: string; title: string; description?: string; primaryButtonText?: string; primaryButtonUrl?: string; secondaryButtonText?: string; secondaryButtonUrl?: string }) => ({
    id: opts.id ?? 'cta', type: 'cta', order: ord(),
    title: opts.title, description: opts.description,
    primaryButtonText: opts.primaryButtonText ?? 'Try it Free', primaryButtonUrl: opts.primaryButtonUrl ?? '/register',
    secondaryButtonText: opts.secondaryButtonText, secondaryButtonUrl: opts.secondaryButtonUrl,
    backgroundStyle: 'solid',
    style: { backgroundColor: T.MINT, paddingTop: '100px', paddingBottom: '100px', customCSS: 'background-image: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(56,203,137,0.16) 0%, transparent 65%);' },
    elementStyles: {
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em' },
      description: { color: T.INK },
      primaryButton: { color: T.NAVY, fontWeight: '600' },
      secondaryButton: { color: T.NAVY, borderColor: T.GREEN, fontWeight: '600' },
    },
  });

  const add = (b: unknown) => { if (b) blocks.push(b); return b; };

  return { ord, blocks, add, section, heading, overline, lead, text, htmlRender, image, spacer, divider, button, hero, ctaBlock };
}

/**
 * Footer: the SITES LAYOUT already renders a universal, nav-derived SiteFooter
 * on every page (app/sites/[domain]/layout.tsx). A per-page site-footer block
 * therefore DOUBLES the footer. This factory is intentionally a no-op (returns
 * null) so existing `p.add(footerBlock(p.ord()))` calls become no-ops and pages
 * rely on the global footer. Kept as an exported fn so import scripts still
 * compile without edits.
 */
export function footerBlock(_order: number) {
  return null;
}

function _legacyFooterBlock(order: number) {
  return {
    id: 'footer', type: 'site-footer', order,
    logoUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Brand%20Assets/5f6496ee50a79fe0a801cc27_PR-Logo-Full-p-800.png',
    logoAlt: 'PropertyRadar', wordmark: 'PropertyRadar',
    tagline: 'Find motivated property owners. Powered by 20 years of obsessive data quality.',
    brandSize: 'md',
    backgroundColor: T.NAVY2, textColor: 'rgba(255,255,255,0.78)', accentColor: T.GREEN,
    linkGroups: [
      { label: 'Who We Serve', links: [
        { label: 'Real Estate Investors', href: '/built-for/real-estate-investors' },
        { label: 'Residential Agents', href: '/built-for/residential-agents' },
        { label: 'Commercial Agents', href: '/built-for/commercial-agents' },
        { label: 'Mortgage Pros', href: '/built-for/mortgage-pros' },
        { label: 'Home & Property Services', href: '/built-for/service-pros' },
      ]},
      { label: 'Features', links: [
        { label: 'Feature Overview', href: '/features' },
        { label: 'Property & Owner Data', href: '/features/property-and-owner-data' },
        { label: 'Targeted Marketing', href: '/features/targeted-marketing' },
        { label: 'Foreclosures', href: '/features/foreclosures' },
        { label: 'Real Estate Tools', href: '/features/real-estate-tools' },
        { label: 'Address Scanner', href: '/features/property-address-scanner' },
        { label: 'Integrations', href: '/features/integrations' },
        { label: 'API', href: '/features/api' },
      ]},
      { label: 'Comparisons', links: [
        { label: 'vs. BatchLeads', href: '/compare/propertyradar-vs-batchleads' },
        { label: 'vs. DealMachine', href: '/compare/propertyradar-vs-dealmachine' },
        { label: 'vs. Listsource', href: '/compare/propertyradar-vs-listsource' },
        { label: 'vs. Mashvisor', href: '/compare/propertyradar-vs-mashvisor' },
        { label: 'vs. Propstream', href: '/compare/propertyradar-vs-propstream' },
      ]},
      { label: 'Resources', links: [
        { label: 'Lead Gen Plays', href: '/plays' },
        { label: 'Support', href: '/support' },
        { label: 'Blog', href: '/blog' },
        { label: 'Podcast', href: '/learn/local-leverage-podcast' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Coverage', href: '/coverage' },
      ]},
      { label: 'Company', links: [
        { label: 'About Us', href: '/about' },
        { label: 'Partner Program', href: '/partner' },
        { label: 'User Agreement', href: '/user-agreement' },
        { label: 'Privacy Policy', href: '/privacy-policy' },
      ]},
    ],
    contactInfo: { address: 'PO Box 837, Truckee, CA 96160' },
    socialLinks: [
      { platform: 'facebook', url: 'https://facebook.com/propertyradar' },
      { platform: 'twitter', url: 'https://twitter.com/propertyradar' },
      { platform: 'linkedin', url: 'https://linkedin.com/company/propertyradar' },
      { platform: 'youtube', url: 'https://youtube.com/propertyradar' },
      { platform: 'instagram', url: 'https://instagram.com/propertyradar' },
    ],
    copyright: '© 2026 PropertyRadar. All rights reserved.',
  };
}

export interface PageMeta { slug: string; title: string; seoTitle?: string; seoDescription?: string; ogImage?: string; postType?: string; }

/** Idempotent upsert of a page post by (websiteId, slug). Creates as DRAFT. */
export async function upsertPage(meta: PageMeta, blocks: unknown[]) {
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { posts } = await import('../../../lib/db/schema');
  // Defensive: strip any falsy or site-footer blocks (global layout footer is canonical)
  const clean = (blocks as Array<{ type?: string } | null | undefined>).filter((b) => b && b.type !== 'site-footer');
  const content = JSON.stringify({ blocks: clean, version: '1.0' });
  const values = {
    title: meta.title, slug: meta.slug, postType: meta.postType ?? 'page', content,
    published: false, websiteId: WEBSITE_ID,
    seoTitle: meta.seoTitle ?? meta.title, seoDescription: meta.seoDescription ?? '',
    ogImage: meta.ogImage ?? 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
  };
  const existing = await db.select().from(posts).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, meta.slug))).limit(1);
  if (existing.length > 0) {
    await db.update(posts).set({ ...values, updatedAt: new Date() }).where(eq(posts.id, existing[0].id));
    console.log(`[upsertPage] Updated "${meta.slug}" id=${existing[0].id} (${blocks.length} blocks)`);
    return existing[0].id;
  }
  const [created] = await db.insert(posts).values(values).returning();
  console.log(`[upsertPage] Created "${meta.slug}" id=${created.id} (${blocks.length} blocks)`);
  return created.id;
}
