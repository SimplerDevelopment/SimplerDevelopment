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
    overline('hero-ov', 'Industry Insight · Blog', { dark: true }),
    heading('hero-h', 'Why Home Health Clinicians Are Spending More Time Charting Than Caring', 2, { dark: true, align: 'center' }),
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
    text('hero-byline', 'By the Scribble Team · June 2026', {
      dark: true, align: 'center',
      style: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0', maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
    }),
  ]));

  // 2 ── ARTICLE BODY (light, 760px column) ────────────────────────────────
  blocks.push(section('body', { bg: BRAND.offWhite, maxWidth: '760px' }, [

    text('intro-1', "A home health clinician's day starts with patients. It ends with paperwork.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-2', "The visits themselves, the actual patient care that drew these nurses, therapists, and aides into the profession, take up less of the workday than you might expect. According to industry data, the average home health clinician spends nearly as much time on documentation as they do on direct patient care. For Start of Care visits, documentation alone can run 1.5 hours or more.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    // Inline stat callout — rendered as a styled text block
    text('stat-1', '<strong>1.5 hrs</strong><br>Average documentation time per Start of Care visit', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, borderRadius: '12px', padding: '24px 28px',
        borderLeft: `4px solid ${BRAND.teal}`,
        color: BRAND.heading, fontSize: '1rem', lineHeight: '1.6',
      },
    }),

    text('p-adds-up', "That number adds up fast. A clinician doing three SOC visits per week is spending nearly five hours, more than half a workday, just on Start of Care documentation. Add routine visit notes, recertifications, and administrative tasks, and you have a workforce spending a significant part of every shift on indirect care.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-worse', 'The documentation burden is getting worse, not better', 2, { align: 'left' }),
    text('p-worse-1', "The introduction of OASIS-E in 2023 added new items to an already complex assessment. The shift to PDGM in 2020 increased the stakes around accurate OASIS scoring, because reimbursement is now directly tied to clinical groupings derived from that documentation. Get the OASIS wrong, and you get paid wrong.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-worse-2', "These changes were designed to improve care quality and reimbursement accuracy. But they also made documentation harder, longer, and higher-stakes for clinicians who were already stretched.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('p-quote', '<strong>"By the time I sit down to chart, the visit is already a blur. I\'m filling in what I think I remember, and hoping it holds up to QA."</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        borderLeft: `4px solid ${BRAND.teal}`, paddingLeft: '24px',
        backgroundColor: BRAND.tealLight, borderRadius: '0 8px 8px 0',
        paddingTop: '16px', paddingBottom: '16px', paddingRight: '16px',
        color: BRAND.heading, fontWeight: '600', fontStyle: 'italic', fontSize: '1.1rem',
      },
    }),

    text('p-quote-comment', "That quote, from a home health RN we spoke with, captures something important. The problem isn't just time. It's accuracy. When documentation happens hours after the visit, clinical memory degrades. Details that would have changed a functional score, a clinical grouping, or a care plan get lost or approximated.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-data', 'What the data actually shows', 2, { align: 'left' }),
    text('p-data-1', "A typical home health clinician sees 5–6 patients per day. That's 5–6 drives between homes, 5–6 full clinical assessments, and 5–6 rounds of documentation to complete. By most estimates, clinicians spend 3 or more hours per day on documentation, often after their visits are done, at home, in the evening.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('stat-2', '<strong>3+ hrs</strong><br>Daily documentation time for a typical home health clinician', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, borderRadius: '12px', padding: '24px 28px',
        borderLeft: `4px solid ${BRAND.teal}`,
        color: BRAND.heading, fontSize: '1rem', lineHeight: '1.6',
      },
    }),

    text('p-data-2', "The consequence isn't just burnout, though burnout is real and it's driving attrition across the industry. The consequence is also financial. Every hour a clinician spends on documentation is an hour they're not available for patient care. For an agency paying clinical rates for administrative time, the math is stark.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-data-3', "For a 20-clinician agency at $55/hour, three hours of daily documentation per clinician equals over $250,000 in annual labor cost spent on paperwork, not care.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-quality', 'The quality problem no one talks about', 2, { align: 'left' }),
    text('p-quality-1', "Much of the conversation about documentation burden focuses on time and cost. Less attention goes to accuracy, but that's where the financial impact can be even larger.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-quality-2', "Under PDGM, Medicare home health reimbursement is determined by clinical groupings that are based on OASIS scores. Functional scores, clinical categories, comorbidity adjustments, which map directly to payment tiers. A clinician who underscores a patient's functional impairment because they're documenting from memory at 9pm isn't just being imprecise. They may be miscategorizing an entire episode.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-quality-3', "Multiply that across hundreds of episodes per year, and the revenue impact on a single agency can be significant.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-retention', 'The retention problem that documentation is causing', 2, { align: 'left' }),
    text('p-retention-1', "Ask any home health administrator why they're losing experienced clinicians, and documentation comes up quickly. It's not the clinical work; most nurses and therapists chose home health because they love the one-on-one nature of patient care. It's the administrative burden that follows them home.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-retention-2', "Replacing a single experienced RN costs an average of $52,000: recruiting, onboarding, lost productivity during ramp-up. For agencies facing turnover rates well above the national average, documentation burden isn't just an operational issue. It's a talent and financial crisis.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-best', 'What the best agencies are doing differently', 2, { align: 'left' }),
    text('p-best-1', "The agencies that are winning on retention and quality share a common thread: they've made it easier for clinicians to document well, not harder.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-best-2', "Some have moved to real-time documentation tools that capture clinical information during the visit, not after. Instead of asking clinicians to reconstruct a visit from memory, these tools capture the conversation as it happens, map it to OASIS fields automatically, and give the clinician a draft to review and finalize.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-best-3', "The impact is measurable. Clinicians who use Scribble's bedside capture report completing SOC documentation in roughly half the previous time. QA teams report significantly fewer errors and corrections. And after-hours charting, the 8pm and 9pm sessions that accelerate burnout, drops substantially.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('p-quote-2', '<strong>"Used to do 3 SOCs on a Saturday. Last time I completed 5." — Erica S., RN</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        borderLeft: `4px solid ${BRAND.teal}`, paddingLeft: '24px',
        backgroundColor: BRAND.tealLight, borderRadius: '0 8px 8px 0',
        paddingTop: '16px', paddingBottom: '16px', paddingRight: '16px',
        color: BRAND.heading, fontWeight: '600', fontStyle: 'italic', fontSize: '1.1rem',
      },
    }),

    text('p-math', "The math is simple. Less time on documentation means more time for patients, or more patients per clinician per week. Either way, the agency wins, and so does the clinician.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-bottom', 'The bottom line', 2, { align: 'left' }),
    text('p-bottom-1', "Home health has a documentation problem that won't solve itself. The complexity of OASIS-E, the financial stakes of PDGM scoring, and the realities of a mobile clinical workforce all point in the same direction: documentation needs to happen at the bedside, in real time, not reconstructed hours later.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-bottom-2', "Agencies that solve this problem will outcompete on clinician recruitment, patient outcomes, and bottom-line performance. The ones that don't will continue to lose good people to burnout, and revenue to inaccurate documentation.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

  ]));

  // 3 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See how Scribble cuts documentation time in half.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team size.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'article-charting',
    title: 'Why Home Health Clinicians Are Spending More Time Charting Than Caring',
    postType: 'blog',
    excerpt: 'Home health clinicians now spend more time on documentation than on patient care. Here\'s what the data shows, and what agencies can do about it.',
    blocks,
    seoTitle: 'Why Home Health Clinicians Are Spending More Time Charting Than Caring | Scribble',
    seoDescription: 'Home health clinicians now spend more time on documentation than on patient care. Here\'s what the data shows, and what agencies can do about it.',
  });

  console.log(`\n=== ARTICLE: CHARTING (post #${postId}, ${blocks.length} top-level sections) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
