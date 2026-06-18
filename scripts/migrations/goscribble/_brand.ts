/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
/**
 * Shared brand constants + block helpers for the Scribble (goscribble.ai) migration.
 * Colors/fonts verified via live computed styles — see COLOR-MAP.md.
 *
 * Block prop names follow types/blocks.ts EXACTLY:
 *   - image  → `url` (NOT src), `alt`
 *   - button → `url` (NOT link), `text`
 *   - cta    → `primaryButtonUrl`/`secondaryButtonUrl`, `description`, `backgroundStyle`
 *   - no `faq` block → use `accordion`
 *   - section: prefer `style.*`; `maxWidth` stays a direct prop
 *   - every block needs id/type/order
 */

export const BRAND = {
  navy: '#0C1F3F',
  navyMid: '#0A2A4A',
  teal: '#00B896',
  tealDark: '#009E80',
  tealLight: '#E6F9F5',
  offWhite: '#F7F9FC',
  white: '#FFFFFF',
  heading: '#0C1F3F',
  body: '#64748B',
  bodyLight: 'rgba(255,255,255,0.72)',
  bodyLightDim: 'rgba(255,255,255,0.55)',
  border: '#E2E8F0',
  demoUrl: 'https://meetings-na2.hubspot.com/andrew-ostrander?uuid=e7d6f1e5-a9a2-4609-82e4-6c83467d63bd',
};

export const NAVY_GRADIENT = `background: linear-gradient(160deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%);`;

let _ord = 0;
export const resetOrder = () => { _ord = 0; };
const next = () => ++_ord;

type Style = Record<string, any>;
type Block = Record<string, any>;

/** A full-bleed section with a constrained inner content column. */
export function section(id: string, opts: {
  bg?: string; dark?: boolean; gradient?: boolean; anchor?: string;
  py?: string; maxWidth?: string; style?: Style;
}, blocks: Block[]): Block {
  // re-number children sequentially within the section
  blocks.forEach((b, i) => { b.order = i + 1; });
  const style: Style = {
    paddingTop: opts.py ?? '88px',
    paddingBottom: opts.py ?? '88px',
    paddingLeft: '24px',
    paddingRight: '24px',
    ...(opts.bg ? { backgroundColor: opts.bg } : {}),
    ...(opts.gradient ? { backgroundColor: BRAND.navy, customCSS: NAVY_GRADIENT } : {}),
    ...(opts.style ?? {}),
  };
  const s: Block = {
    id, type: 'section', order: next(),
    maxWidth: opts.maxWidth ?? '1080px',
    style,
    blocks,
  };
  if (opts.anchor) s.anchor = opts.anchor;
  return s;
}

export function heading(id: string, content: string, level: 2 | 3 | 4, opts: { dark?: boolean; align?: 'left' | 'center' | 'right'; style?: Style } = {}): Block {
  return {
    id, type: 'heading', order: 0, content, level,
    alignment: opts.align ?? 'center',
    style: {
      color: opts.dark ? BRAND.white : BRAND.heading,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: '800',
      letterSpacing: '-0.02em',
      lineHeight: '1.15',
      marginBottom: '16px',
      ...(opts.style ?? {}),
    },
  };
}

export function text(id: string, content: string, opts: { dark?: boolean; align?: 'left' | 'center' | 'right'; size?: 'sm' | 'base' | 'lg' | 'xl'; style?: Style } = {}): Block {
  return {
    id, type: 'text', order: 0, content,
    alignment: opts.align ?? 'center',
    size: opts.size ?? 'lg',
    style: {
      color: opts.dark ? BRAND.bodyLight : BRAND.body,
      fontFamily: 'Plus Jakarta Sans',
      lineHeight: '1.65',
      maxWidth: '720px',
      marginLeft: 'auto',
      marginRight: 'auto',
      marginBottom: '8px',
      ...(opts.style ?? {}),
    },
  };
}

/** Teal eyebrow/overline label. */
export function overline(id: string, content: string, opts: { dark?: boolean; align?: 'left' | 'center' } = {}): Block {
  return {
    id, type: 'text', order: 0, content,
    alignment: opts.align ?? 'center',
    size: 'sm',
    style: {
      color: BRAND.teal,
      fontFamily: 'Plus Jakarta Sans',
      textTransform: 'uppercase',
      letterSpacing: '0.22em',
      fontWeight: '700',
      fontSize: '0.75rem',
      marginBottom: '14px',
    },
  };
}

export function spacer(id: string, height: 'sm' | 'md' | 'lg' | 'xl' = 'md'): Block {
  return { id, type: 'spacer', order: 0, height };
}

