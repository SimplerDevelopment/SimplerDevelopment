import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const CATEGORIES = [
  { title: 'Information Technology', icon: 'memory', body: "What's your tech stack? Whether you have an implementation project or need a Director of IT, we are here to show you the hidden talent the market has to offer." },
  { title: 'Accounting & Finance', icon: 'account_balance', body: 'We have an established network of experienced Accounting & Finance professionals. From a Senior Accountant to a Vice President of Finance, we source passive candidates and thoroughly vet them to determine culture and technical fit for your organization.' },
  { title: 'Human Resources', icon: 'groups', body: 'We have a solid cache of top tier HR talent with a range of expertise and specialties. From Talent Acquisition to DEI and HR Leadership professionals, we identify passive talent that will ensure your success as you grow.' },
  { title: 'Engineering & Supply Chain', icon: 'precision_manufacturing', body: 'Our staff augmentation and direct hire search team deploy engineering and supply chain talent to clientele ranging from mid-size engineering firms to big pharma. From a VP of Engineering to a temporary Project Manager, our technical recruitment specialists have developed relationships with the best and brightest.' },
  { title: 'Administration', icon: 'business_center', body: 'We understand the importance of administrative support to keep your organization operating effectively. We have experience placing all levels of administration from an Executive Assistant to a Chief of Staff.' },
  { title: 'Construction & Real Estate', icon: 'domain', body: 'Our niche focus in Commercial Construction and Real Estate allows us to understand your hiring needs quickly and effectively. We speak your language and understand the nuances of project management, engineering, and asset management. Let us create a go-to-market strategy to recruit top construction talent that can impact your bottom line.' },
];

const SERVICE_TYPES = [
  { title: 'Temporary Staffing', body: 'Flex your workforce up and down with vetted professionals ready to plug in on day one.', icon: 'schedule' },
  { title: 'Direct-Hire Search', body: 'Full-time placements backed by deep passive-candidate networks across North America.', icon: 'person_search' },
  { title: 'Diversity Initiatives', body: 'Deliberately diverse candidate pipelines, built into every search from the first conversation.', icon: 'diversity_3' },
  { title: 'Retained Search', body: 'Executive-level retained engagements for the roles that define your organization\u2019s trajectory.', icon: 'workspace_premium' },
];

async function run() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  const content = JSON.stringify({ blocks: buildBlocks(), version: '1.0' });
  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'services'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Services', published: true }).where(eq(posts.id, existing.id));
    console.log(`Services updated: ID ${existing.id}`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'Services', slug: 'services', postType: 'page', content, published: true, websiteId,
      seoTitle: 'Services | London Approach',
      seoDescription: 'Results-driven staffing firm specializing in Temporary Solutions, Direct Hire Recruiting, Diversity Initiatives, and Retained Search across IT, Finance, HR, Engineering, Admin, and Construction.',
    }).returning();
    console.log(`Services created: ID ${p.id}`);
  }
  process.exit(0);
}

