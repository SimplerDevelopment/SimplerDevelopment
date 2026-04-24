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

  const content = JSON.stringify({ blocks: buildBlocks(), version: '1.0' });
  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'reach-out'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Reach Out', published: true }).where(eq(posts.id, existing.id));
    console.log(`Reach Out updated: ID ${existing.id}`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'Reach Out', slug: 'reach-out', postType: 'page', content, published: true, websiteId,
      seoTitle: 'Reach Out | London Approach',
      seoDescription: 'Let\u2019s talk. Schedule a call with London Approach \u2014 offices in Conshohocken, PA and Tampa, FL.',
    }).returning();
    console.log(`Reach Out created: ID ${p.id}`);
  }
  process.exit(0);
}

function buildBlocks() {
  const FONT = 'Montserrat, sans-serif';
  return [
    {
      type: 'section', id: 'ro-hero', order: 1,
      backgroundColor: '#124334',
      paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        { type: 'text', id: 'ro-hero-eyebrow', order: 1, content: "LET'S TALK",
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 'ro-hero-title', order: 2, level: 1 as const,
          content: 'Reach Out',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1.05', color: '#ffffff', textTransform: 'uppercase' as const, letterSpacing: '-0.01em', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'text', id: 'ro-hero-sub', order: 3, content: 'How can we help?',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', fontFamily: FONT, lineHeight: '1.5', margin: '0 auto', maxWidth: '520px', textAlign: 'center' as const } },
      ],
    },
    // Contact info — two columns
    {
      type: 'section', id: 'ro-contact', order: 2,
      backgroundColor: '#ffffff',
      paddingTop: '96px', paddingBottom: '64px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        {
          type: 'columns', id: 'ro-cols', order: 1, gap: 'lg' as const, stackOnMobile: true,
          columns: [
            { id: 'ro-phila', width: '50%', verticalAlign: 'top' as const, blocks: [
              { type: 'text', id: 'ro-ph-e', order: 1, content: 'Philadelphia Market',
                style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 16px 0' } },
              { type: 'heading', id: 'ro-ph-h', order: 2, level: 3 as const, content: 'Conshohocken, PA',
                style: { fontFamily: FONT, fontSize: '2rem', fontWeight: '700', color: '#0c0e13', margin: '0 0 24px 0' } },
              { type: 'text', id: 'ro-ph-a', order: 3, content: '1100 E. Hector St.\nSuite 245\nConshohocken, PA 19428',
                style: { color: '#0c0e13', fontSize: '1rem', lineHeight: '1.7', fontFamily: FONT, margin: '0 0 24px 0', whiteSpace: 'pre-line' as const } },
              { type: 'text', id: 'ro-ph-p', order: 4, content: 'Phone: +1-610-590-4900',
                style: { color: '#0c0e13', fontSize: '1rem', fontFamily: FONT, margin: '0 0 8px 0' } },
              { type: 'text', id: 'ro-ph-em', order: 5, content: 'Email: info@londonapproach.com',
                style: { color: '#0c0e13', fontSize: '1rem', fontFamily: FONT } },
            ]},
            { id: 'ro-tampa', width: '50%', verticalAlign: 'top' as const, blocks: [
              { type: 'text', id: 'ro-t-e', order: 1, content: 'Tampa Market',
                style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 16px 0' } },
              { type: 'heading', id: 'ro-t-h', order: 2, level: 3 as const, content: 'Tampa, FL',
                style: { fontFamily: FONT, fontSize: '2rem', fontWeight: '700', color: '#0c0e13', margin: '0 0 24px 0' } },
              { type: 'text', id: 'ro-t-a', order: 3, content: '3750 Gunn Highway\nSuite 306, #1030\nTampa, FL 33618',
                style: { color: '#0c0e13', fontSize: '1rem', lineHeight: '1.7', fontFamily: FONT, margin: '0 0 24px 0', whiteSpace: 'pre-line' as const } },
              { type: 'text', id: 'ro-t-p', order: 4, content: 'Phone: +1-610-590-4900',
                style: { color: '#0c0e13', fontSize: '1rem', fontFamily: FONT, margin: '0 0 8px 0' } },
              { type: 'text', id: 'ro-t-em', order: 5, content: 'Email: info@londonapproach.com',
                style: { color: '#0c0e13', fontSize: '1rem', fontFamily: FONT } },
            ]},
          ],
        },
      ],
    },
    // Booking embed
    {
      type: 'section', id: 'ro-booking', order: 3,
      backgroundColor: '#F0F4F4',
      paddingTop: '96px', paddingBottom: '96px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          type: 'booking',
          id: 'ro-booking-embed',
          order: 1,
          slug: 'london-approach-call',
          title: 'Schedule a call with our team',
          showPageTitle: true,
          showDescription: true,
          height: '700px',
          styleOverrides: {
            primaryColor: '#124334',
            buttonBg: '#124334',
            buttonText: '#ffffff',
          },
        },
      ],
    },
    {
      type: 'site-footer', id: 'ro-footer', order: 4,
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
