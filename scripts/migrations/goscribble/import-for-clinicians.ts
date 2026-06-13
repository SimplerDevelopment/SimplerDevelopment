/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env' });

import {
  BRAND, NAVY_GRADIENT, GLASS_BTN_STYLE, resetOrder, section, heading, text, overline,
  spacer, button, cardGrid, accordion, upsertPost,
} from './_brand';

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  resetOrder();

  const blocks: any[] = [];

  // 1 ── HERO (dark navy gradient) ─────────────────────────────────────────
  blocks.push({
    id: 'fc-hero',
    type: 'hero',
    order: 1,
    subtitle: 'For Home Health Clinicians',
    title: "Document your visit while you're in it.",
    description: 'Scribble listens during the visit and captures your OASIS in real time. When you sit down to review, most of the work is already done.',
    ctaText: 'See How It Works →',
    ctaLink: '#how',
    secondaryCtaText: 'Book a Demo',
    secondaryCtaLink: BRAND.demoUrl,
    style: {
      backgroundColor: BRAND.navy,
      customCSS: NAVY_GRADIENT,
      minHeight: '560px',
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

  // 2 ── PROBLEM (light #F7F9FC) ────────────────────────────────────────────
  blocks.push(section('fc-problem', { bg: BRAND.offWhite }, [
    overline('fc-prob-ov', 'Sound familiar?'),
    heading('fc-prob-h', 'You chose this career for the patients. Not the paperwork.', 2),
    spacer('fc-prob-sp', 'sm'),
    cardGrid('fc-prob-cards', [
      {
        id: 'fc-p1',
        icon: 'nights_stay',
        title: 'You finish charting at 8pm: on a good day',
        description: 'Your visits end at 5. Your day ends at 9. That gap is documentation, and it never gets shorter on its own.',
      },
      {
        id: 'fc-p2',
        icon: 'psychology',
        title: 'You\'re reconstructing the visit from memory',
        description: 'By the time you open the chart, the details from this morning are already blurry. That\'s not a you problem; that\'s a tools problem.',
      },
      {
        id: 'fc-p3',
        icon: 'timer',
        title: 'OASIS takes over an hour per SOC visit',
        description: '1.5 hours of documentation per Start of Care, starting from a blank form, hours after the visit ended. It doesn\'t have to be that way.',
      },
      {
        id: 'fc-p4',
        icon: 'refresh',
        title: 'QA keeps sending it back for corrections',
        description: 'Back-and-forth on OASIS fields you filled in hours after the fact. It costs you time and adds stress to an already long day.',
      },
      {
        id: 'fc-p5',
        icon: 'favorite',
        title: 'You got into healthcare to care for patients',
        description: 'Not to fight software at 9pm. Not to reconstruct clinical observations from memory. You deserve tools that work as hard as you do.',
      },
    ], { columns: 3 }),
  ]));

  // 3 ── HOW IT WORKS (white, anchor #how) ─────────────────────────────────
  blocks.push(section('fc-how', { bg: BRAND.white, anchor: 'how' }, [
    overline('fc-how-ov', 'How It Works'),
    heading('fc-how-h', 'One tap. Natural conversation. Done.', 2),
    text('fc-how-sub', 'No dinner time dictation. No special phrasing. Just talk to your patient. Scribble does the rest.'),
    spacer('fc-how-sp', 'sm'),
    cardGrid('fc-how-cards', [
      {
        id: 'fc-h1',
        icon: 'touch_app',
        title: 'Tap to start',
        description: 'One tap before you enter. Scribble runs quietly in the background while you focus entirely on your patient.',
      },
      {
        id: 'fc-h2',
        icon: 'auto_awesome',
        title: 'Scribble listens and fills',
        description: 'AI maps your natural conversation to OASIS fields in real time. Every answer is tied back to exactly what was said.',
      },
      {
        id: 'fc-h3',
        icon: 'task_alt',
        title: 'Review and go',
        description: '3–5 minutes to review after the visit. Push directly to your EHR or send to your QA team. Done before you leave the driveway.',
      },
    ], { columns: 3 }),
  ]));

  // 4 ── TESTIMONIALS (light testimonials-bg = offWhite) ───────────────────
  const testimonialBlock = (id: string, quote: string, author: string, role: string) => ({
    id, type: 'testimonial', order: 0, quote, author, role,
    style: { backgroundColor: BRAND.white, borderRadius: '16px', padding: '32px', borderWidth: '1px', borderStyle: 'solid', borderColor: BRAND.border, customCSS: 'box-shadow: 0 10px 30px rgba(12,31,63,0.06); height: 100%;', marginBottom: '24px' },
    elementStyles: {
      quote: { color: BRAND.heading, fontFamily: 'Plus Jakarta Sans', fontSize: '1.1rem', lineHeight: '1.5', fontWeight: '600' },
      author: { color: BRAND.teal, fontFamily: 'Plus Jakarta Sans', fontWeight: '700' },
      quoteIcon: { color: BRAND.teal },
    },
  });

  blocks.push(section('fc-testimonials', { bg: BRAND.offWhite }, [
    overline('fc-tst-ov', 'From the Field'),
    heading('fc-tst-h', 'What clinicians are saying.', 2),
    spacer('fc-tst-sp', 'sm'),
    {
      id: 'fc-tst-cols', type: 'columns', order: 0, gap: 'md', stackOnMobile: true,
      columns: [
        {
          id: 'fc-tc-l', width: 50, verticalAlign: 'top', blocks: [
            testimonialBlock('fc-t1', '"Used to do 3 SOCs on a Saturday. Last time I completed 5."', 'Erica S., RN', 'Home Health Nurse'),
            testimonialBlock('fc-t3', '"I love working with Scribble. I appreciate you all."', 'Stephanie R.', 'Home Health Clinician'),
          ],
        },
        {
          id: 'fc-tc-r', width: 50, verticalAlign: 'top', blocks: [
            testimonialBlock('fc-t2', '"I will not document without it."', 'RN at Haggai Healthcare', 'to her Clinical Director'),
          ],
        },
      ],
    },
  ]));

  // 5 ── FAQ (white) ─────────────────────────────────────────────────────────
  blocks.push(section('fc-faq', { bg: BRAND.white, maxWidth: '860px' }, [
    overline('fc-faq-ov', 'Common Questions'),
    heading('fc-faq-h', 'Things clinicians ask us.', 2),
    spacer('fc-faq-sp', 'sm'),
    accordion('fc-faq-acc', undefined, [
      {
        id: 'fc-f1',
        title: 'Do I have to speak in a clinical way?',
        content: 'No. Scribble is trained on real clinician language, not textbook jargon. Talk to your patients the way you normally do, and Scribble will map it to OASIS correctly.',
      },
      {
        id: 'fc-f2',
        title: 'Does it work without WiFi?',
        content: 'Yes. Scribble records locally on your phone. Once you\'re back in WiFi coverage, the visit syncs automatically for processing and EHR integration.',
      },
      {
        id: 'fc-f3',
        title: 'What if I don\'t trust an answer?',
        content: 'You review every field before submission. If Scribble\'s suggestion doesn\'t match what you said, edit it. You\'re always in control.',
      },
      {
        id: 'fc-f4',
        title: 'What do I tell patients?',
        content: 'You can tell them that you are using a note taker for charting. What helps you helps the patient.',
      },
      {
        id: 'fc-f5',
        title: 'How long does training take?',
        content: 'Most clinicians are comfortable with Scribble after 2–3 visits. One 45-minute onboarding session is all it takes to get started.',
      },
      {
        id: 'fc-f6',
        title: 'What if the visit is noisy, like TV on or dogs barking?',
        content: 'Scribble is trained on real home environments, not clinical settings. Background noise doesn\'t stop it from capturing what matters clinically. It filters for the conversation between you and your patient.',
      },
    ]),
  ]));

  // 6 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('fc-cta', { gradient: true, dark: true, py: '80px' }, [
    heading('fc-cta-h', 'Your patients deserve your full attention.<br>Scribble handles the rest.', 2, { dark: true }),
    text('fc-cta-sub', 'Ask your agency director about Scribble, or book a demo and we can reach out to them directly.', { dark: true }),
    {
      id: 'fc-cta-btns', type: 'columns', order: 0, gap: 'sm', stackOnMobile: true,
      style: { maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto', marginTop: '20px' },
      columns: [
        { id: 'fc-cb-l', width: 50, verticalAlign: 'center', blocks: [button('fc-cta-b1', 'Book a Demo', BRAND.demoUrl, { newTab: true })] },
        { id: 'fc-cb-r', width: 50, verticalAlign: 'center', blocks: [button('fc-cta-b2', 'For Agencies', '/for-agencies', { variant: 'secondary', style: GLASS_BTN_STYLE })] },
      ],
    },
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'for-clinicians',
    title: 'For Clinicians',
    postType: 'page',
    blocks,
    seoTitle: 'For Clinicians | Scribble | AI Documentation for Home Health',
    seoDescription: 'Scribble captures your OASIS in real time, while you\'re in the visit. No post-visit charting. No dictation. Done before you leave the driveway.',
  });

  console.log(`\n=== FOR-CLINICIANS IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