export function button(id: string, text: string, url: string, opts: { variant?: 'primary' | 'secondary' | 'outline'; align?: 'left' | 'center' | 'right'; icon?: string; iconPosition?: 'left' | 'right'; hoverEffect?: string; newTab?: boolean; style?: Style } = {}): Block {
  return {
    id, type: 'button', order: 0, text, url,
    variant: opts.variant ?? 'primary',
    size: 'lg',
    alignment: opts.align ?? 'center',
    icon: opts.icon ?? 'arrow_forward',
    iconPosition: opts.iconPosition ?? 'right',
    hoverEffect: opts.hoverEffect ?? 'lift',
    openInNewTab: opts.newTab ?? false,
    style: { marginTop: '12px', ...(opts.style ?? {}) },
  };
}

/** Glass secondary button — visible on dark/navy backgrounds (white text, frosted bg). */
export const GLASS_BTN_STYLE: Style = {
  color: '#FFFFFF',
  backgroundColor: 'rgba(255,255,255,0.10)',
  borderColor: 'rgba(255,255,255,0.30)',
  borderWidth: '1px',
  borderStyle: 'solid',
};

/** card-grid with icon cards on a given background tone. */
export function cardGrid(id: string, cards: Array<{ id: string; title: string; description: string; icon: string }>, opts: { columns?: 2 | 3 | 4; dark?: boolean; cardBg?: string } = {}): Block {
  const cardBg = opts.cardBg ?? (opts.dark ? 'rgba(255,255,255,0.04)' : BRAND.white);
  const titleColor = opts.dark ? BRAND.white : BRAND.heading;
  const descColor = opts.dark ? BRAND.bodyLight : BRAND.body;
  return {
    id, type: 'card-grid', order: 0,
    columns: opts.columns ?? 3,
    cards,
    style: { marginTop: '16px' },
    elementStyles: {
      card: {
        backgroundColor: cardBg,
        borderRadius: '16px',
        padding: '32px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: opts.dark ? 'rgba(255,255,255,0.10)' : BRAND.border,
        customCSS: 'box-shadow: 0 10px 30px rgba(12,31,63,0.06); transition: all 0.3s ease; height: 100%;',
      },
      cardIcon: { color: BRAND.teal, fontSize: '40px' },
      cardTitle: { color: titleColor, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', fontSize: '1.15rem', marginTop: '12px' },
      cardDescription: { color: descColor, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.6', fontSize: '0.975rem' },
    },
  };
}

export function stats(id: string, items: Array<{ id: string; value: string; label: string }>, opts: { columns?: 2 | 3 | 4; dark?: boolean } = {}): Block {
  return {
    id, type: 'stats', order: 0,
    columns: opts.columns ?? 4,
    stats: items,
    elementStyles: {
      statValue: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '800', fontSize: '2.6rem', letterSpacing: '-0.02em' },
      statLabel: { color: opts.dark ? BRAND.bodyLightDim : BRAND.body, fontFamily: 'Plus Jakarta Sans', fontSize: '0.95rem', lineHeight: '1.4' },
    },
  };
}

export function accordion(id: string, title: string | undefined, items: Array<{ id: string; title: string; content: string }>): Block {
  return {
    id, type: 'accordion', order: 0,
    ...(title ? { title } : {}),
    items,
    elementStyles: {
      itemTitle: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', fontSize: '1.05rem' },
      itemContent: { color: BRAND.body, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.65' },
    },
  };
}

/** Upsert a page post by (websiteId, slug). Returns the post id. */
export async function upsertPost(opts: {
  websiteId: number; slug: string; title: string; postType?: string;
  blocks: Block[]; seoTitle?: string; seoDescription?: string; ogImage?: string;
  excerpt?: string; coverImage?: string; published?: boolean;
}): Promise<number> {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const content = JSON.stringify({ blocks: opts.blocks, version: '1.0' });
  const values = {
    title: opts.title,
    slug: opts.slug,
    postType: opts.postType ?? 'page',
    content,
    websiteId: opts.websiteId,
    published: opts.published ?? false,
    seoTitle: opts.seoTitle ?? null,
    seoDescription: opts.seoDescription ?? null,
    ogImage: opts.ogImage ?? null,
    excerpt: opts.excerpt ?? null,
    coverImage: opts.coverImage ?? null,
    updatedAt: new Date(),
  };
  const [existing] = await db.select().from(posts)
    .where(and(eq(posts.websiteId, opts.websiteId), eq(posts.slug, opts.slug))).limit(1);
  if (existing) {
    // Preserve the live published state on update unless explicitly overridden,
    // so re-importing a page on a LIVE site doesn't briefly take it offline.
    const updateValues = opts.published === undefined
      ? { ...values, published: existing.published }
      : values;
    await db.update(posts).set(updateValues).where(eq(posts.id, existing.id));
    console.log(`  updated post #${existing.id} (${opts.slug}, published=${updateValues.published})`);
    return existing.id;
  }
  const [created] = await db.insert(posts).values(values).returning();
  console.log(`  created post #${created.id} (${opts.slug})`);
  return created.id;
}
