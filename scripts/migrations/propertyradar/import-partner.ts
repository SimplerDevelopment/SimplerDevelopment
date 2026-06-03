/**
 * Import PropertyRadar /partner page.
 * Run: npx tsx scripts/migrations/propertyradar/import-partner.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero ─────────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Become a PropertyRadar Affiliate',
  subtitle: 'AFFILIATE PROGRAM',
  description: 'Get paid to share the platform you already know and love. Earn monthly recurring revenue by sharing PropertyRadar with your network.',
  ctaText: 'Apply For The Program', ctaLink: 'https://propertyradar.firstpromoter.com/signup/20058',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '58vh',
}));

// ── Program benefits (services-grid on tint) ──────────────────────────────────
p.add(p.section('sec-benefits', T.TINT, 96, [
  {
    id: 'ben-grid',
    type: 'services-grid',
    order: p.ord(),
    columns: 3,
    overline: 'PROGRAM BENEFITS',
    title: 'Everything you get as a PropertyRadar affiliate',
    description: 'A partner program built to actually make you money — with the tools and support to do it.',
    accentColor: T.GREEN,
    services: [
      {
        id: 'b1',
        title: 'Recurring Commission',
        description: 'Earn monthly recurring commission for every new customer you refer. The more you refer, the more you make — with a tiered structure.',
        icon: 'currency_exchange',
      },
      {
        id: 'b2',
        title: '90-Day Tracking Cookie',
        description: 'Your referral cookie stays live for 90 days so you get credit even if your referral takes a few months to convert.',
        icon: 'cookie',
      },
      {
        id: 'b3',
        title: 'Free Marketing Materials',
        description: 'Logos, banners, copy and more — all ready to use. Need something custom? We\'re happy to help.',
        icon: 'campaign',
      },
      {
        id: 'b4',
        title: 'Dedicated Affiliate Manager',
        description: 'Get answers fast. As an affiliate you\'ll have a (real) dedicated affiliate manager just an email away.',
        icon: 'support_agent',
      },
      {
        id: 'b5',
        title: 'Co-Marketing Opportunities',
        description: 'Blog features, podcast spots, email campaigns, and strategic partnerships — grow together with PropertyRadar.',
        icon: 'handshake',
      },
      {
        id: 'b6',
        title: 'Personal Dashboard',
        description: 'Track earnings, manage referrals, and download marketing materials from your affiliate dashboard.',
        icon: 'dashboard',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// ── How It Works (timeline / steps — dark navy moment) ────────────────────────
p.add(p.section('sec-how', T.NAVY, 116, [
  {
    id: 'how-tl',
    type: 'timeline',
    order: p.ord(),
    layout: 'left',
    overline: 'HOW IT WORKS',
    title: 'Three steps to recurring income',
    subtitle: 'Simple to start. Automated payouts every month.',
    lineColor: 'rgba(56,203,137,0.4)',
    nodeColor: T.GREEN,
    numberColor: T.NAVY,
    steps: [
      {
        id: 's1',
        number: '01',
        title: 'Apply',
        description: 'Submit your application. Once approved, you\'ll receive a custom referral link and access to a personal dashboard to track earnings and download marketing materials.',
      },
      {
        id: 's2',
        number: '02',
        title: 'Refer & Earn',
        description: 'Share PropertyRadar with your network using your custom link. We use 90-day tracking cookies so you\'ll receive credit even if they return later to sign up.',
      },
      {
        id: 's3',
        number: '03',
        title: 'Get Paid',
        description: 'View your referrals and earnings any time via your affiliate dashboard. Payouts are automated via PayPal on the 15th of every month.',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em' },
      subtitle: { color: 'rgba(255,255,255,0.72)' },
      stepTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      stepDescription: { color: 'rgba(255,255,255,0.72)' },
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── Who makes a great affiliate (services-grid on white) ──────────────────────
p.add(p.section('sec-who', T.WHITE, 96, [
  {
    id: 'who-grid',
    type: 'services-grid',
    order: p.ord(),
    columns: 3,
    overline: 'WHO ARE AFFILIATES?',
    title: 'Our partners come from all walks of real estate',
    accentColor: T.GREEN,
    services: [
      {
        id: 'w1',
        title: 'Coaching & Training Providers',
        description: 'Real estate educators with audiences that trust your recommendations.',
        icon: 'school',
      },
      {
        id: 'w2',
        title: 'Complementary Software & Services',
        description: 'Tools that serve the same investor, agent, or lender audiences.',
        icon: 'integration_instructions',
      },
      {
        id: 'w3',
        title: 'Brokers & Real Estate Brands',
        description: 'Brokerages and real estate companies serving active professionals.',
        icon: 'apartment',
      },
      {
        id: 'w4',
        title: 'Home & Property Services',
        description: 'Contractors, inspectors, and service pros who work with property owners.',
        icon: 'handyman',
      },
      {
        id: 'w5',
        title: 'Mortgage Brokerages & Loan Officers',
        description: 'Lenders looking to connect their clients with better deal-finding tools.',
        icon: 'account_balance',
      },
      {
        id: 'w6',
        title: 'Marketing & Lead Gen Agencies',
        description: 'Agencies who help clients grow their pipeline and outreach.',
        icon: 'campaign',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// ── Affiliate FAQ (accordion on tint) ─────────────────────────────────────────
p.add(p.section('sec-faq', T.TINT, 96, [
  p.overline('faq-ov', 'FAQ'),
  p.heading('faq-h', 'Affiliate Program FAQ'),
  p.spacer('faq-sp', 'lg'),
  {
    id: 'faq-acc',
    type: 'accordion',
    order: p.ord(),
    items: [
      {
        id: 'aq1',
        title: 'What happens after I sign up?',
        content: 'Once approved, you\'ll receive an email with a link to your dashboard. Sign in and select PayPal as your payment method. Your custom referral link will be waiting for you to start sharing.',
      },
      {
        id: 'aq2',
        title: 'What do I need to be successful in making referrals?',
        content: 'The most successful partners have an established community of followers, subscribers, or clients aligned with real estate. They engage with that community regularly and can authentically recommend PropertyRadar.',
      },
      {
        id: 'aq3',
        title: 'Can I customize my referral link?',
        content: 'Yes. You can change your default link name directly on your affiliate dashboard.',
      },
      {
        id: 'aq4',
        title: 'Can I sign up using my own referral link?',
        content: 'No. Self-referrals are strictly prohibited. The program is designed to encourage partners to share PropertyRadar — not to receive personal discounts.',
      },
      {
        id: 'aq5',
        title: 'What\'s the referral cookie life?',
        content: 'The referral cookie lasts 90 days. If a user purchases PropertyRadar after 90 days from their first referred visit, the conversion will not be tracked.',
      },
      {
        id: 'aq6',
        title: 'When will I get paid?',
        content: 'Payouts are on the 15th of every month for all referred active subscriptions older than 31 days. There is a $100 minimum balance threshold before payout. Commissions held below $100 accumulate and are paid once the threshold is reached.',
      },
      {
        id: 'aq7',
        title: 'Why is there a payout minimum?',
        content: 'Our system works on a $100 minimum payout threshold. If you prefer a larger bulk payout, reach out to your affiliate manager and we\'ll work with you.',
      },
      {
        id: 'aq8',
        title: 'How can I get paid if I don\'t have a PayPal account?',
        content: 'Currently, commissions are paid exclusively through PayPal. If you don\'t have a PayPal account, you\'ll need to create one before your first payout.',
      },
    ],
    style: { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
  },
], {}, { maxWidth: '900px' }));

// ── Final CTA ─────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  id: 'cta',
  title: 'Become a partner',
  description: 'Join real estate educators, agencies, and software companies already earning with PropertyRadar.',
  primaryButtonText: 'Apply Now',
  primaryButtonUrl: 'https://propertyradar.firstpromoter.com/signup/20058',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'partner',
  title: 'Become a PropertyRadar Affiliate',
  seoTitle: 'Join PropertyRadar\'s Affiliate Program',
  seoDescription: 'Get paid to share the platform you already know and love. You\'ll earn monthly recurring revenue by sharing PropertyRadar with your network.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
