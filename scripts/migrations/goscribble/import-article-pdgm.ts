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
    overline('hero-ov', 'Reimbursement · Blog', { dark: true }),
    heading('hero-h', 'How PDGM in 2026 Changed the Financial Stakes of OASIS Documentation', 2, { dark: true, align: 'center' }),
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

    text('intro-1', "The shift from the old volume-based Prospective Payment System to PDGM was the biggest reimbursement change home health had seen in a generation. Under the old model, agencies got paid largely based on how many services they delivered. Under PDGM, they get paid based on who the patient is, specifically how sick and how functionally limited the patient is at the start of care.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-2', "That distinction sounds straightforward. In practice, it means the OASIS your clinician completes at the bedside on day one is doing most of the financial work for the entire episode. Get it right and you get paid what the patient's condition actually warrants. Miss detail because it was documented hours later from memory rather than captured in the room, and you leave money on the table on every episode, compounded across your entire census.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-3', "In 2026, with CMS enforcing aggregate spending cuts that include a -1.023% permanent behavior adjustment and a -3.0% temporary rate reduction, the margin for documentation error has shrunk further. Accurate bedside capture is no longer just a compliance discipline. It is a core financial one.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-groupings', 'How PDGM works: 432 groupings, one OASIS', 2, { align: 'left' }),
    text('p-groupings-1', "Every 30-day payment period under PDGM gets assigned to one of 432 Home Health Resource Groups (HHRGs). The national standardized 30-day base payment rate for 2026 is $2,038.22 for agencies that submit required quality data. But the actual payment for any given episode depends entirely on which resource group the patient lands in, and that grouping is driven by five variables, most of them pulled directly from your OASIS.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    // Stat callout
    text('stat-1', '<strong>432</strong><br>Home Health Resource Groups that determine Medicare payment under PDGM', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, borderRadius: '12px', padding: '24px 28px',
        borderLeft: `4px solid ${BRAND.teal}`,
        color: BRAND.heading, fontSize: '1rem', lineHeight: '1.6',
      },
    }),

    // PDGM variables table — rendered as structured text
    text('p-table-header', '<strong>PDGM Variable · Data Source · What It Determines</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.navy, color: BRAND.white,
        padding: '12px 16px', borderRadius: '8px 8px 0 0',
        fontSize: '0.85rem', letterSpacing: '0.3px',
      },
    }),
    text('p-table-body', [
      '<strong>Admission Source</strong> · Claims data · Institutional vs. community baseline payment',
      '<strong>Timing</strong> · Claims data · Early vs. late 30-day billing period',
      '<strong>Clinical Grouping</strong> · Primary ICD-10 code · Maps to 12 distinct clinical categories',
      '<strong>Functional Impairment</strong> · 8 specific OASIS items · Low, medium, or high payment tier',
      '<strong>Comorbidity Adjustment</strong> · Secondary ICD-10 codes · None, low, or high tier upcharge',
    ].join('<br>'), {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, padding: '16px', borderRadius: '0 0 8px 8px',
        border: `1px solid ${BRAND.border}`, borderTop: 'none',
        color: BRAND.body, lineHeight: '2', fontSize: '0.95rem',
      },
    }),

    text('p-groupings-2', "Admission source and timing are largely outside clinical control. Clinical grouping follows the primary diagnosis. That leaves functional impairment and comorbidity adjustment as the two variables where OASIS accuracy at the bedside has the most direct impact on what your agency gets paid.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0', marginTop: '24px' },
    }),

    heading('h-functional', 'The functional impairment problem', 2, { align: 'left' }),
    text('p-functional-1', "Functional impairment level is calculated automatically from eight specific OASIS items. CMS runs a points algorithm across these eight fields and assigns the patient to a low, medium, or high tier. That tier is one of the primary determinants of case-mix weight, meaning it directly adjusts the $2,038.22 base rate up or down for every 30-day period.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-oasis-items', 'The 8 OASIS items that determine functional impairment tier', 4, { align: 'left' }),
    text('p-oasis-list', '<strong>M1800</strong> Grooming<br><strong>M1810</strong> Upper Body Dressing<br><strong>M1820</strong> Lower Body Dressing<br><strong>M1830</strong> Bathing<br><strong>M1840</strong> Toilet Transferring<br><strong>M1850</strong> Bed/Chair Transferring<br><strong>M1860</strong> Ambulation/Locomotion<br><strong>M1033</strong> Risk for Hospitalization', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, borderRadius: '12px', padding: '20px 24px',
        border: `1px solid ${BRAND.border}`,
        lineHeight: '2', fontSize: '0.95rem',
      },
    }),

    text('p-functional-2', "Here is where the timing of documentation matters most. When a clinician conducts a start of care visit at 10am and completes the OASIS at 8pm, they are working from memory. And memory of functional observation, how much assistance the patient needed to transfer from bed to chair or how unsteady they were crossing the carpet, degrades fast.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('p-recall-quote', '<strong>Under PDGM, a documentation recall gap is a revenue gap.</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        borderLeft: `4px solid ${BRAND.teal}`, paddingLeft: '24px',
        backgroundColor: BRAND.tealLight, borderRadius: '0 8px 8px 0',
        paddingTop: '16px', paddingBottom: '16px', paddingRight: '16px',
        color: BRAND.heading, fontWeight: '600', fontStyle: 'italic', fontSize: '1.1rem',
      },
    }),

    text('p-functional-3', "What happens in practice is what you might call regressive rounding: memory naturally smooths over detail and defaults to the more moderate answer. A patient who needed maximum human assistance during the visit gets documented as needing only verbal cues. Two or three M-items scored that way can move a patient from a high to a medium or low functional impairment tier. Because point thresholds vary by clinical group, the revenue impact of that shift can run into hundreds of dollars per episode, and it happens silently, across your entire census, with no alert.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-qa', "Why QA can't fix what wasn't captured", 2, { align: 'left' }),
    text('p-qa-1', "A lot of agencies respond to OASIS accuracy concerns by investing in backend QA or professional coding reviews. These workflows catch real problems: structural gaps, mismatched diagnoses, missing required fields. But they have a hard ceiling on what they can fix.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-qa-2', "A QA specialist reviewing a completed OASIS cannot reconstruct an observation that wasn't recorded. They cannot know that the patient struggled to ambulate across a carpeted floor, or that the transfer into the shower required more assistance than the clinician remembered when they sat down to chart that evening. The observation happened at the bedside. If it wasn't captured there, it is gone.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-qa-3', "This is why the most effective point of intervention is not the QA queue. It is the visit itself.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-comorbid', 'Comorbidities: the revenue hiding in casual conversation', 2, { align: 'left' }),
    text('p-comorbid-1', "PDGM includes a secondary comorbidity framework that provides upward payment adjustments for cases with complex interacting conditions. These adjustments are tiered: none, low, or high. They can meaningfully increase case-mix weight when captured correctly.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-comorbid-2', "The catch is that secondary diagnoses often surface organically during the visit, like a patient mentioning peripheral neuropathy while talking about their medications, or brings up a recent hospitalization while describing their daily routine. These details are clinically significant and financially relevant. But they are also easy to miss when the clinician is focused on the visit and not documenting in real time. By the end of a long day, the connection between what a patient said and what should be coded is frequently lost.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-documentation', 'What this means for how you think about documentation', 2, { align: 'left' }),
    text('p-documentation-1', "The question your agency should be asking is not whether your OASIS forms pass technical validation. They probably do. The question is whether they accurately reflect the clinical complexity of your patients at the moment they were assessed.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-documentation-2', "Under the old system, that distinction mattered mostly for compliance. Under PDGM in 2026, with rates already under pressure from CMS adjustments, it is the difference between billing for the care you actually delivered and leaving a portion of that revenue uncollected on every episode.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-documentation-3', "Real-time documentation at the bedside is the most direct solution. When clinical observations, functional assessments, and patient-reported details are captured during the visit rather than reconstructed from memory hours later, the OASIS reflects what actually happened. The functional scores are more accurate. The comorbidities are more complete. And the case-mix weight is what the patient's condition actually warrants.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    // Callout box
    text('p-callout', '<strong>Scribble listens during the visit</strong> and captures clinical observations, functional limitations, and secondary diagnoses in real time, populating OASIS fields from the actual conversation rather than end-of-day recall. The clinician reviews a draft after the visit, not a blank form. Documentation reflects what happened at 10am, not what was remembered at 8pm.', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        backgroundColor: BRAND.white, borderRadius: '12px', padding: '24px 28px',
        borderLeft: `4px solid ${BRAND.teal}`,
        color: BRAND.body, lineHeight: '1.7',
      },
    }),

  ]));

  // 3 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See Scribble in action.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team size.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'article-pdgm',
    title: 'How PDGM in 2026 Changed the Financial Stakes of OASIS Documentation',
    postType: 'blog',
    excerpt: 'Under PDGM, every OASIS score directly determines how much Medicare pays. With 2026 rate cuts in effect, accurate bedside documentation is no longer just a compliance question. It\'s a revenue question.',
    blocks,
    seoTitle: 'How PDGM in 2026 Changed the Financial Stakes of OASIS Documentation | Scribble',
    seoDescription: 'Under PDGM, every OASIS score directly determines how much Medicare pays. With 2026 rate cuts in effect, accurate bedside documentation is no longer just a compliance question. It\'s a revenue question.',
  });

  console.log(`\n=== ARTICLE: PDGM (post #${postId}, ${blocks.length} top-level sections) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
