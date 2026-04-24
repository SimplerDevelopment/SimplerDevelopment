import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

async function run() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  const extracted = JSON.parse(fs.readFileSync(path.join(__dirname, 'extracted.json'), 'utf-8'));
  const content = JSON.stringify({ blocks: buildBlocks(extracted.testimonials), version: '1.0' });

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'testimonials'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Testimonials', published: true }).where(eq(posts.id, existing.id));
    console.log(`Testimonials updated: ID ${existing.id}`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'Testimonials', slug: 'testimonials', postType: 'page', content, published: true, websiteId,
      seoTitle: 'Testimonials | London Approach',
      seoDescription: 'Hear from our clients and candidates about working with London Approach.',
    }).returning();
    console.log(`Testimonials created: ID ${p.id}`);
  }
  process.exit(0);
}

function buildBlocks(testimonials: Array<{ quote: string; author: string; category: string }>) {
  const FONT = 'Montserrat, sans-serif';
  const blocks: any[] = [
    {
      type: 'section', id: 't-hero', order: 1,
      backgroundColor: '#124334',
      paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        { type: 'text', id: 't-hero-eyebrow', order: 1, content: 'CLIENT & CANDIDATE REVIEWS',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 't-hero-title', order: 2, level: 1 as const,
          content: 'Testimonials',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1.05', color: '#ffffff', textTransform: 'uppercase' as const, letterSpacing: '-0.01em', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'text', id: 't-hero-sub', order: 3, content: 'What clients and candidates say about working with London Approach.',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', fontFamily: FONT, lineHeight: '1.5', margin: '0 auto', maxWidth: '620px', textAlign: 'center' as const } },
      ],
    },
  ];

  testimonials.forEach((t, i) => {
    const isAlt = i % 2 === 1;
    blocks.push({
      type: 'section', id: `t-sec-${i}`, order: 2 + i,
      backgroundColor: isAlt ? '#F0F4F4' : '#ffffff',
      paddingTop: '96px', paddingBottom: '96px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '960px',
      blocks: [
        { type: 'text', id: `t-cat-${i}`, order: 1, content: t.category, alignment: 'center' as const,
          style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 32px 0' } },
        {
          type: 'testimonial', id: `t-${i}`, order: 2,
          quote: t.quote,
          author: t.author,
          style: { textAlign: 'center' as const },
          elementStyles: {
            quote: { fontFamily: FONT, fontSize: '1.5rem', color: '#0c0e13', lineHeight: '1.55', fontWeight: '400' },
            author: { color: '#124334', fontSize: '0.8125rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600' },
          },
        },
      ],
    });
  });

  // Site footer
  blocks.push({
    type: 'site-footer', id: 'tst-footer', order: 2 + testimonials.length,
    tagline: 'Modern Staffing Solutions. Women-owned & women-led.',
    backgroundColor: '#0d2f24',
    textColor: '#ffffff',
    accentColor: '#ffffff',
    linkGroups: [
      { label: 'Explore', links: [
        { label: 'Services', href: '/services' },
        { label: 'Why LA', href: '/why-la' },
        { label: 'Meet the team', href: '/meet-the-team' },
        { label: 'Testimonials', href: '/testimonials' },
        { label: 'Reach out', href: '/reach-out' },
      ] },
      { label: 'Philadelphia Market', links: [
        { label: '1100 E. Hector St.', href: '#' },
        { label: 'Suite 245', href: '#' },
        { label: 'Conshohocken, PA 19428', href: '#' },
      ] },
      { label: 'Tampa Market', links: [
        { label: '3750 Gunn Highway', href: '#' },
        { label: 'Suite 306, #1030', href: '#' },
        { label: 'Tampa, FL 33618', href: '#' },
      ] },
    ],
    contactInfo: {
      phone: '+1-610-590-4900',
      email: 'info@londonapproach.com',
    },
    copyright: '\u00A9 2026 London Approach. All rights reserved.',
  });

  return blocks;
}

run().catch(err => { console.error(err); process.exit(1); });
