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
  blocks.push(section('privacy-body', { bg: BRAND.white, maxWidth: '760px', py: '64px' }, [

    // Page title (level 2 heading, left-aligned)
    heading('pp-title', 'Privacy Policy', 2, { align: 'left' }),

    // Byline + effective date
    text('pp-byline', 'Scribble Labs Corp', { align: 'left', size: 'sm', style: { color: BRAND.body, marginBottom: '4px' } }),
    text('pp-date', '<strong>Effective Date:</strong> July 29, 2025', { align: 'left', size: 'sm', style: { color: BRAND.body, marginBottom: '40px', paddingBottom: '40px', borderBottom: `1px solid ${BRAND.border}` } }),

    // ── Section 1 ────────────────────────────────────────────────────────
    heading('pp-h1', '1. Information We Collect', 3, { align: 'left' }),

    heading('pp-h1a', 'a. Personal Information', 4, { align: 'left', style: { fontSize: '1rem', fontWeight: '700', marginTop: '16px', marginBottom: '8px', color: BRAND.heading } }),
    text('pp-1a', '<ul style="padding-left:24px;margin:0"><li>Name, email address, organization, and job title</li><li>Login credentials</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    heading('pp-h1b', 'b. Clinical Usage Data', 4, { align: 'left', style: { fontSize: '1rem', fontWeight: '700', marginTop: '16px', marginBottom: '8px', color: BRAND.heading } }),
    text('pp-1b', '<ul style="padding-left:24px;margin:0"><li>Visit details, visit types, and interaction timestamps</li><li>Voice recordings and transcripts submitted for documentation support</li><li>Clinical documentation necessary to generate clinical workflows</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    heading('pp-h1c', 'c. Device &amp; Technical Data', 4, { align: 'left', style: { fontSize: '1rem', fontWeight: '700', marginTop: '16px', marginBottom: '8px', color: BRAND.heading } }),
    text('pp-1c', '<ul style="padding-left:24px;margin:0"><li>IP address, browser type, device type, operating system</li><li>App usage metrics, crash logs, and diagnostics</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 2 ────────────────────────────────────────────────────────
    heading('pp-h2', '2. How We Use Your Information', 3, { align: 'left' }),
    text('pp-2', '<ul style="padding-left:24px;margin:0 0 16px"><li>Deliver and improve our AI-assisted documentation features</li><li>Generate structured clinical notes</li><li>Support customer service, technical troubleshooting, and product development</li><li>Ensure compliance with security, privacy, and regulatory requirements</li></ul>We do not sell or rent your data to third parties.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 3 ────────────────────────────────────────────────────────
    heading('pp-h3', '3. HIPAA and Protected Health Information (PHI)', 3, { align: 'left' }),
    text('pp-3', 'Goodly by Scribble Labs is designed for HIPAA-compliant workflows. We enter into Business Associate Agreements (BAAs) with covered entities as required. All PHI is encrypted in transit and at rest, and access is limited to authorized personnel.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 4 ────────────────────────────────────────────────────────
    heading('pp-h4', '4. Data Sharing', 3, { align: 'left' }),
    text('pp-4', '<ul style="padding-left:24px;margin:0 0 16px"><li>Service providers (e.g., transcription, AI processing, hosting) under signed agreements</li><li>Authorized enterprise partners, if you use Goodly by Scribble Labs under a clinical organization\'s account</li><li>Legal authorities, if required to comply with law or protect rights and safety</li></ul>We do not share your personal or clinical data for advertising purposes.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 5 ────────────────────────────────────────────────────────
    heading('pp-h5', '5. Your Choices &amp; Rights', 3, { align: 'left' }),
    text('pp-5', '<ul style="padding-left:24px;margin:0"><li>Request access, correction, or deletion of your personal data</li><li>Opt out of certain non-essential communications</li><li>Contact your administrator if your access is managed by an organization</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 6 ────────────────────────────────────────────────────────
    heading('pp-h6', '6. Data Retention', 3, { align: 'left' }),
    text('pp-6', 'We retain user data only as long as necessary for operational, contractual, or legal purposes. Clinical data may be deleted upon request or termination of the account, subject to applicable retention laws.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 7 ────────────────────────────────────────────────────────
    heading('pp-h7', '7. Security', 3, { align: 'left' }),
    text('pp-7', '<ul style="padding-left:24px;margin:0"><li>End-to-end encryption</li><li>Role-based access controls</li><li>Regular security audits and vulnerability monitoring</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 8 ────────────────────────────────────────────────────────
    heading('pp-h8', '8. Children\'s Privacy', 3, { align: 'left' }),
    text('pp-8', 'Goodly by Scribble Labs is intended for use by licensed clinicians and is not directed at children under 13.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 9 ────────────────────────────────────────────────────────
    heading('pp-h9', '9. Changes to This Policy', 3, { align: 'left' }),
    text('pp-9', 'We may update this Privacy Policy as needed. Significant changes will be communicated via email or in-app notice.', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

    // ── Section 10 ───────────────────────────────────────────────────────
    heading('pp-h10', '10. Contact Us', 3, { align: 'left' }),
    text('pp-10', '<ul style="padding-left:24px;margin:0"><li>Email: <a href="mailto:support@goscribble.ai" style="color:#00B896;">support@goscribble.ai</a></li><li>Address: Scribble Labs Corp | 5 Great Valley Parkway, Suite 210 | Malvern, PA 19355</li></ul>', { align: 'left', size: 'base', style: { color: BRAND.body, maxWidth: '100%', marginLeft: '0', marginRight: '0' } }),

  ]));

  const postId = await upsertPost({
    websiteId,
    slug: 'privacy-policy',
    title: 'Privacy Policy',
    postType: 'page',
    blocks,
    seoTitle: 'Privacy Policy | Scribble',
    seoDescription: 'Privacy Policy for Scribble, developed by Scribble Labs Corp',
  });

  console.log(`\n=== PRIVACY POLICY IMPORTED (post #${postId}, ${blocks.length} top-level blocks) ===`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