function buildBlocks() {
  const FONT = 'Montserrat, sans-serif';
  const blocks: any[] = [
    {
      type: 'section', id: 'svc-hero', order: 1,
      backgroundColor: '#124334',
      paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        { type: 'text', id: 'svc-hero-eyebrow', order: 1, content: 'LONDON APPROACH',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 'svc-hero-title', order: 2, level: 1 as const,
          content: 'Services',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1.05', color: '#ffffff', textTransform: 'uppercase' as const, letterSpacing: '-0.01em', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'text', id: 'svc-hero-sub', order: 3, content: 'We are a results-driven staffing firm that specializes in Temporary Solutions, Direct Hire Recruiting, Diversity Initiatives, and Retained Search.',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', fontFamily: FONT, lineHeight: '1.5', margin: '0 auto', maxWidth: '620px', textAlign: 'center' as const } },
      ],
    },
  ];

  // SERVICE TYPES — 4 pillars, white bg, 4-col
  blocks.push({
    type: 'section', id: 'svc-types', order: 2,
    backgroundColor: '#ffffff',
    paddingTop: '120px', paddingBottom: '80px', paddingLeft: '24px', paddingRight: '24px',
    maxWidth: '1280px',
    blocks: [
      { type: 'text', id: 'svc-types-eyebrow', order: 1, content: 'HOW WE WORK',
        alignment: 'center' as const,
        style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 20px 0', textAlign: 'center' as const } },
      { type: 'heading', id: 'svc-types-h', order: 2, level: 2 as const, content: 'Four ways we solve for talent',
        alignment: 'center' as const,
        style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.15', margin: '0 0 24px 0', textAlign: 'center' as const, textTransform: 'none' as const } },
      { type: 'text', id: 'svc-types-sub', order: 3, content: 'From day-one flex to executive retained search \u2014 we shape the engagement around your hiring plan.',
        alignment: 'center' as const,
        style: { color: 'rgba(12,14,19,0.65)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 64px auto', maxWidth: '640px', fontFamily: FONT, textAlign: 'center' as const } },
      { type: 'card-grid', id: 'svc-types-cards', order: 4, columns: 4 as const,
        elementStyles: {
          card: { backgroundColor: '#F0F4F4', borderRadius: '0px', padding: '36px 28px', border: '0' },
          cardIcon: { color: '#124334', fontSize: '2.25rem' },
          cardTitle: { fontFamily: FONT, fontSize: '1.0625rem', fontWeight: '700', color: '#0c0e13', margin: '16px 0 12px 0' },
          cardDescription: { fontFamily: FONT, fontSize: '0.875rem', lineHeight: '1.55', color: 'rgba(12,14,19,0.7)' },
        },
        cards: SERVICE_TYPES.map((s, i) => ({ id: `st${i}`, title: s.title, description: s.body, icon: s.icon })),
      },
    ],
  });

  // INDUSTRIES — 3-col detailed grid on light green-tinted bg
  blocks.push({
    type: 'section', id: 'svc-industries', order: 3,
    backgroundColor: '#F0F4F4',
    paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
    maxWidth: '1280px',
    blocks: [
      { type: 'text', id: 'svc-ind-eyebrow', order: 1, content: 'INDUSTRY VERTICALS',
        alignment: 'center' as const,
        style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 20px 0', textAlign: 'center' as const } },
      { type: 'heading', id: 'svc-ind-h', order: 2, level: 2 as const, content: 'Deep expertise where it counts',
        alignment: 'center' as const,
        style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.15', margin: '0 0 24px 0', textAlign: 'center' as const, textTransform: 'none' as const } },
      { type: 'text', id: 'svc-ind-sub', order: 3, content: 'Six verticals, thousands of placements. We know the roles, the language, and the talent pool.',
        alignment: 'center' as const,
        style: { color: 'rgba(12,14,19,0.65)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 64px auto', maxWidth: '640px', fontFamily: FONT, textAlign: 'center' as const } },
      { type: 'card-grid', id: 'svc-ind-cards', order: 4, columns: 2 as const,
        elementStyles: {
          card: { backgroundColor: '#ffffff', borderRadius: '0px', padding: '48px 40px', border: '0' },
          cardIcon: { color: '#124334', fontSize: '2.5rem' },
          cardTitle: { fontFamily: FONT, fontSize: '1.625rem', fontWeight: '700', color: '#0c0e13', margin: '20px 0 16px 0' },
          cardDescription: { fontFamily: FONT, fontSize: '0.9375rem', lineHeight: '1.65', color: 'rgba(12,14,19,0.72)' },
        },
        cards: CATEGORIES.map((c, i) => ({ id: `c${i}`, title: c.title, description: c.body, icon: c.icon })),
      },
    ],
  });

  // Footer CTA — dark green
  blocks.push({
    type: 'section', id: 'svc-cta', order: 4,
    backgroundColor: '#124334',
    paddingTop: '100px', paddingBottom: '100px', paddingLeft: '24px', paddingRight: '24px',
    maxWidth: '920px',
    blocks: [
      { type: 'heading', id: 'svc-cta-h', order: 1, level: 2 as const, content: 'Let\u2019s build your next great team.',
        alignment: 'center' as const,
        style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#ffffff', lineHeight: '1.15', margin: '0 0 24px 0', textAlign: 'center' as const, textTransform: 'none' as const } },
      { type: 'text', id: 'svc-cta-sub', order: 2, content: 'Tell us about the role, the timeline, and the outcome you need. We\u2019ll take it from there.',
        alignment: 'center' as const,
        style: { color: 'rgba(255,255,255,0.82)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 40px auto', maxWidth: '560px', fontFamily: FONT, textAlign: 'center' as const } },
      { type: 'button', id: 'svc-cta-btn', order: 3, text: 'Reach Out', url: '/reach-out',
        variant: 'primary' as const, alignment: 'center' as const, size: 'lg' as const, icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const },
    ],
  });

  // Site footer
  blocks.push({
    type: 'site-footer', id: 'svc-footer', order: 5,
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
