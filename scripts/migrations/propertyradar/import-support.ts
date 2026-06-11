/**
 * Import PropertyRadar /support page.
 * Run: npx tsx scripts/migrations/propertyradar/import-support.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero ─────────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'PropertyRadar Support',
  subtitle: 'SUPPORT',
  description: 'Hi there — how can we help you? Browse our resources or reach out directly. We\'re here during support hours.',
  ctaText: 'Visit Help Center', ctaLink: 'https://help.propertyradar.com/',
  secondaryCtaText: 'Start Free Trial', secondaryCtaLink: '/register',
  minHeight: '52vh',
}));

// ── Support options card-grid (on white) ──────────────────────────────────────
p.add(p.section('sec-options', T.WHITE, 96, [
  p.overline('opt-ov', 'GET HELP'),
  p.heading('opt-h', 'We\'re here when you need us'),
  p.lead('opt-l', 'Multiple ways to get help — self-serve or directly with our team.'),
  p.spacer('opt-sp', 'lg'),
  {
    id: 'opt-grid',
    type: 'card-grid',
    order: p.ord(),
    columns: 3,
    cards: [
      {
        id: 'opt-1',
        title: 'Help Center',
        description: 'Access video tutorials, how-to guides, and full documentation. Find answers to the most common questions instantly.',
        icon: 'help_center',
        link: 'https://help.propertyradar.com/',
        linkText: 'Visit Help Center',
      },
      {
        id: 'opt-2',
        title: 'On Demand Training',
        description: 'Short videos that will make you a PropertyRadar pro in no time. The Getting Started Series is the best place to begin.',
        icon: 'play_circle',
        link: 'https://www.youtube.com/playlist?list=PLZ4rvGOYmXQsUU6FTYpiF2sxEvRu0avM4',
        linkText: 'Getting Started Series',
      },
      {
        id: 'opt-3',
        title: 'Ask the Community',
        description: 'Connect with PropertyRadar users and real estate pros for peer-to-peer help, tips, and best practices.',
        icon: 'forum',
        link: 'https://community.propertyradar.com/',
        linkText: 'Visit the Community',
      },
      {
        id: 'opt-4',
        title: 'Email Support',
        description: 'Send us an email anytime and we\'ll get back to you within support hours. Detailed questions deserve detailed answers.',
        icon: 'mail',
        link: 'mailto:support@propertyradar.com',
        linkText: 'Email Us',
      },
      {
        id: 'opt-5',
        title: 'Live Chat',
        description: 'Start a live conversation with our support team. Available during support hours — just click the chat icon.',
        icon: 'chat',
        link: 'https://www.propertyradar.com/#chat',
        linkText: 'Send a message',
      },
      {
        id: 'opt-6',
        title: 'Call Us',
        description: 'Reach our team by phone at (530) 550-8801 during support hours for hands-on guidance.',
        icon: 'phone_in_talk',
        link: 'tel:5305508801',
        linkText: '(530) 550-8801',
      },
    ],
    elementStyles: {
      card: {
        ...cardOnLight,
        padding: '28px',
      },
      cardTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600', fontSize: '1.125rem' },
      cardDescription: { color: T.INK, fontSize: '0.9375rem', lineHeight: '1.7' },
      cardIcon: { color: T.GREEN },
      cardLink: { color: T.GREEN_D, fontWeight: '600' },
    },
  },
], {}, { paddingBottom: '72px' }));

// ── Support hours / quick note (dark moment) ──────────────────────────────────
p.add(p.section('sec-hours', T.NAVY, 72, [
  {
    id: 'hours-h',
    type: 'heading',
    order: p.ord(),
    content: 'Support Hours',
    level: 2,
    alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'hours-t',
    type: 'text',
    order: p.ord(),
    content: 'Monday – Friday, 8 AM – 5 PM Pacific Time. Outside hours? Visit the Help Center or leave us an email and we\'ll reply first thing.',
    alignment: 'center',
    style: {
      color: 'rgba(255,255,255,0.74)', fontFamily: T.PF, fontSize: '1.0625rem', lineHeight: '1.7',
      textAlign: 'center', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', marginTop: '12px',
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 60% 55% at 50% 50%, rgba(56,203,137,0.10) 0%, transparent 70%);',
}));

// ── FAQ accordion (on tint) ───────────────────────────────────────────────────
p.add(p.section('sec-faq', T.TINT, 96, [
  p.overline('faq-ov', 'FAQ'),
  p.heading('faq-h', 'Frequently Asked Questions'),
  p.lead('faq-l', 'Answers to the questions we hear most often.'),
  p.spacer('faq-sp', 'lg'),
  {
    id: 'faq-acc',
    type: 'accordion',
    order: p.ord(),
    items: [
      {
        id: 'sq1',
        title: 'What happens during my 5-day free trial?',
        content: 'Simply sign up and your 5-Day Free Trial begins automatically. To continue, do nothing — we\'ll charge your card at the end of the trial. You can cancel at any time during the trial by logging in and choosing Cancel Subscription from Account Settings. Note: A Free Trial includes 5 free phone numbers and 5 free email addresses. Purchases (exports, document images, phone/email appends) are not available during the trial.',
      },
      {
        id: 'sq2',
        title: 'Can I cancel anytime?',
        content: 'Yes. Cancel anytime by logging into the web app, going to Account Settings, selecting Subscription, then Cancel Subscription. You\'ll receive an email confirmation and retain access for the remainder of the period you already paid.',
      },
      {
        id: 'sq3',
        title: 'Can I change plans later?',
        content: 'Absolutely. Log in, go to Account Settings → Subscription, and select the plan that fits your needs. We\'ll prorate your subscription at the time of change.',
      },
      {
        id: 'sq4',
        title: 'Do you have data for my location?',
        content: 'PropertyRadar provides nationwide coverage across all 50 states. Visit /coverage to see specific county-level data availability for your location.',
      },
      {
        id: 'sq5',
        title: 'Do you offer any discounts?',
        content: 'Yes. Save ~20% with an annual plan. Team plan saves 25% on add-ons; Business plan saves 50% on add-ons. You can start monthly and switch to annual at any time.',
      },
      {
        id: 'sq6',
        title: 'When will I get billed?',
        content: 'If you don\'t cancel during the trial, your card is charged after 5 days. You\'re then billed monthly or annually based on your term. You can switch anytime with remaining balance credited to your account. We don\'t offer refunds, but your subscription stays active for the full period paid.',
      },
      {
        id: 'sq7',
        title: 'How do I restart a prior subscription?',
        content: 'Log in using your account email (use "forgot password" if needed). Once in, you\'ll see options to restart your paid subscription or begin a new trial. Select your package, accept the terms, and update your payment method if needed.',
      },
      {
        id: 'sq8',
        title: 'Why do you need my credit card and mobile number?',
        content: 'Our data is valuable and some people attempt to abuse the free trial by creating fake accounts. We require a credit card and mobile number to verify you\'re a real person. Your card won\'t be charged until the end of the 5-Day Free Trial — though you may see a pre-authorization.',
      },
      {
        id: 'sq9',
        title: 'Do unused monthly phones, emails, imports, or exports roll over?',
        content: 'No. Monthly allotments reset on your renewal date and do not roll over. This keeps your outreach moving forward consistently month after month.',
      },
    ],
    style: { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
  },
], {}, { maxWidth: '900px' }));

// ── Final CTA ─────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Ready to own your market?',
  description: 'Get instant access and start marketing to home and property owners to level up your business today.',
  primaryButtonText: 'Start Free Trial',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing',
  secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'support',
  title: 'PropertyRadar Support',
  seoTitle: 'Free Trial, Subscription Plans, and Support Options | PropertyRadar',
  seoDescription: 'Set up a 1-on-1 with a PropertyRadar professional. Chat with us online. Browse tutorials and watch videos. Get growing faster with our help!',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
