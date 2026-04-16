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
  const content = JSON.stringify({ blocks: buildBlocks(extracted.team.members), version: '1.0' });

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'meet-the-team'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Meet Our Team', published: true }).where(eq(posts.id, existing.id));
    console.log(`Team updated: ID ${existing.id}`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'Meet Our Team', slug: 'meet-the-team', postType: 'page', content, published: true, websiteId,
      seoTitle: 'Meet Our Team | London Approach',
      seoDescription: 'Meet the women-led team behind London Approach — recruiters, business development leaders, and search experts.',
    }).returning();
    console.log(`Team created: ID ${p.id}`);
  }
  process.exit(0);
}

function buildBlocks(members: any[]) {
  const FONT = 'Montserrat, sans-serif';
  return [
    {
      type: 'section', id: 'team-hero', order: 1,
      backgroundColor: '#124334',
      paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        { type: 'text', id: 'team-hero-eyebrow', order: 1, content: 'LONDON APPROACH',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 'team-hero-title', order: 2, level: 1 as const,
          content: 'Meet Our Team',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1.05', color: '#ffffff', textTransform: 'uppercase' as const, letterSpacing: '-0.01em', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'text', id: 'team-hero-sub', order: 3, content: 'The people behind every placement.',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', fontFamily: FONT, lineHeight: '1.5', margin: '0 auto', maxWidth: '620px', textAlign: 'center' as const } },
      ],
    },
    {
      type: 'section', id: 'team-section', order: 2,
      backgroundColor: '#ffffff',
      paddingTop: '96px', paddingBottom: '96px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        { type: 'text', id: 'team-eyebrow', order: 1, content: 'WHO WE ARE',
          alignment: 'center' as const,
          style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 20px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 'team-h', order: 2, level: 2 as const,
          content: 'The London Approach Team',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.15', margin: '0 0 24px 0', textTransform: 'none' as const, textAlign: 'center' as const } },
        { type: 'text', id: 'team-sub', order: 3, content: 'Women-owned. Results-driven. Relentless for our clients and candidates.',
          alignment: 'center' as const,
          style: { color: 'rgba(12,14,19,0.65)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 72px auto', maxWidth: '640px', fontFamily: FONT, textAlign: 'center' as const } },
        {
          type: 'card-grid', id: 'team-grid', order: 4, columns: 4 as const,
          elementStyles: {
            card: { backgroundColor: '#ffffff', borderRadius: '0px', padding: '0', border: '0' },
            cardImage: { width: '100%', customCSS: 'aspect-ratio: 4/5; object-fit: cover; display: block' },
            cardTitle: { fontFamily: FONT, fontSize: '1rem', fontWeight: '700', color: '#0c0e13', margin: '20px 0 6px 0' },
            cardDescription: { fontFamily: FONT, fontSize: '0.8125rem', lineHeight: '1.5', color: '#124334', fontWeight: '500', margin: '0 0 16px 0' },
          },
          cards: members.map((m: any, i: number) => ({
            id: `m${i}`,
            title: m.name,
            description: m.title,
            image: m.photo,
          })),
        },
      ],
    },
    {
      type: 'site-footer', id: 'team-footer', order: 3,
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
    },
  ];
}

run().catch(err => { console.error(err); process.exit(1); });
