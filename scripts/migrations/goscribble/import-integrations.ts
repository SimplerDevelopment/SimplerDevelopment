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
    subtitle: 'Works With Your EHR',
    title: 'Works with the EHR your agency already uses.',
    description: 'No ripping and replacing. No new logins. Scribble pushes directly to your existing EHR after every visit.',
    ctaText: 'See Supported EHRs',
    ctaLink: '#ehr-grid',
    secondaryCtaText: 'Talk to Our Team',
    secondaryCtaLink: BRAND.demoUrl,
    style: {
      backgroundColor: BRAND.navy,
      customCSS: `background: linear-gradient(160deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 100%);`,
      minHeight: '480px',
      paddingTop: '120px',
      paddingBottom: '120px',
      paddingLeft: '24px',
      paddingRight: '24px',
    },
    elementStyles: {
      subtitle: { color: BRAND.teal, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: '700', fontSize: '0.8rem', fontFamily: 'Plus Jakarta Sans' },
      title: { color: BRAND.white, fontFamily: 'Plus Jakarta Sans', fontSize: '3rem', fontWeight: '800', lineHeight: '1.1', letterSpacing: '-0.025em' },
      description: { color: BRAND.bodyLight, fontFamily: 'Plus Jakarta Sans', fontSize: '1.1rem', lineHeight: '1.65', customCSS: 'max-width: 600px;' },
      secondaryCta: { color: BRAND.white, customCSS: 'background: rgba(255,255,255,0.08); backdrop-filter: blur(4px); border: 1px solid rgba(255,255,255,0.25);' },
    },
  });

  // 2 ── EHR GRID (white, anchor #ehr-grid) ────────────────────────────
  blocks.push(section('ehr-grid', { bg: BRAND.white, anchor: 'ehr-grid' }, [
    overline('ehr-ov', 'Supported EHRs'),
    heading('ehr-h', 'Works with your EHR. Out of the box.', 2),
    spacer('ehr-sp', 'sm'),
    cardGrid('ehr-cards', [
      {
        id: 'ehr1',
        icon: 'integration_instructions',
        title: 'KanTime',
        description: 'Full OASIS documentation sync. Visits and note summary push directly to KanTime visit records. Live integration.',
      },
      {
        id: 'ehr2',
        icon: 'integration_instructions',
        title: 'WellSky',
        description: 'Complete OASIS integration push and pull. Works with WellSky Kinnser (home health). Live integration.',
      },
      {
        id: 'ehr3',
        icon: 'integration_instructions',
        title: 'Netsmart myUnity',
        description: 'OASIS and visit documentation sync. Live for home health agencies.',
      },
      {
        id: 'ehr4',
        icon: 'integration_instructions',
        title: 'Axxess',
        description: 'OASIS documentation sync with Axxess Home Health. Strategic partner, live integration.',
      },
      {
        id: 'ehr5',
        icon: 'integration_instructions',
        title: 'MatrixCare',
        description: 'Integration in development. We\'re working with MatrixCare to bring full OASIS sync to their agencies.',
      },
      {
        id: 'ehr6',
        icon: 'hub',
        title: 'Your EHR',
        description: 'If your EHR supports modern interoperability standards (HL7/FHIR), we can connect. Ask us about your specific platform.',
      },
    ], { columns: 3 }),
  ]));

  // 3 ── HOW IT WORKS / CONNECTION STEPS (light off-white) ─────────────
  blocks.push(section('how-connect', { bg: BRAND.offWhite }, [
    overline('conn-ov', 'How It Works'),
    heading('conn-h', 'Simple to connect. Simpler to maintain.', 2),
    spacer('conn-sp', 'sm'),
    cardGrid('conn-cards', [
      {
        id: 'conn1',
        icon: 'search',
        title: '1. Discovery (~60 minutes)',
        description: 'We map your EHR configuration and data flows. Typically one 60-minute call. No heavy IT involvement needed.',
      },
      {
        id: 'conn2',
        icon: 'settings',
        title: '2. Setup (3–5 business days)',
        description: 'Our team configures the connection. Most EHR integrations go live in 3–5 business days. We handle everything.',
      },
      {
        id: 'conn3',
        icon: 'sync',
        title: '3. Ongoing Sync (Fully automated)',
        description: 'OASIS fields and visit notes push automatically to your EHR after every visit. No manual exports, no double entry.',
      },
    ], { columns: 3 }),
  ]));

  // 4 ── SECURITY & COMPLIANCE (dark navy) ─────────────────────────────
  blocks.push(section('security', { gradient: true, dark: true }, [
    overline('sec-ov', 'Security & Compliance', { dark: true }),
    heading('sec-h', "Built for healthcare's data requirements.", 2, { dark: true }),
    spacer('sec-sp', 'sm'),
    cardGrid('sec-cards', [
      {
        id: 'sec1',
        icon: 'link',
        title: 'Direct EHR Connection',
        description: 'We build direct integrations with each EHR — no manual import and export, no double entry.',
      },
      {
        id: 'sec2',
        icon: 'lock',
        title: 'AES-256 Encryption',
        description: 'All data encrypted in transit and at rest. Patient information is protected at every layer.',
      },
      {
        id: 'sec3',
        icon: 'gpp_good',
        title: 'BAA Included',
        description: 'We sign a Business Associate Agreement with every agency before any data flows. HIPAA-compliant by design.',
      },
    ], { columns: 3, dark: true }),
  ]));

  // 5 ── FAQ (light off-white) ──────────────────────────────────────────
  blocks.push(section('faq', { bg: BRAND.offWhite, maxWidth: '860px' }, [
    overline('faq-ov', 'Common Questions'),
    heading('faq-h', 'Integration questions answered.', 2),
    spacer('faq-sp', 'sm'),
    accordion('faq-acc', undefined, [
      {
        id: 'fq1',
        title: 'How long does integration take?',
        content: 'Most EHR integrations go live in 3–5 business days. The discovery call is typically 60 minutes. Our team handles all configuration; your IT team doesn\'t need to be heavily involved.',
      },
      {
        id: 'fq2',
        title: "What if our EHR isn't listed?",
        content: "Contact our integration team to discuss your specific platform and whether it's on our roadmap.",
      },
      {
        id: 'fq3',
        title: 'Is patient data stored by Scribble?',
        content: 'Scribble is not an EHR. We maintain only the necessary patient details to process visits. Visits are then pushed into the EHR.',
      },
      {
        id: 'fq4',
        title: 'Does integration require IT involvement?',
        content: "We need you to provide administrative access. Our team handles the rest. We provide a technical checklist ahead of time. You don't need an IT expert.",
      },
      {
        id: 'fq5',
        title: 'Can we run a pilot before full rollout?',
        content: 'Yes. Most agencies start with 5–20 clinicians to validate the integration matches their workflow before expanding. Pricing scales with you, with no penalty for starting small.',
      },
      {
        id: 'fq6',
        title: 'What happens if the EHR is down during a visit?',
        content: "Scribble's integration platform securely holds data when your EHR is down. The data is restored once the connectivity is restored. Your clinician is never blocked from completing a visit; everything captured during the visit is stored locally and pushed to the EHR once the connection is back.",
      },
    ]),
  ]));

  // 6 ── CTA BAND (dark navy gradient) ─────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', "Don't see your EHR? Let's talk.", 2, { dark: true }),
    text('cta-sub', "We add new integrations regularly. If you're on an EHR not listed, reach out and we'll tell you what's possible.", { dark: true }),
    button('cta-btn', 'Talk to Our Integration Team', BRAND.demoUrl, { align: 'center', newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'integrations',
    title: 'Integrations',
    postType: 'page',
    blocks,
    seoTitle: 'EHR Integrations | Scribble Works with KanTime, WellSky, Netsmart, Axxess & More',
    seoDescription: 'Scribble integrates directly with the EHRs home health agencies already use — KanTime, WellSky, Netsmart, Axxess, MatrixCare, and any HL7/FHIR platform.',
  });

  console.log(`\n=== INTEGRATIONS IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
