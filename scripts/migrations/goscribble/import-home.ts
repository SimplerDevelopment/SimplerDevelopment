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

  // 1 ── HERO (dark navy gradient) ─────────────────────────────────────
  blocks.push({
    id: 'hero',
    type: 'hero',
    order: 1,
    subtitle: 'Active in 12 States · HIPAA Compliant',
    title: "Your clinicians shouldn't choose between patients and paperwork.",
    description: 'Scribble is the Point-of-Care AI for home health. We capture what happens at the bedside, and make every downstream process more efficient and accurate.',
    ctaText: 'Book a Demo',
    ctaLink: BRAND.demoUrl,
    secondaryCtaText: 'See How It Works',
    secondaryCtaLink: '#how',
    style: {
      backgroundColor: BRAND.navy,
      customCSS: NAVY_GRADIENT,
      minHeight: '620px',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    elementStyles: {
      subtitle: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: '700', fontSize: '0.8rem', fontFamily: 'Plus Jakarta Sans' },
      title: { color: BRAND.white, fontFamily: 'Plus Jakarta Sans', fontSize: '3.4rem', fontWeight: '800', lineHeight: '1.08', letterSpacing: '-0.025em', customCSS: 'text-shadow: 0 2px 30px rgba(0,0,0,0.25); max-width: 820px;' },
      description: { color: BRAND.bodyLight, fontFamily: 'Plus Jakarta Sans', fontSize: '1.18rem', lineHeight: '1.6', customCSS: 'max-width: 600px;' },
      secondaryCta: { color: BRAND.white, customCSS: 'background: rgba(255,255,255,0.08); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.25);' },
    },
  });

  // 2 ── STATS BAR (white) ─────────────────────────────────────────────
  blocks.push(section('stats-bar', { bg: BRAND.white, py: '56px' }, [
    stats('stats-bar-grid', [
      { id: 's1', value: '45 min', label: 'Saved per SOC visit' },
      { id: 's2', value: '1–3', label: 'Additional patients / clinician / week' },
      { id: 's3', value: '$4M+', label: 'Annual productivity gain (400-clinician agency)' },
      { id: 's4', value: '12', label: 'States deployed' },
    ], { columns: 4 }),
  ]));

  // 3 ── PROBLEM (light) ───────────────────────────────────────────────
  blocks.push(section('problem', { bg: BRAND.offWhite }, [
    overline('problem-ov', 'The Burnout Problem'),
    heading('problem-h', 'Home health has a burnout problem.<br>Documentation is the cause.', 2),
    cardGrid('problem-cards', [
      { id: 'p1', icon: 'schedule', title: '3+ hours of documentation daily', description: 'Clinicians spend more time on indirect care than on actual patient visits, and most of it happens after hours, at home.' },
      { id: 'p2', icon: 'trending_down', title: 'Highest attrition rate in healthcare', description: 'Home health loses experienced clinicians faster than any other care setting. Burnout from documentation is the leading driver.' },
      { id: 'p3', icon: 'payments', title: '$52K average cost to replace one RN', description: 'Recruitment, onboarding, and lost productivity add up fast. Keeping your clinicians happy is your highest-ROI investment.' },
    ], { columns: 3 }),
  ]));

  // 4 ── REAL-TIME DOCUMENTATION / 3 STEPS (white, anchor #how) ────────
  blocks.push(section('how', { bg: BRAND.white, anchor: 'how' }, [
    overline('how-ov', 'How It Works'),
    heading('how-h', 'Real-time documentation. Less post-visit catch-up.', 2),
    text('how-sub', 'Scribble listens during the visit, understands clinical context, and fills OASIS fields automatically, while you focus entirely on your patient.'),
    cardGrid('how-cards', [
      { id: 'h1', icon: 'sensor_door', title: '1. Activate at the door', description: 'One tap before you enter. Scribble runs silently in the background, with no special phrasing or narration required. Just talk to your patient naturally.' },
      { id: 'h2', icon: 'fact_check', title: '2. OASIS fills in real time', description: 'As the visit unfolds, Scribble identifies clinically relevant responses and maps them to OASIS fields automatically. Every answer is traceable back to the conversation.' },
      { id: 'h3', icon: 'task_alt', title: '3. Review and submit', description: 'After the visit, review the completed documentation in under 5 minutes. Make any adjustments and push directly to your EHR, or your coding team.' },
    ], { columns: 3 }),
  ]));

  // 5 ── OUTCOMES (dark navy) — "the numbers agencies care about" ──────
  blocks.push(section('outcomes', { gradient: true, dark: true }, [
    overline('out-ov', 'Outcomes'),
    heading('out-h', 'The numbers agencies care about.', 2, { dark: true }),
    text('out-sub', 'ROI you can take to your board, and feel on your bottom line.', { dark: true }),
    spacer('out-sp', 'sm'),
    stats('out-stats', [
      { id: 'o1', value: '$4M+', label: 'Annual productivity gain for a 400-clinician agency, without adding headcount' },
      { id: 'o2', value: '1–3', label: 'Additional patients per clinician per week, improving revenue per FTE' },
      { id: 'o3', value: '↓ 40%', label: 'Reduction in QA back-and-forth on OASIS documentation accuracy' },
      { id: 'o4', value: '2 days', label: 'Faster billing turnaround from documentation complete at visit close' },
      { id: 'o5', value: '↓ 50%', label: 'Reduction in after-hours charting — clinicians finish before the driveway' },
      { id: 'o6', value: '4 weeks', label: 'Average time to go live from contract signed' },
    ], { columns: 3, dark: true }),
  ]));

  // 6 ── TESTIMONIALS (light) — 2x2 grid via columns ──────────────────
  const testimonialBlock = (id: string, quote: string, author: string, role: string) => ({
    id, type: 'testimonial', order: 0, quote, author, role,
    style: { backgroundColor: BRAND.white, borderRadius: '16px', padding: '32px', borderWidth: '1px', borderStyle: 'solid', borderColor: BRAND.border, customCSS: 'box-shadow: 0 10px 30px rgba(12,31,63,0.06); height: 100%;', marginBottom: '24px' },
    elementStyles: {
      quote: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontSize: '1.15rem', lineHeight: '1.5', fontWeight: '600' },
      author: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' },
      quoteIcon: { color: BRAND.teal },
    },
  });
  blocks.push(section('testimonials', { bg: BRAND.offWhite }, [
    overline('tst-ov', 'From the Field'),
    heading('tst-h', 'Real feedback from real clinicians.', 2),
    text('tst-sub', 'From nurses and therapists using Scribble across the country.'),
    spacer('tst-sp', 'sm'),
    {
      id: 'tst-cols', type: 'columns', order: 0, gap: 'md', stackOnMobile: true,
      columns: [
        { id: 'tc-l', width: 50, verticalAlign: 'top', blocks: [
          testimonialBlock('t1', 'Used to do 3 SOCs on a Saturday. Last time I completed 5.', 'Erica S., RN', 'Home Health Nurse'),
          testimonialBlock('t3', 'I love working with Scribble. I appreciate you all.', 'Stephanie R.', 'Home Health Clinician'),
        ] },
        { id: 'tc-r', width: 50, verticalAlign: 'top', blocks: [
          testimonialBlock('t2', 'I did 2 SOCs last week and saved 45 min. on each visit.', 'Tricia, RN', 'Home Health Nurse'),
          testimonialBlock('t4', 'I will not document without it.', 'RN at Haggai Healthcare', 'Clinical staff'),
        ] },
      ],
    },
  ]));

  // 7 ── INTEGRATIONS (white) ─────────────────────────────────────────
  blocks.push(section('integrations', { bg: BRAND.white }, [
    overline('int-ov', 'Integrations'),
    heading('int-h', 'Purpose-built for post-acute care.', 2),
    text('int-sub', "Dictation tools transcribe words. Consumer AI isn't HIPAA-safe. Scribble understands clinical context, maps it to OASIS fields in real time, and pushes it directly to your EHR — all during the visit."),
    cardGrid('int-cards', [
      { id: 'i1', icon: 'integration_instructions', title: 'KanTime', description: 'Bi-directional HL7/FHIR integration.' },
      { id: 'i2', icon: 'integration_instructions', title: 'WellSky', description: 'Bi-directional HL7/FHIR integration.' },
      { id: 'i3', icon: 'integration_instructions', title: 'Netsmart', description: 'Bi-directional HL7/FHIR integration.' },
      { id: 'i4', icon: 'integration_instructions', title: 'Axxess', description: 'Bi-directional HL7/FHIR integration.' },
      { id: 'i5', icon: 'integration_instructions', title: 'MatrixCare', description: 'Bi-directional HL7/FHIR integration.' },
      { id: 'i6', icon: 'hub', title: '+ Any HL7/FHIR EHR', description: "Don't see yours? If it speaks HL7/FHIR, we can connect it." },
    ], { columns: 3 }),
    button('int-cta', 'See all integrations', '/integrations', { align: 'center', variant: 'secondary' }),
  ]));

  // 8 ── FAQ (light) — accordion ──────────────────────────────────────
  blocks.push(section('faq', { bg: BRAND.offWhite, maxWidth: '860px' }, [
    overline('faq-ov', 'FAQ'),
    heading('faq-h', 'What agencies ask before they sign.', 2),
    spacer('faq-sp', 'sm'),
    accordion('faq-acc', undefined, [
      { id: 'f1', title: 'Is Scribble a dictation tool?', content: 'No. Scribble is a real-time AI documentation platform. You never need to dictate or speak in a clinical way; it listens to the natural conversation between you and your patient and extracts the clinically relevant information automatically.' },
      { id: 'f2', title: 'Does it integrate with our EHR?', content: 'Yes. We have existing integrations with WellSky, Axxess, KanTime, and Netsmart. If you don\'t see your EHR, please connect with us to see if your EHR is on the roadmap.' },
      { id: 'f3', title: 'How does Scribble handle HIPAA compliance?', content: 'Scribble is built on HIPAA-compliant infrastructure with end-to-end encryption, access controls, and audit logging. We sign a BAA with every agency. Our data handling practices are available in full upon request.' },
      { id: 'f4', title: 'Can we customize the questions Scribble listens for?', content: 'Yes. We configure Scribble to capture your EMR-specific non-OASIS items in addition to the standard OASIS dataset. This is handled during your onboarding process at no additional cost.' },
      { id: 'f5', title: "What if I don't trust an auto-filled answer?", content: 'You always have full control. Every field Scribble fills can be reviewed and edited before submission. The source conversation excerpt is linked to each answer so you can verify the basis for every response.' },
      { id: 'f6', title: 'How long does implementation take?', content: 'Most agencies are live within 2–4 weeks. We handle EHR integration, training, and configuration. Clinician onboarding typically takes one 45-minute session, and most are proficient by their second visit.' },
    ]),
  ]));

  // 9 ── ROI SNAPSHOT (light) — static (interactive calc flagged) ─────
  blocks.push(section('roi', { bg: BRAND.offWhite, anchor: 'roi-calculator' }, [
    overline('roi-ov', 'ROI'),
    heading('roi-h', 'What Scribble buys you.', 2),
    text('roi-sub', 'Scribble saves clinicians ~1 hour per day across all visit types: SOC, routine, recert, ROC, and discharge. That time becomes new revenue and more patients served. Example: a 100-clinician agency.'),
    spacer('roi-sp', 'sm'),
    {
      id: 'roi-calc', type: 'roi-calculator', order: 0,
      accentColor: BRAND.teal,
      unitLabel: 'FTE clinicians completing SOC',
      unitDefault: 100, unitMin: 10, unitMax: 1000, unitStep: 10,
      minutesLabel: 'Minutes saved per visit', minutesDefault: 45,
      ctaText: 'Book a Demo', ctaLink: BRAND.demoUrl, ctaNewTab: true,
    },
  ]));

  // 10 ── CTA BAND (dark navy gradient) ───────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See a 20-minute demo.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team size.", { dark: true }),
    {
      id: 'cta-btns', type: 'columns', order: 0, gap: 'sm', stackOnMobile: true,
      style: { maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto', marginTop: '20px' },
      columns: [
        { id: 'cb-l', width: 50, verticalAlign: 'center', blocks: [button('cta-b1', 'Book Your Demo', BRAND.demoUrl, { newTab: true })] },
        { id: 'cb-r', width: 50, verticalAlign: 'center', blocks: [button('cta-b2', 'Learn More for Agencies', '/for-agencies', { variant: 'secondary', style: GLASS_BTN_STYLE })] },
      ],
    },
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'home',
    title: 'Home',
    blocks,
    seoTitle: 'Scribble | #1 Ambient AI for Home Health Documentation',
    seoDescription: 'Scribble is the leading ambient AI platform for home health agencies. Real-time OASIS, visit notes, and 485 orders. Clinicians save 45 minutes per visit.',
    ogImage: 'https://goscribble.ai/icon.png',
  });

  console.log(`\n=== HOME IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
