import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });

// Warm accent color — used sparingly across hero, dividers, marquee, CTAs
const ACCENT = '#E8A87C';
const ACCENT_DEEP = '#D48B5C';

// Subtle SVG pattern (diagonal lines) on dark green — data URI
const DIAGONAL_LINES = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><path d='M-10,10 l20,-20 M0,40 l40,-40 M30,50 l20,-20' stroke='rgba(255,255,255,0.05)' stroke-width='1'/></svg>")`;
const DOT_GRID = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='1' cy='1' r='1' fill='rgba(255,255,255,0.07)'/></svg>")`;

async function importHome() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'ids.json'), 'utf-8'));
  const websiteId = ids.websiteId;

  if (!websiteId) { console.error('No websiteId'); process.exit(1); }

  const content = JSON.stringify({ blocks: buildBlocks(), version: '1.0' });
  const seoTitle = 'London Approach | Professional Search Firm';
  const seoDescription = 'Temporary Staffing Solutions, Direct-Hire Search, and Passive Candidate Recruitment. Women-owned professional search firm based in Conshohocken, PA with offices in Tampa, FL.';

  const [existing] = await db.select().from(posts).where(and(eq(posts.slug, 'home'), eq(posts.websiteId, websiteId))).limit(1);
  if (existing) {
    await db.update(posts).set({ content, title: 'Home', published: true, seoTitle, seoDescription }).where(eq(posts.id, existing.id));
    console.log(`Home page updated: ID ${existing.id}`);
  } else {
    const [page] = await db.insert(posts).values({
      title: 'Home', slug: 'home', postType: 'page', content, published: true, websiteId,
      seoTitle, seoDescription,
    }).returning();
    console.log(`Home page created: ID ${page.id}`);
  }
  process.exit(0);
}

