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
    overline('hero-ov', 'Explainer · Blog', { dark: true }),
    heading('hero-h', 'What Is Ambient AI for Home Health? A Plain-English Guide', 2, { dark: true, align: 'center' }),
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

    text('intro-1', "You've probably heard the term “ambient AI” in conversations about healthcare technology. But what does it actually mean, and can it be leveraged in home health?", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('intro-2', 'This guide explains what ambient AI is, how it differs from dictation and other documentation tools, and what home health agencies should look for when evaluating it.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-simple', 'The simple definition', 2, { align: 'left' }),
    text('p-simple-1', 'Ambient AI is artificial intelligence that listens to a clinical encounter in real time and automatically generates documentation from what was said, without requiring the clinician to dictate, narrate, or type anything.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-simple-2', 'The clinician simply has a conversation with the patient. The AI listens in the background, understands the clinical context, and produces structured documentation from that conversation.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-simple-quote', '<strong>Ambient AI doesn\'t change how clinicians work. It eliminates the work that follows.</strong>', {
      align: 'left',
      style: {
        maxWidth: '100%', marginLeft: '0', marginRight: '0',
        borderLeft: `4px solid ${BRAND.teal}`, paddingLeft: '24px',
        backgroundColor: BRAND.tealLight, borderRadius: '0 8px 8px 0',
        paddingTop: '16px', paddingBottom: '16px', paddingRight: '16px',
        color: BRAND.heading, fontWeight: '600', fontStyle: 'italic', fontSize: '1.1rem',
      },
    }),

    heading('h-dictation', 'How is this different from dictation?', 2, { align: 'left' }),
    text('p-dictation-1', 'Dictation requires the clinician to speak documentation out loud, either during or after the visit. They narrate their findings in a specific clinical format, and software transcribes it into text.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-dictation-2', 'Ambient AI is fundamentally different. The clinician doesn\'t narrate anything. They just talk to their patient. The AI understands that a natural conversation about how the patient got out of bed this morning maps to an OASIS ambulation score. It makes those connections automatically.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-dictation-sub', 'Dictation', 3, { align: 'left' }),
    text('p-dictation-old', 'Clinician speaks documentation out loud. Requires clinical phrasing. Usually done after the visit. Creates notes, not structured fields.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-ambient-sub', 'Ambient AI', 3, { align: 'left' }),
    text('p-ambient-new', 'Clinician talks to the patient normally. AI maps conversation to OASIS fields in real time. Done during the visit. Produces structured documentation.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    text('p-distinction', 'The distinction matters enormously for home health. An OASIS Start of Care has over 100 scored items across clinical, functional, and social domains. Dictation can produce notes, but notes still need to be converted to structured OASIS fields by a clinician or coder. Ambient AI maps directly to those structured fields from the conversation itself.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-hospital', 'Why home health is different from hospital settings', 2, { align: 'left' }),
    text('p-hospital-1', 'Most ambient AI tools were built for hospital or clinic settings, a controlled exam room where the patient and clinician are seated, the background is quiet, and the visit follows a predictable format.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-hospital-2', 'Home health is different in every one of those dimensions.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-hospital-3', 'Clinicians visit patients in their homes, where TVs are on, family members are present, dogs are barking, and the physical environment is unpredictable. Patients may be in bed, in a kitchen, or moving through the house. The conversation doesn\'t follow a clinical script.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-hospital-4', 'Ambient AI built for home health has to work in those conditions. It has to separate clinical signal from background noise. It has to understand when a patient\'s casual comment about needing help with their shoes maps to an OASIS ADL item. It has to handle the full complexity of a home visit, not a controlled exam room.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-workflow', 'What ambient AI actually does in a home visit', 2, { align: 'left' }),
    text('p-workflow-intro', "Here's what the workflow looks like with a purpose-built ambient AI tool for home health:", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-workflow-before', '<strong>Before the visit:</strong> The clinician opens the app, selects the patient, and taps to start. That\'s it. The AI begins listening in the background.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-workflow-during', '<strong>During the visit:</strong> The clinician conducts the visit exactly as they normally would. They assess the patient, ask their questions, observe mobility and function, review medications. The conversation happens naturally. The AI is listening, identifying clinically relevant information, and mapping it to the appropriate OASIS items.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-workflow-after', '<strong>After the visit:</strong> The clinician opens a review screen showing a draft of the completed documentation, with OASIS fields pre-filled based on what was captured during the visit. They review, adjust anything that needs correction, and submit. This review typically takes 5–10 minutes rather than the 60–90 minutes of traditional post-visit documentation.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-accuracy', 'The OASIS accuracy question', 2, { align: 'left' }),
    text('p-accuracy-1', 'A common concern from agencies evaluating ambient AI: is the documentation accurate enough to trust?', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-accuracy-2', 'The answer depends on the tool, but for purpose-built home health AI, the answer is yes, with an important caveat: the clinician always reviews and approves before submission. Every OASIS field is linked to the specific moment in the conversation it came from. The clinician can see exactly why a score was suggested and verify or correct it.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-accuracy-3', 'This "human in the loop" design is essential. Ambient AI is not a replacement for clinical judgment. It\'s a capture tool that gives the clinician a head start, a draft built from the actual visit, not a blank form to fill out from memory.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

    heading('h-evaluate', 'What to look for when evaluating ambient AI for home health', 2, { align: 'left' }),
    text('p-evaluate-list', '• Built specifically for home health OASIS, not adapted from a hospital tool<br>• Works in real home environments with background noise<br>• Produces structured OASIS fields, not just notes or summaries<br>• Integrates directly with your EHR, not a separate system to manage<br>• HIPAA-compliant with BAA included<br>• Clinician always reviews before submission, with no auto-submission<br>• Works offline when WiFi is unavailable', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0', lineHeight: '2' },
    }),

    heading('h-bottom', 'The bottom line', 2, { align: 'left' }),
    text('p-bottom-1', 'Ambient AI for home health is not a future technology. It\'s available now, it works in real clinical environments, and agencies using it are seeing measurable reductions in documentation time and QA rework.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-bottom-2', 'The key distinction is purpose-built vs. adapted. Tools designed for hospital scribing or generic note-taking don\'t address the specific requirements of home health OASIS documentation. The right tool understands home health. The visit types, the OASIS structure, the EHR integrations, and the environment.', {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),
    text('p-bottom-3', "If you're evaluating ambient AI for your agency, start with those requirements. The technology is ready. The question is whether the specific tool is built for your clinical context.", {
      align: 'left',
      style: { maxWidth: '100%', marginLeft: '0', marginRight: '0' },
    }),

  ]));

  // 3 ── CTA BAND (dark navy gradient) ─────────────────────────────────────
  blocks.push(section('cta', { gradient: true, dark: true, py: '80px' }, [
    heading('cta-h', 'See ambient AI built for home health.', 2, { dark: true }),
    text('cta-sub', "No obligation. We'll walk through your current documentation workflow, show Scribble live, and model out exactly what the efficiency gains look like for your team size.", { dark: true }),
    button('cta-btn', 'Book a Demo', BRAND.demoUrl, { newTab: true }),
  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'article-ambient-ai',
    title: 'What Is Ambient AI for Home Health? A Plain-English Guide',
    postType: 'blog',
    excerpt: 'Ambient AI listens during the visit and documents in real time, no dictation required. Here\'s how it works and what home health agencies should look for.',
    blocks,
    seoTitle: 'What Is Ambient AI for Home Health? A Plain-English Guide | Scribble',
    seoDescription: 'Ambient AI listens during the visit and documents in real time, no dictation required. Here\'s how it works and what home health agencies should look for.',
  });

  console.log(`\n=== ARTICLE: AMBIENT AI (post #${postId}, ${blocks.length} top-level sections) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
