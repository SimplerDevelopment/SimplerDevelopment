import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

const STEPS = [
  { n: 1, title: 'Intake Meeting', tag: '#letszoom', body: 'We get to know the soft sells and hard facts about your organization and why this role is open. We develop a game plan for your search and provide consultative feedback on current market conditions.' },
  { n: 2, title: 'Search Strategy', tag: '#whatsyourpitch', body: 'We develop a branding strategy to highlight the career advantages of the opportunity and the impactful vision of the organization.' },
  { n: 3, title: 'Saturate the Market', tag: '#onthehunt', body: 'Our team engages with candidates across your region, uncovering and vetting passive talent while ensuring a diverse and inclusive candidate line up.' },
  { n: 4, title: 'Candidate Submittal', tag: '#startinglineup', body: 'After thoroughly vetting our candidates, we provide a debrief that includes a bio, LinkedIn profile, and a detailed resume.' },
  { n: 5, title: 'Sync Up Meeting', tag: '#stateoftheunion', body: 'Consult on candidate pipeline, providing additional market feedback including salary and bonus trends. Redirect search where needed and begin the interview process.' },
  { n: 6, title: 'Interviews & Debriefs', tag: '#checkyourcalendar', body: 'Relax, we got this! We coordinate the interview and ensure our candidates come to the meeting prepared. We conduct a post-interview debrief, providing valuable feedback to both parties.' },
  { n: 7, title: 'Negotiate the Offer', tag: '#letsmakeadeal', body: 'Expertise can make or break a deal. We understand the nuances of the offer stage, from sign on bonuses to counter offers, we build the rapport needed to navigate the difficult negotiations.' },
  { n: 8, title: 'Pop the Champagne!', tag: '#bringonthebubbly', body: 'Time to celebrate. From reference checks to onboarding, we are here to ensure a smooth hiring process!' },
];

async function run() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  const content = JSON.stringify({ blocks: buildBlocks(), version: '1.0' });
  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'why-la'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Why LA', published: true }).where(eq(posts.id, existing.id));
    console.log(`Why LA updated: ID ${existing.id}`);
  } else {
    const [p] = await db.insert(posts).values({
      title: 'Why LA', slug: 'why-la', postType: 'page', content, published: true, websiteId,
      seoTitle: 'Why LA | London Approach',
      seoDescription: 'Our proven 8-step approach to delivering high-impact talent.',
    }).returning();
    console.log(`Why LA created: ID ${p.id}`);
  }
  process.exit(0);
}

function buildBlocks() {
  const FONT = 'Montserrat, sans-serif';
  return [
    {
      type: 'section', id: 'wla-hero', order: 1,
      backgroundColor: '#124334',
      paddingTop: '120px', paddingBottom: '120px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        { type: 'text', id: 'wla-hero-eyebrow', order: 1, content: 'OUR APPROACH',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'heading', id: 'wla-hero-title', order: 2, level: 1 as const,
          content: 'Why LA',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4.5rem', fontWeight: '700', lineHeight: '1.05', color: '#ffffff', textTransform: 'uppercase' as const, letterSpacing: '-0.01em', margin: '0 0 24px 0', textAlign: 'center' as const } },
        { type: 'text', id: 'wla-hero-sub', order: 3, content: 'Our proven 8-step approach to finding the right hire.',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.25rem', fontFamily: FONT, lineHeight: '1.5', margin: '0 auto', maxWidth: '620px', textAlign: 'center' as const } },
      ],
    },
    {
      type: 'section', id: 'wla-timeline-section', order: 2,
      backgroundColor: '#ffffff',
      paddingTop: '112px', paddingBottom: '112px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1080px',
      blocks: [
        {
          type: 'timeline',
          id: 'wla-timeline',
          order: 1,
          overline: 'The Process',
          title: 'Our 8-Step Search Method',
          subtitle: 'A structured, consultative approach that puts your hiring needs at the center.',
          layout: 'alternating' as const,
          lineColor: 'rgba(18,67,52,0.25)',
          numberColor: 'rgba(18,67,52,0.1)',
          nodeColor: '#124334',
          steps: STEPS.map(s => ({
            id: `s${s.n}`,
            title: s.title,
            description: `${s.tag}\n\n${s.body}`,
            number: String(s.n).padStart(2, '0'),
          })),
          elementStyles: {
            overline: { color: '#124334', fontFamily: FONT, letterSpacing: '0.3em', textTransform: 'uppercase' as const },
            title: { fontFamily: FONT, color: '#0c0e13', fontWeight: '700' },
            subtitle: { color: '#0c0e13', fontFamily: FONT, opacity: '0.7' },
            stepTitle: { fontFamily: FONT, color: '#0c0e13', fontWeight: '700' },
            stepDescription: { color: '#0c0e13', fontFamily: FONT, opacity: '0.75' },
          },
        },
      ],
    },
    {
      type: 'site-footer', id: 'wla-footer', order: 3,
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
