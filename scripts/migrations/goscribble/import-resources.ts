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
    subtitle: 'Home Health AI Insights',
    title: 'Insights for home health agency leaders and clinicians.',
    description: 'Practical guides and perspectives from the Scribble team, on AI, home health operations, and the future of point-of-care documentation.',
    style: {
      backgroundColor: BRAND.navy,
      customCSS: `background: linear-gradient(160deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%);`,
      minHeight: '420px',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    elementStyles: {
      subtitle: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: '700', fontSize: '0.8rem', fontFamily: 'Plus Jakarta Sans' },
      title: { color: BRAND.white, fontFamily: 'Plus Jakarta Sans', fontSize: '2.8rem', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-0.025em' },
      description: { color: BRAND.bodyLight, fontFamily: 'Plus Jakarta Sans', fontSize: '1.1rem', lineHeight: '1.65', customCSS: 'max-width: 640px;' },
    },
  });

  // 2 ── FEATURED ARTICLE (light off-white) ────────────────────────────
  blocks.push(section('featured', { bg: BRAND.offWhite }, [
    overline('feat-ov', 'Our Approach · Featured'),
    heading('feat-h', 'Why We Stay Close to the Bedside', 2),
    text('feat-body',
      'Most healthcare AI is built around the back office. We start at the bedside, where the information is, where the clinical story begins, and where everything downstream gets better when you get it right.'),
    button('feat-btn', 'Read the Article', '/article-bedside', { align: 'center', variant: 'secondary' }),
  ]));

  // 3 ── ARTICLE CARDS GRID (white) ─────────────────────────────────────
  // The 4 articles a teammate is building: article-charting, article-ambient-ai, article-pdgm, article-bedside
  blocks.push(section('articles', { bg: BRAND.white }, [
    overline('art-ov', 'From the Scribble Team'),
    heading('art-h', 'From the Scribble team.', 2),
    spacer('art-sp', 'sm'),
    cardGrid('art-cards', [
      {
        id: 'art1',
        icon: 'article',
        title: 'Why Home Health Clinicians Are Spending More Time Charting Than Caring',
        description: 'Documentation now takes longer than patient visits. Here\'s what the data shows, and what agencies can do about it. [Industry]',
        link: '/article-charting',
      },
      {
        id: 'art2',
        icon: 'smart_toy',
        title: 'What Is Ambient AI for Home Health? A Plain-English Guide',
        description: 'No dictation. No narration. Just natural conversation, and structured OASIS documentation generated in real time. Here\'s how it works. [Explainer]',
        link: '/article-ambient-ai',
      },
      {
        id: 'art3',
        icon: 'payments',
        title: 'How PDGM Changed the Financial Stakes of OASIS Documentation',
        description: 'Under PDGM, every OASIS score directly determines how much Medicare pays for an episode. Here\'s what that means for your agency. [Reimbursement]',
        link: '/article-pdgm',
      },
      {
        id: 'art4',
        icon: 'local_hospital',
        title: 'Why We Stay Close to the Bedside',
        description: 'Most healthcare AI is built around the back office. We start at the bedside, where the clinical story begins, and where everything downstream gets better when you get it right. [Our Approach]',
        link: '/article-bedside',
      },
    ], { columns: 2 }),
  ]));

  // 4 ── ROI CALCULATOR PROMO (light off-white) ─────────────────────────
  blocks.push(section('roi-promo', { bg: BRAND.offWhite, maxWidth: '760px' }, [
    overline('roi-ov', 'ROI Calculator'),
    heading('roi-h', 'ROI Calculator', 2),
    text('roi-body',
      'Model the revenue and productivity gains for your specific agency size.'),
    button('roi-btn', 'Open ROI Calculator', '/#roi-calculator', { align: 'center', variant: 'secondary' }),
  ]));

  // 5 ── CTA BAND (dark navy gradient) ─────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See Scribble in action.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow and show Scribble live.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { align: 'center', newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'resources',
    title: 'Resources',
    postType: 'page',
    blocks,
    seoTitle: 'Resources | Scribble Blog & Home Health AI Insights',
    seoDescription: 'Practical guides and perspectives from the Scribble team on AI, home health operations, OASIS documentation, PDGM, and the future of point-of-care documentation.',
    // published omitted — upsertPost preserves the live published state on update
  });

  console.log(`\n=== RESOURCES IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
