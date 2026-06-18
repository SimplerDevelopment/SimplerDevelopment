/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars -- one-off migration tooling */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config({ path: '.env' });

import {
  BRAND, resetOrder, section, heading, text, upsertPost,
} from './_brand';

async function main() {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'ids.json'), 'utf8'));
  const websiteId: number = ids.websiteId;
  resetOrder();

  const blocks: any[] = [];

  // Single LIGHT section — maxWidth 760px, left-aligned body text
  blocks.push(section('tos-body', { bg: BRAND.white, maxWidth: '760px', py: '64px' }, [

    // Page title (level 2 heading, left-aligned)
    heading('tos-title', 'Terms of Service', 2, { align: 'left' }),

    // Byline + last updated date
    text('tos-byline', 'Scribble Labs Corp', { align: 'left', size: 'sm', style: { color: BRAND.body, marginBottom: '4px' } }),
    text('tos-date', '<strong>Last Updated:</strong> July 29, 2025', { align: 'left', size: 'sm', style: { color: BRAND.body, marginBottom: '40px', paddingBottom: '40px', borderBottom: `1px solid ${BRAND.border}` } }),

    // ── Section 1 ────────────────────────────────────────────────────────
    heading('tos-h1', '1. Services Provided', 3, { align: 'left' }),
    text('tos-1', 'Goodly by Scribble Labs, developed by Scribble Labs Corp, provides AI-powered tools to assist clinicians in post-acute care settings. Services include:<br><ul style="padding-left:24px;margin:8px 0"><li>Voice capture and transcription</li><li>AI-generated clinical documentation</li><li>Calendar-based visit tracking</li></ul>These tools are designed to support, but not replace, clinical decision-making.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 2 ────────────────────────────────────────────────────────
    heading('tos-h2', '2. Medical Disclaimer', 3, { align: 'left' }),
    text('tos-2', 'Goodly by Scribble Labs is not a medical device and does not provide medical advice, diagnosis, or treatment. All documentation outputs must be reviewed by licensed healthcare professionals before use in patient care or billing.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 3 ────────────────────────────────────────────────────────
    heading('tos-h3', '3. Intellectual Property', 3, { align: 'left' }),
    text('tos-3', 'All software, content, design elements, trademarks, and other intellectual property associated with Goodly by Scribble Labs are the property of Scribble Labs Corp or its licensors. You may not reuse, reproduce, or modify any content without express written permission.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 4 ────────────────────────────────────────────────────────
    heading('tos-h4', '4. Data &amp; Privacy', 3, { align: 'left' }),
    text('tos-4', 'Goodly by Scribble Labs supports HIPAA-compliant workflows. User data and protected health information (PHI) are encrypted in transit and at rest. Use of the platform is subject to our <a href="/privacy-policy" style="color:#00B896;">Privacy Policy</a>.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 5 ────────────────────────────────────────────────────────
    heading('tos-h5', '5. Third-Party Services', 3, { align: 'left' }),
    text('tos-5', 'Goodly by Scribble Labs may interface with third-party tools, including EHR systems, transcription providers, and AI platforms. We are not responsible for the content, security, or behavior of third-party services.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 6 ────────────────────────────────────────────────────────
    heading('tos-h6', '6. Limitation of Liability', 3, { align: 'left' }),
    text('tos-6', 'To the maximum extent permitted by law, Scribble Labs Corp is not liable for any indirect, incidental, special, or consequential damages arising from the use of Goodly by Scribble Labs, including but not limited to data loss, system errors, or clinical inaccuracies.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 7 ────────────────────────────────────────────────────────
    heading('tos-h7', '7. Termination', 3, { align: 'left' }),
    text('tos-7', 'We reserve the right to suspend or terminate your access to Goodly by Scribble Labs at our discretion, including in cases of misuse, security concerns, or breach of these Terms.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 8 ────────────────────────────────────────────────────────
    heading('tos-h8', '8. Governing Law', 3, { align: 'left' }),
    text('tos-8', 'These Terms of Service are governed by the laws of the State of Delaware, without regard to its conflict of laws principles.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 9 ────────────────────────────────────────────────────────
    heading('tos-h9', '9. Contact Us', 3, { align: 'left' }),
    text('tos-9', '<ul style="padding-left:24px;margin:0"><li>Email: <a href="mailto:support@goscribble.ai" style="color:#00B896;">support@goscribble.ai</a></li><li>Address: Scribble Labs Corp | 5 Great Valley Parkway, Suite 210 | Malvern, PA 19355</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'terms-of-service',
    title: 'Terms of Service',
    postType: 'page',
    blocks,
    seoTitle: 'Terms of Service | Scribble',
    seoDescription: 'Terms of Service for Scribble, developed by Scribble Labs Corp.',
  });

  console.log(`\n=== TERMS OF SERVICE IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
