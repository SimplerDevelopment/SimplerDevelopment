/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env' });

import {
  BRAND, GLASS_BTN_STYLE, resetOrder, section, heading, text, overline,
  button, upsertPost,
} from './_brand';

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  resetOrder();

  const blocks: any[] = [];

  // 1 ── HERO (dark navy gradient) ─────────────────────────────────────────
  blocks.push(section('hero', { gradient: true, dark: true, py: '72px', maxWidth: '760px' }, [
    overline('hero-ov', 'Company Blog', { dark: true }),
    heading('hero-h', 'Why We Stay Close to the Bedside', 2, { dark: true, align: 'center' }),
    {
      id: 'hero-avatar',
      type: 'image',
      order: 0,
      url: 'https://goscribble.ai/photo-andrew.jpeg',
      alt: 'Andrew Ostrander',
      width: 'small',
      alignment: 'center',
      style: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        objectFit: 'cover',
        marginLeft: 'auto',
        marginRight: 'auto',
        marginBottom: '12px',
        border: '2px solid rgba(255,255,255,0.25)',
        display: 'block',
      },
    },
    text('hero-byline', 'By Andrew Ostrander, Co-Founder, Scribble · June 2026', {
      dark: true, align: 'center',
      style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0', maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
    }),
  ]));

  // 2 ── ARTICLE BODY (light, 760px column) ────────────────────────────────
  blocks.push(section('body', { bg: BRAND.offWhite, maxWidth: '760px' }, [

    text('intro-1', 'Most healthcare AI is built backwards.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-2', 'It starts with the back office. The billing team, the coding department, the compliance function. It asks: how do we automate what happens after the visit? How do we process the note faster? How do we flag the claim before it gets denied?', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-3', 'These are reasonable questions. But they start in the wrong place.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-4', "When we built Scribble, we made a deliberate decision: start at the bedside. Start at the moment the clinician walks into a patient's home. That's where the information is. That's where the clinical story begins. Everything else, the OASIS form, the care plan, the 485, the claim, is downstream of what happens in that room.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('p-quote', '<strong>"Every hour away from the bedside is data your agency will never get back."</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        borderLeft: `4px solid ${BRAND.teal}`, paddingLeft: '24px',
        backgroundColor: BRAND.tealLight, borderRadius: '0 8px 8px 0',
        paddingTop: '16px', paddingBottom: '16px', paddingRight: '16px',
        color: BRAND.heading, fontWeight: '600', fontStyle: 'italic', fontSize: '1.1rem',
      },
    }),

    text('p-bio-1', "I've spent fifteen years working with health and human services organizations. Before Scribble, I ran Acutedge, a technology consulting practice that worked with nonprofits and health agencies on Salesforce implementations. I sat with clinical staff in program offices, in field settings, in coordination meetings. And the pattern I kept seeing was the same everywhere: the people closest to the patient were carrying the most administrative burden.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-bio-2', 'In home health, that burden has a specific shape. A clinician finishes a Start of Care visit at 10am. They have four more visits to get to. By the time they sit down to document the 10am visit, it might be 8pm. The details have faded. The exact functional score they observed. The specific statement the patient made about their ambulation. The nuance that would have changed a reimbursement tier.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-bio-3', "That gap, between what was observed and what gets documented, is where revenue leaks. It's where compliance risk lives. It's where care quality erodes quietly, visit by visit.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-source', 'The source of truth is the visit', 2, { align: 'left' }),
    text('p-source-1', "Scribble captures the clinical encounter as it happens. The clinician doesn't dictate. They don't narrate. They just talk to their patient, the way they always have, and Scribble listens, understands the clinical context, and builds the OASIS documentation in real time.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-source-2', "When the visit ends, the documentation is already largely complete. The clinician reviews, adjusts what needs adjusting, and submits. The OASIS that reaches QA was built from what actually happened, not reconstructed from memory hours later.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-source-3', "That single shift, from post-visit recall to bedside capture, changes everything downstream. Fewer QA errors. Faster billing cycles. More accurate OASIS scores. Better care plans. Clinicians who aren't charting at 9pm.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-agencies', 'Why it matters for agencies', 2, { align: 'left' }),
    text('p-agencies-1', 'When I talk to agency administrators and DONs, the conversation usually starts with documentation time. How many hours are your clinicians spending after visits? How many QA corrections does your team process each week? How long does it take from visit close to 485 submission?', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-agencies-2', "But the deeper conversation is about data quality. The OASIS is not just a compliance form. It's the clinical record that drives reimbursement under PDGM. Every field that's inaccurately scored because a clinician was documenting from memory is a potential revenue loss on that episode.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-agencies-3', "The agencies we work with didn't just gain time back when they implemented Scribble. They gained accuracy. Their QA teams stopped chasing clinicians. Their billing cycles shortened. Their clinicians stopped leaving.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-philosophy', 'The philosophy behind the product', 2, { align: 'left' }),
    text('p-philosophy-1', "We built Scribble to be invisible during the visit and indispensable after it. The clinician should never feel like they're operating a documentation tool. They should feel like they're doing their job, and the documentation is happening on its own.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-philosophy-2', "That's a hard problem. Home health environments are loud. Patients talk over each other. Dogs bark. TVs stay on. The clinician is moving through a house, assessing mobility, checking medications, asking questions that sometimes get indirect answers.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-philosophy-3', "Building AI that works in that environment, filtering clinical signal from background noise, understanding when a patient's response maps to an OASIS item, and handling the full complexity of a 250-item assessment across multiple visit types: that's the work we're doing.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-philosophy-4', "We stay close to the bedside because that's where the work is hardest, and because that's where it matters most. Everything downstream gets better when you get the bedside right.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

  ]));

  // 3 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See Scribble capture at the bedside.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team size.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'article-bedside',
    title: 'Why We Stay Close to the Bedside',
    postType: 'blog',
    excerpt: 'Most healthcare AI is built around the back office. Scribble starts at the bedside. Here\'s why that distinction changes everything for home health agencies.',
    blocks,
    seoTitle: 'Why We Stay Close to the Bedside | Scribble',
    seoDescription: 'Most healthcare AI is built around the back office. Scribble starts at the bedside. Here\'s why that distinction changes everything for home health agencies.',
  });

  console.log(`\n=== ARTICLE: BEDSIDE (post #${postId}, ${blocks.length} top-level sections) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
