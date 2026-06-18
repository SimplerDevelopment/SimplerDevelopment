/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env' });

import {
  BRAND, GLASS_BTN_STYLE, resetOrder, section, heading, text, overline,
  spacer, button, cardGrid, stats, accordion, upsertPost,
} from './_brand';

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  resetOrder();

  const blocks: any[] = [];

  // 1 ── HERO (dark navy gradient) ─────────────────────────────────────
  blocks.push({
    id: 'hero',
    type: 'hero',
    order: 1,
    subtitle: 'Our Story',
    title: 'Patients, not paperwork. We chose to start at the bedside.',
    description: 'The care signal is strongest at the bedside. Everything captured there drives documentation, billing, compliance, and outcomes. Everything documented later is a reconstruction. We built Scribble to close that gap.',
    ctaText: 'Book a Demo',
    ctaLink: BRAND.demoUrl,
    style: {
      backgroundColor: BRAND.navy,
      customCSS: `background: linear-gradient(160deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%);`,
      minHeight: '520px',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    elementStyles: {
      subtitle: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: '700', fontSize: '0.8rem', fontFamily: 'Plus Jakarta Sans' },
      title: { color: BRAND.white, fontFamily: 'Plus Jakarta Sans', fontSize: '3rem', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-0.025em' },
      description: { color: BRAND.bodyLight, fontFamily: 'Plus Jakarta Sans', fontSize: '1.1rem', lineHeight: '1.65', customCSS: 'max-width: 640px;' },
    },
  });

  // 2 ── WHY HOME HEALTH (light off-white) ─────────────────────────────
  blocks.push(section('why-hh', { bg: BRAND.offWhite, maxWidth: '800px' }, [
    overline('why-hh-ov', 'Why Home Health'),
    heading('why-hh-h', 'The hardest clinical environment in healthcare. The most overlooked.', 2),
    text('why-hh-body',
      'Home health clinicians drive from patient to patient, adapt to every home setting, and carry the full complexity of post-acute care without the administrative support that hospital clinicians take for granted. They are also responsible for one of the most consequential documents in Medicare: the OASIS. Get it right at the bedside, and everything downstream: reimbursement, compliance, care planning. Get it wrong, or get it late, and the cost compounds across every episode.',
      { align: 'center' }),
  ]));

  // 3 ── FOUNDER (white) — team-showcase with real photo ──────────────
  blocks.push(section('founder', { bg: BRAND.white, maxWidth: '1080px', py: '0px' }, [
    {
      id: 'founder-showcase',
      type: 'team-showcase',
      order: 0,
      overline: 'The Founder',
      bioPanelColor: BRAND.white,
      accentColor: BRAND.teal,
      members: [
        {
          id: 'sandeep',
          name: 'Sandeep',
          title: 'Founder & CEO',
          photo: 'https://goscribble.ai/photo-sandeep.jpeg',
          bio: 'Seeing his wife, a physician at the VA, spend evenings charting after full days of patient care, Sandeep realized it was time for change. The clinical work was done. The documentation was just beginning. He couldn\'t stop thinking about that gap.\n\nHe brought that obsession to home health. As founder and CEO of Acutedge, he had spent years delivering multi-million dollar technology initiatives for health and human services organizations, close enough to the problem to understand it and far enough outside it to see what was possible.',
          specialties: ['"Our caregivers deserve better. They shouldn\'t have to choose between their families and their patients."'],
        },
      ],
      elementStyles: {
        overline: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: '700', fontSize: '0.75rem', fontFamily: 'Plus Jakarta Sans', marginBottom: '14px' },
        memberName: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontWeight: '800', letterSpacing: '-0.02em' },
        memberTitle: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' },
        memberBio: { color: BRAND.body, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.65', fontSize: '1rem', whiteSpace: 'pre-line' },
        specialtyTag: { backgroundColor: BRAND.tealLight, color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontStyle: 'italic', fontWeight: '600', fontSize: '0.9rem' },
      },
    },
  ]));

  // 4 ── THE TEAM (light off-white) with team stats ────────────────────
  blocks.push(section('team', { bg: BRAND.offWhite }, [
    overline('team-ov', 'The Team'),
    heading('team-h', 'Brilliant minds. Deep roots. One mission.', 2),
    text('team-sub',
      'The people building Scribble bring decades of combined experience in healthcare technology, clinical operations, and AI. Engineers who have built at scale. Operators who have run agencies. Clinicians who have done the documentation themselves.'),
    text('team-sub2',
      'Every person on the team stays close to the agencies and clinicians using the product. What we hear in the field shapes what we build next.'),
    spacer('team-sp', 'sm'),
    stats('team-stats', [
      { id: 'ts1', value: '2025', label: 'Founded — home health focused from day one' },
      { id: 'ts2', value: '12', label: 'States active and growing' },
      { id: 'ts3', value: '50+', label: 'Years combined healthcare expertise on the team' },
      { id: 'ts4', value: '45 min', label: 'Saved per SOC visit' },
    ], { columns: 4 }),
  ]));

  // 5a ── INVESTORS (white) — logo images ──────────────────────────────
  blocks.push(section('investors', { bg: BRAND.white }, [
    overline('inv-ov', 'Backed By'),
    heading('inv-h', 'Investors and advisors who understand healthcare.', 2),
    text('inv-sub',
      'Scribble is backed by institutional investors and advised by operators and clinicians with deep roots in home health and post-acute care.'),
    spacer('inv-sp', 'sm'),
    // Investor logos — side-by-side columns layout
    {
      id: 'inv-logos',
      type: 'columns',
      order: 0,
      gap: 'lg',
      stackOnMobile: true,
      columns: [
        {
          id: 'inv-col-bf',
          width: 50,
          verticalAlign: 'top',
          blocks: [
            {
              id: 'inv-logo-bf',
              type: 'image',
              order: 1,
              url: 'https://goscribble.ai/logo-benfranklin.png',
              alt: 'Ben Franklin Technology Partners',
              width: 'medium',
              alignment: 'center',
            },
            {
              id: 'inv-bf-title',
              type: 'heading',
              order: 2,
              content: 'Ben Franklin Technology Partners',
              level: 3,
              alignment: 'center',
              style: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', fontSize: '1.1rem', marginTop: '16px', marginBottom: '8px' },
            },
            {
              id: 'inv-bf-desc',
              type: 'text',
              order: 3,
              content: "Pennsylvania's leading technology investment program, with a 40-year track record backing high-growth companies in life sciences and health technology.",
              alignment: 'center',
              size: 'base',
              style: { color: BRAND.body, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.6' },
            },
          ],
        },
        {
          id: 'inv-col-fr',
          width: 50,
          verticalAlign: 'top',
          blocks: [
            {
              id: 'inv-logo-fr',
              type: 'image',
              order: 1,
              url: 'https://goscribble.ai/logo-firstrow.webp',
              alt: 'First Row Partners',
              width: 'medium',
              alignment: 'center',
            },
            {
              id: 'inv-fr-title',
              type: 'heading',
              order: 2,
              content: 'First Row Partners',
              level: 3,
              alignment: 'center',
              style: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', fontSize: '1.1rem', marginTop: '16px', marginBottom: '8px' },
            },
            {
              id: 'inv-fr-desc',
              type: 'text',
              order: 3,
              content: 'Early-stage venture firm backing founders building the next generation of healthcare and technology companies.',
              alignment: 'center',
              size: 'base',
              style: { color: BRAND.body, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.6' },
            },
          ],
        },
      ],
    },
  ]));

  // 5b ── CLINICAL ADVISORS (off-white) — team-showcase with real photos ─
  blocks.push(section('advisors', { bg: BRAND.offWhite, maxWidth: '1080px', py: '0px' }, [
    overline('adv-ov', 'Clinical Advisors'),
    {
      id: 'adv-showcase',
      type: 'team-showcase',
      order: 0,
      bioPanelColor: BRAND.offWhite,
      accentColor: BRAND.teal,
      members: [
        {
          id: 'adam-menzies',
          name: 'Adam Menzies',
          title: 'Clinical Advisor',
          photo: 'https://goscribble.ai/photo-adam.jpeg',
          bio: 'Senior clinical advisor with deep home health and post-acute care expertise. Advises on clinical workflow design and real-world deployment.',
        },
        {
          id: 'joe-brence',
          name: 'Joe Brence',
          title: 'Clinical Advisor',
          photo: 'https://goscribble.ai/photo-joe.png',
          bio: '20+ years in post-acute care. Advises on clinical accuracy, OASIS compliance, and the real-world demands of home health documentation.',
        },
      ],
      elementStyles: {
        memberName: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontWeight: '800', letterSpacing: '-0.02em' },
        memberTitle: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' },
        memberBio: { color: BRAND.body, fontFamily: 'Plus Jakarta Sans', lineHeight: '1.65', fontSize: '1rem' },
      },
    },
  ]));

  // 6 ── PRINCIPLES (light off-white) ──────────────────────────────────
  blocks.push(section('principles', { bg: BRAND.offWhite }, [
    overline('pr-ov', 'What We Believe'),
    heading('pr-h', 'Our principles.', 2),
    spacer('pr-sp', 'sm'),
    cardGrid('pr-cards', [
      {
        id: 'pr1',
        icon: 'hearing',
        title: 'Let the customer tell you where to go',
        description: 'The agencies and clinicians using Scribble know what they need better than anyone. We listen first, build second. Our roadmap is their feedback.',
      },
      {
        id: 'pr2',
        icon: 'verified_user',
        title: 'Compliance is not optional',
        description: "We're in healthcare. HIPAA isn't a checkbox, it's a baseline. Every feature, every integration, every data decision is made with compliance as the starting point.",
      },
      {
        id: 'pr3',
        icon: 'support_agent',
        title: 'Human touch is still our best asset',
        description: "Tech glitches happen when you're moving fast. What doesn't change is that we care. Our team is there for clinicians day or night, whenever they need us. That's something no model can replicate, and we're proud of it.",
      },
      {
        id: 'pr4',
        icon: 'favorite',
        title: 'Patients are why we do anything',
        description: "If a solution doesn't ultimately improve patient care, it's just noise. Every feature, every efficiency, every hour saved by a clinician flows back to the person at home. We don't forget that.",
      },
    ], { columns: 2 }),
  ]));

  // 7 ── COMPLIANCE (dark navy) ─────────────────────────────────────────
  blocks.push(section('compliance', { gradient: true, dark: true }, [
    overline('comp-ov', 'Security & Compliance', { dark: true }),
    heading('comp-h', 'Built with compliance at the core.', 2, { dark: true }),
    spacer('comp-sp', 'sm'),
    cardGrid('comp-cards', [
      {
        id: 'comp1',
        icon: 'gpp_good',
        title: 'HIPAA Compliant',
        description: 'BAA signed with every agency. Full PHI handling protocols in place before any data flows.',
      },
      {
        id: 'comp2',
        icon: 'manage_accounts',
        title: 'Role-Based Access',
        description: 'Granular permissions ensure only authorized personnel access patient data, with full audit logging.',
      },
      {
        id: 'comp3',
        icon: 'lock',
        title: 'AES-256 Encryption',
        description: 'All patient data encrypted in transit and at rest. No audio retained beyond what\'s needed for documentation.',
      },
    ], { columns: 3, dark: true }),
  ]));

  // 8 ── CTA BAND (dark navy gradient) ─────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', "See what we've built.", 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { align: 'center', newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'about',
    title: 'About Us',
    postType: 'page',
    blocks,
    seoTitle: 'About Scribble | Mission, Team & Principles | Point-of-Care AI for Home Health',
    seoDescription: "Learn about Scribble's mission to eliminate documentation burden in home health. Meet our team and discover the principles guiding our work.",
  });

  console.log(`\n=== ABOUT IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