function buildBlocks() {
  const FONT = 'Montserrat, sans-serif';

  // Gradient fade divider block builder
  const fadeDivider = (id: string, order: number) => ({
    type: 'text', id, order,
    content: `<div style="width:120px;height:2px;margin:0 auto;background:linear-gradient(to right,transparent,${ACCENT},transparent)"></div>`,
    style: { margin: '0 auto', textAlign: 'center' as const },
  });

  return [
    // ── HERO ────────────────────────────────────────────────────────────────
    {
      type: 'hero-slideshow',
      id: 'home-hero',
      order: 1,
      autoplay: true,
      interval: 8000,
      kenBurns: true,
      height: '96vh',
      backgroundVideo: 'https://d3r1qy772m5kxh.cloudfront.net/video/home.mp4',
      backgroundVideoOpacity: 0.8,
      showDots: false,
      showArrows: false,
      stats: [
        { id: 'h1', value: 'Since 2012', label: 'Women-Owned' },
        { id: 'h2', value: '6 Verticals', label: '21 Recruiters' },
        { id: 'h3', value: 'PA + FL', label: 'North America' },
      ],
      slides: [
        {
          id: 'home-hero-slide-1',
          title: '<em style="font-style:italic;font-weight:300;font-family:Georgia,serif;letter-spacing:-0.02em;color:' + ACCENT + '">Modern</em> Staffing<br/><em style="font-style:italic;font-weight:300;font-family:Georgia,serif;letter-spacing:-0.02em">Solutions</em>',
          subtitle: 'Professional Search Firm',
          description: '',
          ctaText: 'Our Services',
          ctaLink: '/services',
          secondaryCtaText: 'Reach Out',
          secondaryCtaLink: '/reach-out',
          overlayColor: '#0c0e13',
          overlayOpacity: 0.55,
          textAlignment: 'left' as const,
        },
      ],
      style: { color: '#ffffff' },
      elementStyles: {
        subtitle: { color: ACCENT, fontSize: '0.75rem', letterSpacing: '0.4em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', margin: '0 0 24px 0', opacity: '1' },
        title: { fontFamily: FONT, fontSize: '5rem', fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.02', color: '#ffffff', textTransform: 'none' as const, margin: '0 0 40px 0' },
        cta: { backgroundColor: ACCENT, color: '#0d2f24', fontWeight: '700', fontSize: '0.8125rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, padding: '20px 44px', borderRadius: '0px', fontFamily: FONT },
        secondaryCta: { color: '#ffffff', fontSize: '0.8125rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, fontFamily: FONT, fontWeight: '600', backgroundColor: 'transparent', padding: '20px 44px', borderRadius: '0px', customCSS: 'border: 1px solid rgba(255,255,255,0.5)' },
        statsBar: { customCSS: `background: linear-gradient(to top, rgba(13,47,36,0.85), transparent); border-top: 1px solid rgba(232,168,124,0.2)` },
        statValue: { color: ACCENT, fontFamily: FONT, fontSize: '1rem', fontWeight: '700', letterSpacing: '0.15em', textTransform: 'uppercase' as const },
        statLabel: { color: 'rgba(255,255,255,0.7)', fontFamily: FONT, fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase' as const, marginTop: '4px' },
      },
    },

    // ── SCROLL INDICATOR + DIVIDER ──────────────────────────────────────────
    {
      type: 'section', id: 'hero-scroll-flow', order: 2,
      backgroundColor: '#0d2f24',
      paddingTop: '24px', paddingBottom: '24px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        { type: 'text', id: 'scroll-ind', order: 1,
          content: `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;color:${ACCENT};font-family:Montserrat,sans-serif;font-size:0.625rem;letter-spacing:0.35em;text-transform:uppercase;font-weight:600"><span>Scroll</span><div style="width:1px;height:40px;background:linear-gradient(to bottom,${ACCENT},transparent)"></div></div>`,
          style: { textAlign: 'center' as const, margin: '0 auto' } },
      ],
    },

    // ── INTRO ───────────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-intro',
      order: 3,
      backgroundColor: '#0d2f24',
      color: '#ffffff',
      paddingTop: '100px',
      paddingBottom: '100px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      style: {
        customCSS: `background-image: radial-gradient(ellipse at 20% 0%, rgba(232,168,124,0.09) 0%, transparent 55%), radial-gradient(ellipse at 85% 100%, rgba(255,255,255,0.04) 0%, transparent 55%), ${DOT_GRID}`,
      },
      blocks: [
        {
          type: 'columns', id: 'intro-cols', order: 1, gap: 'lg' as const, stackOnMobile: true,
          columns: [
            { id: 'intro-left', width: '55%', verticalAlign: 'center' as const, blocks: [
              { type: 'text', id: 'intro-eyebrow', order: 1,
                content: `<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-right:14px"></span>LONDON APPROACH`,
                style: { color: ACCENT, fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 24px 0', fontWeight: '600', fontFamily: FONT } },
              { type: 'heading', id: 'intro-h', order: 2, level: 2 as const,
                content: 'High-impact talent for top organizations across North America.',
                style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#ffffff', lineHeight: '1.15', margin: '0 0 32px 0', textTransform: 'none' as const } },
              { type: 'text', id: 'intro-body', order: 3,
                content: 'From a start-up to a Fortune 100, we are proud to partner with the most innovative clients, transforming their businesses while providing valuable insight to current market trends.',
                style: { color: 'rgba(255,255,255,0.85)', fontSize: '1.0625rem', lineHeight: '1.65', maxWidth: '560px', margin: '0 0 40px 0', fontFamily: FONT } },
              { type: 'stats', id: 'intro-stats', order: 4, columns: 3 as const,
                elementStyles: {
                  statValue: { color: ACCENT, fontFamily: FONT, fontSize: '2.5rem', fontWeight: '700', letterSpacing: '-0.01em', textAlign: 'left' as const },
                  statLabel: { color: 'rgba(255,255,255,0.72)', fontFamily: FONT, fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' as const, marginTop: '6px', textAlign: 'left' as const },
                },
                stats: [
                  { id: 'is1', value: '6', label: 'Industry Verticals' },
                  { id: 'is2', value: '21', label: 'Recruiters on Team' },
                  { id: 'is3', value: '2', label: 'U.S. Markets' },
                ],
                style: { margin: '0 0 40px 0' },
              },
              { type: 'button', id: 'intro-cta', order: 5, text: 'Our Services', url: '/services',
                variant: 'primary' as const, alignment: 'left' as const, size: 'lg' as const, icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const },
            ]},
            { id: 'intro-right', width: '45%', verticalAlign: 'center' as const, blocks: [
              { type: 'image', id: 'intro-img', order: 1,
                url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/1.jpg',
                alt: 'London Approach team',
                style: { width: '100%', customCSS: `object-fit: cover; aspect-ratio: 4/5; display: block; box-shadow: -20px 20px 0 ${ACCENT}` } },
            ]},
          ],
        },
      ],
    },

    // ── MARQUEE STRIP ──────────────────────────────────────────────────────
    {
      type: 'marquee',
      id: 'home-marquee',
      order: 4,
      speed: 60,
      gap: '48px',
      pauseOnHover: true,
      autoFill: true,
      style: {
        backgroundColor: ACCENT,
        color: '#0d2f24',
        padding: '22px 0',
        customCSS: `border-top: 1px solid ${ACCENT_DEEP}; border-bottom: 1px solid ${ACCENT_DEEP}`,
      },
      items: [
        { id: 'm1', type: 'text' as const, content: 'START-UPS' },
        { id: 'm1b', type: 'text' as const, content: '•' },
        { id: 'm2', type: 'text' as const, content: 'FORTUNE 100' },
        { id: 'm2b', type: 'text' as const, content: '•' },
        { id: 'm3', type: 'text' as const, content: 'WOMEN-OWNED' },
        { id: 'm3b', type: 'text' as const, content: '•' },
        { id: 'm4', type: 'text' as const, content: 'NORTH AMERICA' },
        { id: 'm4b', type: 'text' as const, content: '•' },
        { id: 'm5', type: 'text' as const, content: 'SINCE 2012' },
        { id: 'm5b', type: 'text' as const, content: '•' },
        { id: 'm6', type: 'text' as const, content: 'RETAINED SEARCH' },
        { id: 'm6b', type: 'text' as const, content: '•' },
        { id: 'm7', type: 'text' as const, content: 'DIRECT HIRE' },
        { id: 'm7b', type: 'text' as const, content: '•' },
      ],
      elementStyles: {
        item: { fontFamily: FONT, fontSize: '0.9375rem', fontWeight: '700', letterSpacing: '0.25em', textTransform: 'uppercase' as const, color: '#0d2f24' },
      },
    },

    // ── INDUSTRIES ─────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-industries',
      order: 5,
      backgroundColor: '#ffffff',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        { type: 'text', id: 'ind-eyebrow', order: 1,
          content: `<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-right:14px"></span>OUR EXPERTISE<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-left:14px"></span>`,
          alignment: 'center' as const,
          style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 20px 0', fontWeight: '600', fontFamily: FONT, textAlign: 'center' as const } },
        { type: 'heading', id: 'ind-h', order: 2, level: 2 as const,
          content: 'Industries we serve',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '2.75rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.15', margin: '0 0 24px 0', textTransform: 'none' as const } },
        { type: 'text', id: 'ind-sub', order: 3,
          content: 'Results-driven staffing across the industries that power modern business.',
          alignment: 'center' as const,
          style: { color: 'rgba(12,14,19,0.65)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 64px auto', maxWidth: '620px', fontFamily: FONT } },
        { type: 'card-grid', id: 'ind-cards', order: 4, columns: 3 as const,
          elementStyles: {
            cardIcon: { color: ACCENT, fontSize: '2.5rem' },
            cardTitle: { fontFamily: FONT, fontSize: '1.25rem', fontWeight: '700', color: '#0c0e13', margin: '16px 0 12px 0' },
            cardDescription: { fontFamily: FONT, fontSize: '0.9375rem', lineHeight: '1.6', color: 'rgba(12,14,19,0.7)' },
            cardLink: { color: '#124334', fontWeight: '600', letterSpacing: '0.15em', textTransform: 'uppercase' as const, fontSize: '0.75rem', fontFamily: FONT },
            card: { backgroundColor: '#F9FAFA', borderRadius: '0px', padding: '40px 32px', border: '1px solid #E4E9E9', customCSS: `border-top: 3px solid ${ACCENT}` },
          },
          cards: [
          { id: 'i1', title: 'Information Technology', description: "What's your tech stack? From implementation projects to a Director of IT, we show you the hidden talent the market has to offer.", icon: 'memory', link: '/services' },
          { id: 'i2', title: 'Accounting & Finance', description: 'From Senior Accountants to VPs of Finance, we source passive candidates and vet them for culture and technical fit.', icon: 'account_balance', link: '/services' },
          { id: 'i3', title: 'Human Resources', description: 'Top-tier HR talent across Talent Acquisition, DEI, and HR Leadership — passive talent that ensures your success as you grow.', icon: 'groups', link: '/services' },
          { id: 'i4', title: 'Engineering & Supply Chain', description: 'Staff augmentation and direct hire across mid-size engineering firms to big pharma — from VPs to technical PMs.', icon: 'precision_manufacturing', link: '/services' },
          { id: 'i5', title: 'Administration', description: 'Administrative support that keeps your organization running — from Executive Assistants to Chief of Staff.', icon: 'business_center', link: '/services' },
          { id: 'i6', title: 'Construction & Real Estate', description: 'Niche focus in Commercial Construction and Real Estate — project management, engineering, and asset management talent.', icon: 'domain', link: '/services' },
        ] },
      ],
    },

    // ── GALLERY COLLAGE ────────────────────────────────────────────────────
    {
      type: 'section', id: 'home-gallery', order: 6,
      backgroundColor: '#F0F4F4',
      paddingTop: '100px', paddingBottom: '100px', paddingLeft: '24px', paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        { type: 'text', id: 'gal-eyebrow', order: 1,
          content: `<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-right:14px"></span>LIFE AT LONDON APPROACH<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-left:14px"></span>`,
          alignment: 'center' as const,
          style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 20px 0', fontWeight: '600', fontFamily: FONT, textAlign: 'center' as const } },
        { type: 'heading', id: 'gal-h', order: 2, level: 2 as const,
          content: 'People first. Always.',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '2.5rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.15', margin: '0 0 56px 0', textTransform: 'none' as const } },
        { type: 'gallery', id: 'gal-grid', order: 3, layout: 'grid' as const, columns: 3 as const, gap: 'md' as const, lightbox: true,
          images: [
            { id: 'g1', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/2.jpg', alt: 'Team moment' },
            { id: 'g2', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/3.jpg', alt: 'Team moment' },
            { id: 'g3', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/4.jpg', alt: 'Team moment' },
            { id: 'g4', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/5.jpg', alt: 'Team moment' },
            { id: 'g5', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/6.jpg', alt: 'Team moment' },
            { id: 'g6', url: 'https://d3r1qy772m5kxh.cloudfront.net/images/why-la-gallery/7.jpg', alt: 'Team moment' },
          ] },
      ],
    },

    // ── PROCESS (dark green + textured + watermark numeral) ────────────────
    {
      type: 'section',
      id: 'home-process',
      order: 7,
      backgroundColor: '#0d2f24',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      style: {
        position: 'relative' as const,
        overflow: 'hidden' as const,
        customCSS: `background-image: radial-gradient(ellipse at 80% 20%, rgba(232,168,124,0.1) 0%, transparent 55%), radial-gradient(ellipse at 10% 90%, rgba(255,255,255,0.05) 0%, transparent 50%), ${DIAGONAL_LINES}`,
      },
      blocks: [
        // Decorative watermark
        { type: 'text', id: 'proc-watermark', order: 0,
          content: `<div aria-hidden="true" style="position:absolute;top:20px;right:40px;font-family:Georgia,serif;font-style:italic;font-size:22rem;font-weight:700;color:rgba(255,255,255,0.04);line-height:0.8;pointer-events:none;letter-spacing:-0.05em">01</div>`,
          style: { margin: '0' } },
        { type: 'text', id: 'proc-eyebrow', order: 1,
          content: `<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-right:14px"></span>OUR PROVEN PROCESS<span style="display:inline-block;width:32px;height:1px;background:${ACCENT};vertical-align:middle;margin-left:14px"></span>`,
          alignment: 'center' as const,
          style: { color: ACCENT, fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 20px 0', fontWeight: '600', fontFamily: FONT, textAlign: 'center' as const } },
        { type: 'heading', id: 'proc-h', order: 2, level: 2 as const,
          content: 'Eight steps to the right hire.',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '3rem', fontWeight: '700', color: '#ffffff', lineHeight: '1.1', margin: '0 0 24px 0', textTransform: 'none' as const } },
        { type: 'text', id: 'proc-sub', order: 3,
          content: 'A consultative approach built on deep market knowledge, candidate vetting, and negotiation expertise.',
          alignment: 'center' as const,
          style: { color: 'rgba(255,255,255,0.75)', fontSize: '1.0625rem', lineHeight: '1.65', margin: '0 auto 72px auto', maxWidth: '640px', fontFamily: FONT } },
        { type: 'stats', id: 'proc-stats', order: 4, columns: 4 as const,
          elementStyles: {
            statValue: { color: ACCENT, fontFamily: 'Georgia, serif', fontSize: '4rem', fontWeight: '700', letterSpacing: '-0.02em', fontStyle: 'italic' as any },
            statLabel: { color: 'rgba(255,255,255,0.78)', fontFamily: FONT, fontSize: '0.9375rem', lineHeight: '1.5', marginTop: '12px' },
          },
          stats: [
            { id: 's1', value: '01', label: 'Intake Meeting — game plan & market conditions' },
            { id: 's2', value: '02', label: 'Search Strategy — career-advantage branding' },
            { id: 's3', value: '04', label: 'Candidate Submittal — bio, resume, vetting' },
            { id: 's4', value: '08', label: 'Pop the Champagne — smooth onboarding' },
          ] },
        { type: 'button', id: 'proc-cta', order: 5, text: 'See the full process', url: '/why-la',
          variant: 'primary' as const, alignment: 'center' as const, size: 'lg' as const, icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const,
          style: { margin: '64px 0 0 0' } },
      ],
    },

    // ── FOUNDERS ───────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-founders',
      order: 8,
      backgroundColor: '#ffffff',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      blocks: [
        fadeDivider('fnd-divider', 0),
        { type: 'text', id: 'fnd-eyebrow', order: 1, content: 'WOMEN-OWNED & LED',
          alignment: 'center' as const,
          style: { color: ACCENT_DEEP, fontSize: '0.75rem', letterSpacing: '0.35em', textTransform: 'uppercase' as const, margin: '32px 0 20px 0', fontWeight: '700', fontFamily: FONT } },
        { type: 'heading', id: 'fnd-h', order: 2, level: 2 as const,
          content: 'Meet our <em style="font-style:italic;font-family:Georgia,serif;color:' + ACCENT_DEEP + '">founders</em>',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '3rem', fontWeight: '700', color: '#0c0e13', lineHeight: '1.1', margin: '0 0 72px 0', textTransform: 'none' as const } },
        {
          type: 'columns', id: 'fnd-cols', order: 3, gap: 'lg' as const, stackOnMobile: true,
          columns: [
            { id: 'fnd-1', width: '50%', verticalAlign: 'top' as const, blocks: [
              { type: 'image', id: 'fnd-1-img', order: 1,
                url: 'https://d1wkqvy9x5wra7.cloudfront.net/media/profile_images/Em_Headshot_ryswDTP.jpg',
                alt: 'Emily Zagar',
                style: { width: '100%', margin: '0 auto 28px auto', maxWidth: '420px', customCSS: 'aspect-ratio: 4/5; object-fit: cover; display: block' } },
              { type: 'text', id: 'fnd-1-role', order: 2, content: 'FOUNDER & MANAGING PARTNER',
                alignment: 'center' as const,
                style: { color: ACCENT_DEEP, fontSize: '0.6875rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 8px 0', fontWeight: '700', fontFamily: FONT, textAlign: 'center' as const } },
              { type: 'heading', id: 'fnd-1-name', order: 3, level: 3 as const, content: 'Emily Zagar',
                alignment: 'center' as const,
                style: { fontFamily: FONT, fontSize: '1.75rem', fontWeight: '700', color: '#0c0e13', margin: '0', textTransform: 'none' as const, textAlign: 'center' as const } },
            ]},
            { id: 'fnd-2', width: '50%', verticalAlign: 'top' as const, blocks: [
              { type: 'image', id: 'fnd-2-img', order: 1,
                url: 'https://d1wkqvy9x5wra7.cloudfront.net/media/profile_images/Keli_Headshots.jpg',
                alt: 'Keli Price',
                style: { width: '100%', margin: '0 auto 28px auto', maxWidth: '420px', customCSS: 'aspect-ratio: 4/5; object-fit: cover; display: block' } },
              { type: 'text', id: 'fnd-2-role', order: 2, content: 'FOUNDER & MANAGING PARTNER',
                alignment: 'center' as const,
                style: { color: ACCENT_DEEP, fontSize: '0.6875rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 8px 0', fontWeight: '700', fontFamily: FONT, textAlign: 'center' as const } },
              { type: 'heading', id: 'fnd-2-name', order: 3, level: 3 as const, content: 'Keli Price',
                alignment: 'center' as const,
                style: { fontFamily: FONT, fontSize: '1.75rem', fontWeight: '700', color: '#0c0e13', margin: '0', textTransform: 'none' as const, textAlign: 'center' as const } },
            ]},
          ],
        },
        { type: 'button', id: 'fnd-cta', order: 4, text: 'Meet the full team', url: '/meet-the-team',
          variant: 'primary' as const, alignment: 'center' as const, icon: 'arrow_forward', iconPosition: 'right' as const, size: 'lg' as const, hoverEffect: 'lift' as const,
          style: { margin: '72px 0 0 0' } },
      ],
    },

    // ── TESTIMONIAL ────────────────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-testimonial',
      order: 9,
      backgroundColor: '#F0F4F4',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '920px',
      blocks: [
        { type: 'text', id: 'tst-quote-mark', order: 0,
          content: `<div style="font-family:Georgia,serif;font-style:italic;font-size:8rem;line-height:0.8;color:${ACCENT};text-align:center;margin-bottom:-30px;opacity:0.6">&ldquo;</div>`,
          style: { textAlign: 'center' as const } },
        { type: 'text', id: 'tst-eyebrow', order: 1, content: 'CLIENT REVIEWS',
          alignment: 'center' as const,
          style: { color: '#124334', fontSize: '0.75rem', letterSpacing: '0.3em', textTransform: 'uppercase' as const, margin: '0 0 32px 0', fontWeight: '600', fontFamily: FONT } },
        { type: 'testimonial', id: 'tst-1', order: 2,
          quote: 'London Approach is our go-to agency! They have helped us place many positions across our organization for the last 4.5 years — from temp to direct hire. They are responsive, professional, friendly, and send qualified candidates whenever we have a need. I would highly recommend London Approach for anyone searching for the perfect candidate and a great working relationship.',
          author: 'Lindsey C.',
          role: 'Client',
          style: { fontFamily: FONT },
          elementStyles: {
            quote: { fontFamily: 'Georgia, serif', fontSize: '1.75rem', lineHeight: '1.5', color: '#0c0e13', fontWeight: '400', textAlign: 'center' as const, fontStyle: 'italic' as any },
            author: { color: ACCENT_DEEP, fontWeight: '700', letterSpacing: '0.15em', textTransform: 'uppercase' as const, fontFamily: FONT, fontSize: '0.875rem' },
            role: { color: 'rgba(12,14,19,0.55)', fontSize: '0.8125rem', fontFamily: FONT },
          } },
        { type: 'button', id: 'tst-cta', order: 3, text: 'Read more testimonials', url: '/testimonials',
          variant: 'secondary' as const, alignment: 'center' as const, size: 'lg' as const, icon: 'arrow_forward', iconPosition: 'right' as const, hoverEffect: 'lift' as const,
          style: { margin: '48px 0 0 0' } },
      ],
    },

    // ── FOOTER CTA — dramatic ──────────────────────────────────────────────
    {
      type: 'section',
      id: 'home-footer-cta',
      order: 10,
      backgroundColor: '#0d2f24',
      paddingTop: '140px',
      paddingBottom: '140px',
      paddingLeft: '24px',
      paddingRight: '24px',
      maxWidth: '1280px',
      style: {
        customCSS: `background-image: radial-gradient(ellipse at center, rgba(232,168,124,0.18) 0%, transparent 55%), ${DIAGONAL_LINES}`,
      },
      blocks: [
        { type: 'text', id: 'fcta-divider', order: 1,
          content: `<div style="width:140px;height:2px;margin:0 auto 40px auto;background:linear-gradient(to right,transparent,${ACCENT},transparent)"></div>`,
          style: { textAlign: 'center' as const } },
        { type: 'text', id: 'fcta-eyebrow', order: 2, content: 'LET\u2019S BUILD YOUR TEAM',
          alignment: 'center' as const,
          style: { color: ACCENT, fontSize: '0.75rem', letterSpacing: '0.4em', textTransform: 'uppercase' as const, margin: '0 0 24px 0', fontWeight: '700', fontFamily: FONT } },
        { type: 'heading', id: 'fcta-h', order: 3, level: 2 as const,
          content: 'Ready to hire <em style="font-style:italic;font-family:Georgia,serif;color:' + ACCENT + ';font-weight:400">top talent</em>?',
          alignment: 'center' as const,
          style: { fontFamily: FONT, fontSize: '4rem', fontWeight: '700', color: '#ffffff', lineHeight: '1.05', margin: '0 0 56px 0', textTransform: 'none' as const } },
        { type: 'button', id: 'fcta-btn', order: 4, text: 'Reach Out', url: '/reach-out',
          variant: 'primary' as const, alignment: 'center' as const, icon: 'arrow_forward', iconPosition: 'right' as const, size: 'lg' as const, hoverEffect: 'lift' as const,
          style: { customCSS: `transform: scale(1.15)` } },
      ],
    },

    // ── SITE FOOTER ─────────────────────────────────────────────────────────
    {
      type: 'site-footer', id: 'home-footer', order: 11,
      tagline: 'Modern Staffing Solutions. Women-owned & women-led.',
      backgroundColor: '#0d2f24',
      textColor: '#ffffff',
      accentColor: ACCENT,
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

importHome().catch(err => { console.error(err); process.exit(1); });
