/**
 * Import PropertyRadar /privacy-requests — LEGAL/CONTACT page.
 * Run: npx tsx scripts/migrations/propertyradar/import-privacy-requests.ts
 *
 * Source: data/marketing/privacy-requests.json
 * NOTE: Source data is THIN. The page contains one paragraph of intro text plus
 * a metrics table rendered as malformed stats (label/value pairs mixed up). The
 * table data appears to be 2024 California privacy request metrics but the JSON
 * stats are garbled (value/label fields swapped, no column headers). A clear
 * contact CTA is included as requested.
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

// ─── Hero (compact light) ─────────────────────────────────────────────────────
p.add(p.hero({
  title: 'California Privacy Request Metrics',
  subtitle: 'PRIVACY REQUESTS',
  description: 'Track privacy requests sent to and completed by PropertyRadar. To submit a privacy request, contact us using the information below.',
  dark: false,
  minHeight: '40vh',
}));

// ─── Main content ─────────────────────────────────────────────────────────────
p.add(p.section('sec-main', T.WHITE, 80, [
  p.heading('pr-h', '2024 California Privacy Request Metrics', 2, T.NAVY, 'left'),
  p.text('pr-intro',
    'In calendar year 2024, PropertyRadar received and responded to California privacy requests as described below. These metrics are published in compliance with applicable California privacy law requirements.',
    T.INK, 'left', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto', marginTop: '16px' }),

  p.spacer('pr-sp1', 'md'),

  // NOTE: The extracted JSON stats table is malformed — value/label columns appear
  // swapped and there are no category headers in the source extraction. The raw
  // data is: total requests received 132, denied 27, completed 105, median days 9.2,
  // mean days 6.3 (deletion); 42 received, 30 completed, 12 denied, 8.3 median, 5.4 mean (access);
  // 1 received, 21.8 median (other); 3 received, 17.2 median, 7.9 mean (correction).
  // Presented as readable prose since the table structure could not be reliably reconstructed.
  p.text('pr-metrics',
    'Requests to Delete: 132 received, 27 denied, 105 completed. Median days to respond: 9.2. Mean days to respond: 6.3.\n\nRequests to Know/Access: 42 received, 12 denied, 30 completed. Median days to respond: 8.3. Mean days to respond: 5.4.\n\nRequests to Correct: 3 received. Median days to respond: 17.2. Mean days to respond: 7.9.\n\nOther Requests: 1 received. Median days to respond: 21.8.',
    T.INK, 'left', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto', fontStyle: 'normal', lineHeight: '1.8' }),

  p.spacer('pr-sp2', 'md'),
  p.divider('pr-div1'),
  p.spacer('pr-sp3', 'md'),

  p.heading('pr-h2', 'Submit a Privacy Request', 2, T.NAVY, 'left'),
  p.text('pr-contact-intro',
    'To exercise your privacy rights — including requests to know, delete, correct, or restrict processing of your personal information — contact us using one of the methods below.',
    T.INK, 'left', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto', marginTop: '16px' }),
  p.text('pr-contact-detail',
    '• Online: Submit a request at propertyradar.com/privacy-policy#ContactUs\n• Telephone: 888-914-9661, PIN: 640 222\n• Mail: PropertyRadar, Inc., P.O. Box 837, Truckee, CA 96160\n\nWe will verify your identity before processing any request. An authorized agent may submit requests on your behalf with a signed authorization.',
    T.INK, 'left', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto', marginTop: '12px', lineHeight: '1.8' }),

  p.spacer('pr-sp4', 'md'),
  p.button('pr-btn', 'View Full Privacy Policy', '/privacy-policy', 'outline', {
    icon: 'policy', iconPosition: 'left', hoverEffect: 'slide', size: 'md', alignment: 'left',
  }),
  p.spacer('pr-sp5', 'lg'),
], { maxWidth: '900px' }, {}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'privacy-requests',
  title: 'California Privacy Request Metrics',
  seoTitle: 'Privacy Requests | PropertyRadar',
  seoDescription: 'Track Privacy Requests sent to and completed by PropertyRadar. Submit requests to know, delete, or correct your personal information.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
