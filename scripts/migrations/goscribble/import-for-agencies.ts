/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env' });

import {
  BRAND, NAVY_GRADIENT, GLASS_BTN_STYLE, resetOrder, section, heading, text, overline,
  spacer, button, cardGrid, stats, accordion, upsertPost,
} from './_brand';

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  resetOrder();

  const blocks: any[] = [];

  // 1 ── HERO (dark navy gradient) ─────────────────────────────────────────
  blocks.push({
    id: 'fa-hero',
    type: 'hero',
    order: 1,
    subtitle: 'For Agency Administrators and DONs',
    title: "Every hour away from the bedside is data your agency will never get back.",
    description: 'What your clinician observes at the bedside is the most valuable clinical and financial asset your agency has. The further from that moment it gets documented, the more you lose: accuracy, reimbursement, and quality of care.',
    ctaText: 'Book a Demo →',
    ctaLink: BRAND.demoUrl,
    secondaryCtaText: 'See the ROI Math',
    secondaryCtaLink: '#roi',
    style: {
      backgroundColor: BRAND.navy,
      customCSS: NAVY_GRADIENT,
      minHeight: '580px',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    elementStyles: {
      subtitle: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: '700', fontSize: '0.8rem', fontFamily: 'Plus Jakarta Sans' },
      title: { color: BRAND.white, fontFamily: 'Plus Jakarta Sans', fontSize: '3.2rem', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-0.025em', customCSS: 'text-shadow: 0 2px 30px rgba(0,0,0,0.25); max-width: 820px;' },
      description: { color: BRAND.bodyLight, fontFamily: 'Plus Jakarta Sans', fontSize: '1.15rem', lineHeight: '1.6', customCSS: 'max-width: 600px;' },
      secondaryCta: { color: BRAND.white, customCSS: 'background: rgba(255,255,255,0.08); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.25);' },
    },
  });

  // 2 ── STATS BAR (white) ──────────────────────────────────────────────────
  blocks.push(section('fa-stats-bar', { bg: BRAND.white, py: '56px' }, [
    stats('fa-stats-grid', [
      { id: 'fa-s1', value: '45 min', label: 'Saved per SOC visit' },
      { id: 'fa-s2', value: '$4M+', label: 'Annual gain (400-clinician agency)' },
      { id: 'fa-s3', value: '↓ 40%', label: 'QA rework reduction' },
      { id: 'fa-s4', value: '4', label: 'Weeks to go live' },
    ], { columns: 4 }),
  ]));

  // 3 ── PROBLEM (light #F7F9FC) ────────────────────────────────────────────
  blocks.push(section('fa-problem', { bg: BRAND.offWhite }, [
    overline('fa-prob-ov', 'The Real Cost'),
    heading('fa-prob-h', 'The further from the bedside, the more you lose.', 2),
    text('fa-prob-sub', 'Your clinician finishes a visit at 10am. By the time they sit down to chart at 8pm, the nuances are gone. The observation that would have changed a reimbursement tier, the symptom detail that mattered for the care plan, the exact functional score that QA will flag. That gap is costing your agency more than you think.'),
    spacer('fa-prob-sp', 'sm'),
    cardGrid('fa-prob-cards', [
      {
        id: 'fa-p1',
        icon: 'trending_down',
        title: 'Lost reimbursement you earned',
        description: 'OASIS scores documented from memory hours later are systematically lower than what was observed. Inaccurate functional and clinical scores mean lower PDGM payment tiers, on every episode.',
      },
      {
        id: 'fa-p2',
        icon: 'refresh',
        title: 'QA rework that shouldn\'t exist',
        description: 'Most OASIS errors aren\'t carelessness; they\'re recall errors. A clinician who can\'t remember exactly what they observed fills in fields with their best guess. Your QA team fixes it. Or doesn\'t catch it.',
      },
      {
        id: 'fa-p3',
        icon: 'gavel',
        title: 'Compliance risk hiding in plain sight',
        description: 'Every OASIS field that can\'t be traced back to a documented clinical observation is an audit vulnerability. The gap between what happened and what was written is where compliance exposure lives.',
      },
      {
        id: 'fa-p4',
        icon: 'person_off',
        title: 'Clinicians who eventually leave',
        description: 'When your best nurses are charting at 9pm, they\'re not just tired; they\'re telling you something. The agencies losing clinicians to burnout are the ones asking them to carry the visit in their head all day.',
      },
      {
        id: 'fa-p5',
        icon: 'receipt_long',
        title: 'Billing delays you can\'t afford',
        description: 'Incomplete documentation at visit close delays your 485 orders, which delays your billing cycle. Every day of delay is cash you\'ve already earned sitting idle.',
      },
      {
        id: 'fa-p6',
        icon: 'lock',
        title: 'Capacity you can\'t unlock',
        description: 'A clinician spending 3 hours on documentation after visits can\'t take on more patients. That\'s not a staffing problem; it\'s a tools problem. The capacity is there. The time isn\'t.',
      },
    ], { columns: 3 }),
  ]));

  // 4 ── SOLUTION (white) ────────────────────────────────────────────────────
  blocks.push(section('fa-solution', { bg: BRAND.white }, [
    overline('fa-sol-ov', 'The Scribble Solution'),
    heading('fa-sol-h', 'Capture everything at the bedside. Let nothing downstream be a guess.', 2),
    text('fa-sol-sub', 'Scribble listens during the visit and documents in real time. What your clinician observes at 10am is captured at 10am, not reconstructed at 8pm. That\'s the difference between what actually happened and what someone remembered.'),
    spacer('fa-sol-sp', 'sm'),
    cardGrid('fa-sol-cards', [
      {
        id: 'fa-sol1',
        icon: 'mic',
        title: 'Real-time OASIS documentation',
        description: 'Clinicians are done at the visit, not hours later. No dictation, no post-visit catch-up.',
      },
      {
        id: 'fa-sol2',
        icon: 'fact_check',
        title: 'Higher OASIS accuracy',
        description: 'Every field is tied to a conversation moment. Your QA team sees fewer errors from day one.',
      },
      {
        id: 'fa-sol3',
        icon: 'sync_alt',
        title: 'EHR integration included',
        description: 'Documentation pushes directly to your existing system. No new logins, no double entry.',
      },
      {
        id: 'fa-sol4',
        icon: 'account_tree',
        title: 'Downstream accuracy starts here',
        description: 'When documentation is captured at the bedside, every downstream process — billing, coding, QA, care planning — is built on what actually happened, not what someone recalled.',
      },
    ], { columns: 2 }),
  ]));

  // 5 ── CLINICIAN EDGE (dark navy) ─────────────────────────────────────────
  blocks.push(section('fa-edge', { gradient: true, dark: true }, [
    overline('fa-edge-ov', 'Your Competitive Edge', { dark: true }),
    heading('fa-edge-h', 'Your clinicians are not a cost center. They are your agency.', 2, { dark: true }),
    text('fa-edge-sub', 'In home health, your clinicians walk into patients\' homes every day. They are your brand, your quality, and your growth engine. The agencies winning on recruitment, retention, and outcomes are the ones that give their clinicians tools that actually respect their time and expertise.', { dark: true }),
    spacer('fa-edge-sp', 'sm'),
    cardGrid('fa-edge-cards', [
      {
        id: 'fa-e1',
        icon: 'star_rate',
        title: 'Recruit on reputation',
        description: 'Clinicians talk. Agencies known for giving their team the right tools attract better candidates and close offers faster.',
      },
      {
        id: 'fa-e2',
        icon: 'favorite',
        title: 'Retain who you have',
        description: 'Documentation burnout is the leading reason experienced clinicians leave. Solving it is the most direct retention investment you can make.',
      },
      {
        id: 'fa-e3',
        icon: 'trending_up',
        title: 'Grow without adding headcount',
        description: 'When each clinician can see 1–3 more patients per week, your agency grows — without a single new hire on payroll.',
      },
    ], { columns: 3, dark: true }),
  ]));

  // 6 ── ROI SNAPSHOT (light, anchor #roi) — static snapshot of interactive calc ──
  blocks.push(section('fa-roi', { bg: BRAND.offWhite, anchor: 'roi' }, [
    overline('fa-roi-ov', 'Build Your Business Case'),
    heading('fa-roi-h', 'Model the numbers for your board.', 2),
    text('fa-roi-sub', 'Every agency is different. Drag the sliders to model the revenue and capacity Scribble unlocks for your team size — the numbers you can take to your board.'),
    spacer('fa-roi-sp', 'sm'),
    {
      id: 'fa-roi-calc', type: 'roi-calculator', order: 0,
      accentColor: BRAND.teal,
      unitLabel: 'FTE clinicians completing SOC',
      unitDefault: 40, unitMin: 5, unitMax: 500, unitStep: 5,
      minutesLabel: 'Minutes saved per visit', minutesDefault: 45,
      ctaText: 'Get a Custom ROI Model for My Agency', ctaLink: BRAND.demoUrl, ctaNewTab: true,
    },
  ]));

  // 7 ── IMPLEMENTATION (white) ──────────────────────────────────────────────
  blocks.push(section('fa-impl', { bg: BRAND.white }, [
    overline('fa-impl-ov', 'Implementation'),
    heading('fa-impl-h', 'Live in 2–4 weeks. We do the heavy lifting.', 2),
    text('fa-impl-sub', 'We handle EHR integration, clinician training, and configuration. Your team just needs to show up for one onboarding session.'),
    spacer('fa-impl-sp', 'sm'),
    cardGrid('fa-impl-cards', [
      {
        id: 'fa-i1',
        icon: 'phone_in_talk',
        title: 'Discovery Call',
        description: 'We map your EHR setup, documentation workflow, and agency-specific requirements. Usually 60 minutes.',
      },
      {
        id: 'fa-i2',
        icon: 'settings_ethernet',
        title: 'EHR Integration',
        description: 'Our team configures the connection to your EHR system. Most integrations go live in 3–5 business days.',
      },
      {
        id: 'fa-i3',
        icon: 'school',
        title: 'Clinician Onboarding',
        description: 'One 45-minute session per cohort. Most clinicians are proficient by their second visit using Scribble.',
      },
      {
        id: 'fa-i4',
        icon: 'monitor_heart',
        title: 'Go Live & Monitor',
        description: 'Your dedicated implementation manager monitors adoption and accuracy in real time during the first 30 days.',
      },
    ], { columns: 2 }),
  ]));

  // 8 ── TESTIMONIALS (light testimonials-bg = offWhite) ────────────────────
  const testimonialsBlock = (id: string, quote: string, author: string, role: string) => ({
    id, type: 'testimonial', order: 0, quote, author, role,
    style: { backgroundColor: BRAND.white, borderRadius: '16px', padding: '32px', borderWidth: '1px', borderStyle: 'solid', borderColor: BRAND.border, customCSS: 'box-shadow: 0 10px 30px rgba(12,31,63,0.06); height: 100%;', marginBottom: '24px' },
    elementStyles: {
      quote: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontSize: '1.1rem', lineHeight: '1.5', fontWeight: '600' },
      author: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' },
      quoteIcon: { color: BRAND.teal },
    },
  });

  blocks.push(section('fa-testimonials', { bg: BRAND.offWhite }, [
    overline('fa-tst-ov', 'What Agency Leaders Say'),
    heading('fa-tst-h', 'Hear it from Haggai Healthcare.', 2),
    text('fa-tst-sub', 'Brandon Lang, President, and Corbin King, Clinical Director, on what Scribble changed for their agency.'),
    spacer('fa-tst-sp', 'sm'),
    {
      id: 'fa-tst-cols', type: 'columns', order: 0, gap: 'md', stackOnMobile: true,
      columns: [
        {
          id: 'fa-tc-l', width: 50, verticalAlign: 'top', blocks: [
            testimonialsBlock('fa-t1', '"Yes, just getting started. Scribble, they have been great."', 'Brandon Lang', 'President · Haggai Healthcare'),
          ],
        },
        {
          id: 'fa-tc-r', width: 50, verticalAlign: 'top', blocks: [
            testimonialsBlock('fa-t2', '"It\'s a means to really cultivate the atmosphere they are working in."', 'Corbin King', 'Clinical Director · Haggai Healthcare'),
          ],
        },
      ],
    },
  ]));

  // 9 ── FAQ (white) ─────────────────────────────────────────────────────────
  blocks.push(section('fa-faq', { bg: BRAND.white, maxWidth: '860px' }, [
    overline('fa-faq-ov', 'Agency FAQs'),
    heading('fa-faq-h', 'What directors ask before they commit.', 2),
    spacer('fa-faq-sp', 'sm'),
    accordion('fa-faq-acc', undefined, [
      {
        id: 'fa-f1',
        title: 'How long does implementation take?',
        content: 'Most agencies are live within 2–4 weeks. We handle EHR integration, configuration, and clinician onboarding. You\'ll have a dedicated implementation manager from day one through your first 30 days live.',
      },
      {
        id: 'fa-f2',
        title: 'Will clinicians actually use it?',
        content: 'Adoption is typically high because the value is immediate and personal — clinicians get their evenings back from day one. One 45-minute onboarding session is all most clinicians need. We monitor adoption in the first 30 days and address any concerns directly.',
      },
      {
        id: 'fa-f3',
        title: 'How does the EHR integration work?',
        content: 'After each visit, completed OASIS fields and notes push directly to the patient record in your EHR. No manual export, no double entry. We have live integrations with WellSky, Axxess, KanTime, and Netsmart, with MatrixCare in progress.',
      },
      {
        id: 'fa-f4',
        title: 'What if a clinician doesn\'t trust an auto-filled field?',
        content: 'Clinicians are always in control. Every field Scribble fills is reviewable and editable before submission. Each answer is linked back to the exact moment in the conversation it came from, so clinicians can verify the basis for any response.',
      },
      {
        id: 'fa-f5',
        title: 'Is there a pilot or trial option?',
        content: 'Yes. We can start with a focused pilot group, typically 10–20 clinicians, before a full agency rollout. This lets you see real results with minimal disruption, and gives your team confidence before committing at scale.',
      },
      {
        id: 'fa-f6',
        title: 'How does Scribble handle different visit types?',
        content: 'Each visit type has its own documentation requirements and Scribble is trained specifically on the clinical context and OASIS items relevant to each. As we add visit types, your agency gains coverage across the full episode of care.',
      },
    ]),
  ]));

  // 10 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('fa-cta', { gradient: true, dark: true, py: '80px' }, [
    heading('fa-cta-h', 'See what Scribble does for an agency your size.', 2, { dark: true }),
    text('fa-cta-sub', '20-minute demo. We\'ll model the ROI for your specific headcount, visit volume, and EHR setup. No pressure, no obligation.', { dark: true }),
    {
      id: 'fa-cta-btns', type: 'columns', order: 0, gap: 'sm', stackOnMobile: true,
      style: { maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto', marginTop: '20px' },
      columns: [
        { id: 'fa-cb-l', width: 50, verticalAlign: 'center', blocks: [button('fa-cta-b1', 'Book Your Agency Demo', BRAND.demoUrl, { newTab: true })] },
        { id: 'fa-cb-r', width: 50, verticalAlign: 'center', blocks: [button('fa-cta-b2', 'For Clinicians', '/for-clinicians', { variant: 'secondary', style: GLASS_BTN_STYLE })] },
      ],
    },
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'for-agencies',
    title: 'For Agencies',
    postType: 'page',
    blocks,
    seoTitle: 'For Agencies | Scribble | AI Documentation for Home Health',
    seoDescription: 'Give your agency a competitive edge. Reduce documentation burden, improve OASIS accuracy, retain your best clinicians, and accelerate billing cycles.',
  });

  console.log(`\n=== FOR-AGENCIES IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
