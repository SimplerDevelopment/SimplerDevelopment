/**
 * Import PropertyRadar /pricing page.
 * Run: npx tsx scripts/migrations/propertyradar/import-pricing.ts
 *
 * Prices confirmed in source JSON:
 *   Solo    $119/mo | $99/mo annual  (PackageID=117)
 *   Team    $249/mo | $199/mo annual (PackageID=118)
 *   Business $599/mo | $549/mo annual (PackageID=119)
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero ─────────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Simple, Transparent Pricing',
  subtitle: 'PRICING',
  description: 'Choose the plan that fits your business. Start with a 5-day free trial — cancel anytime.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See all features', secondaryCtaLink: '/features',
  minHeight: '52vh',
}));

// ── Plans card-grid (3 cols) ──────────────────────────────────────────────────
p.add(p.section('sec-plans', T.WHITE, 96, [
  p.overline('pl-ov', 'PLANS & PRICING'),
  p.heading('pl-h', 'Find the right plan for your business'),
  p.lead('pl-l', 'Every plan includes a 5-day free trial. No commitment required.'),
  p.spacer('pl-sp', 'lg'),
  {
    id: 'plans-grid',
    type: 'card-grid',
    order: p.ord(),
    columns: 3,
    cards: [
      {
        id: 'plan-solo',
        title: 'Solo',
        description: '$99/mo billed annually · $119/mo billed monthly\n\nIdeal for single-person businesses.\n\n• 1 User\n• Unlimited Views & Saves\n• Unlimited Imports\n• 10,000 Monthly Exports\n• 10,000 Monitored Properties\n• 250 Monthly Phones & Emails\n• 250 Monthly Email Sends\n• 25 Monthly Relatives\n• 1 Integration',
        icon: 'person',
        link: '/register?PackageID=117&PlanInterval=annually',
        linkText: 'Start Free Trial',
      },
      {
        id: 'plan-team',
        title: 'Team',
        description: '$199/mo billed annually · $249/mo billed monthly\n\nIdeal for teams who want to accelerate growth. 25% off add-ons.\n\n• 3 Users\n• Unlimited Views & Saves\n• Unlimited Imports\n• 25,000 Monthly Exports\n• 25,000 Monitored Properties\n• 500 Monthly Phones & Emails\n• 500 Monthly Email Sends\n• 50 Monthly Relatives\n• 3 Integrations',
        icon: 'group',
        link: '/register?PackageID=118&PlanInterval=annually',
        linkText: 'Start Free Trial',
        badge: 'Most Popular',
      },
      {
        id: 'plan-business',
        title: 'Business',
        description: '$549/mo billed annually · $599/mo billed monthly\n\nIdeal for established businesses looking to scale. 50% off add-ons.\n\n• 10 Users\n• Unlimited Views & Saves\n• Unlimited Imports\n• 50,000 Monthly Exports\n• 50,000 Monitored Properties\n• 2,500 Monthly Phones & Emails\n• 2,500 Monthly Email Sends\n• 250 Monthly Relatives\n• 10 Integrations\n• API Access\n• Dedicated Success Rep',
        icon: 'business',
        link: '/register?PackageID=119&PlanInterval=annually',
        linkText: 'Start Free Trial',
      },
    ],
    elementStyles: {
      card: {
        ...cardOnLight,
        padding: '32px',
      },
      cardTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700', fontSize: '1.375rem' },
      cardDescription: { color: T.INK, fontSize: '0.9375rem', lineHeight: '1.7', whiteSpace: 'pre-wrap' },
      cardIcon: { color: T.GREEN },
      cardLink: { color: T.GREEN_D, fontWeight: '600' },
    },
  },
  {
    id: 'plans-note',
    type: 'text',
    order: p.ord(),
    content: 'Save ~20% with annual billing. Monthly and annual plans available — switch anytime. All plans start with a 5-day free trial.',
    alignment: 'center',
    style: {
      color: T.INK, fontFamily: T.PF, fontSize: '0.9375rem', lineHeight: '1.6',
      textAlign: 'center', marginTop: '32px', maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto',
      opacity: '0.8',
    },
  },
  // Highlight middle (Team) card accent via a second accent note
], {}, { paddingBottom: '72px' }));

// ── Team plan recommended callout (dark moment) ───────────────────────────────
p.add(p.section('sec-team-spotlight', T.NAVY, 96, [
  p.overline('ts-ov', 'MOST POPULAR', T.GREEN),
  {
    id: 'ts-h',
    type: 'heading',
    order: p.ord(),
    content: 'Team plan — the sweet spot for growing businesses',
    level: 2,
    alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'ts-l',
    type: 'text',
    order: p.ord(),
    content: '3 users, 25,000 exports, 500 contact reveals per month, and 25% off all add-ons. Start at $199/mo with annual billing.',
    alignment: 'center',
    style: {
      color: 'rgba(255,255,255,0.74)', fontFamily: T.PF, fontSize: '1.1875rem', lineHeight: '1.6',
      textAlign: 'center', maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto', marginTop: '14px',
    },
  },
  p.spacer('ts-sp', 'md'),
  p.button('ts-btn', 'Start Team Free Trial', '/register?PackageID=118&PlanInterval=annually', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── Every Plan Includes (services-grid on tint) ───────────────────────────────
p.add(p.section('sec-includes', T.TINT, 96, [
  {
    id: 'inc-grid',
    type: 'services-grid',
    order: p.ord(),
    columns: 4,
    overline: 'EVERY PLAN INCLUDES',
    title: 'Everything you need to grow',
    description: 'All plans ship with the full feature set — no artificial feature gates.',
    accentColor: T.GREEN,
    services: [
      { id: 'f1', title: 'AI-Powered Search', description: 'Search millions of properties using 300+ criteria.', icon: 'search' },
      { id: 'f2', title: 'Unlimited Lists', description: 'Create and manage unlimited property lists for your campaigns.', icon: 'list_alt' },
      { id: 'f3', title: 'Phones & Emails', description: 'Pre-matched contact data — no skip tracing needed.', icon: 'contacts' },
      { id: 'f4', title: 'Powerful Comps', description: 'Find the best sales comps, including off-market transactions.', icon: 'bar_chart' },
      { id: 'f5', title: 'Investment Analysis', description: 'Quickly evaluate flips and holds to understand opportunities.', icon: 'calculate' },
      { id: 'f6', title: 'Transaction History', description: 'Full chain of title — deeds, loans, liens, assignments, and more.', icon: 'history_edu' },
      { id: 'f7', title: 'Marketing Automation', description: 'Automate outreach with email campaigns and workflows.', icon: 'auto_awesome' },
      { id: 'f8', title: 'Direct Mail', description: 'Send personalized direct mail the next day with no minimums.', icon: 'mail' },
      { id: 'f9', title: 'Property Alerts', description: 'Instant notifications when properties match your criteria.', icon: 'notifications_active' },
      { id: 'f10', title: 'Mobile Apps', description: 'Access PropertyRadar on iOS and Android.', icon: 'phone_iphone' },
      { id: 'f11', title: 'Nationwide Coverage', description: 'Property data across all 50 states.', icon: 'public' },
      { id: 'f12', title: 'Great Support', description: 'Real help from our team when you need it.', icon: 'support_agent' },
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
  p.spacer('inc-sp', 'md'),
  p.button('inc-features', 'See the full list of features', '/features', 'outline'),
]));

// ── Pricing FAQ (accordion on white) ─────────────────────────────────────────
p.add(p.section('sec-faq', T.WHITE, 96, [
  p.overline('faq-ov', 'FAQ'),
  p.heading('faq-h', 'Frequently Asked Questions'),
  p.lead('faq-l', 'Everything you need to know before you start.'),
  p.spacer('faq-sp', 'lg'),
  {
    id: 'faq-acc',
    type: 'accordion',
    order: p.ord(),
    items: [
      {
        id: 'fq1',
        title: 'What happens during my 5-day free trial?',
        content: 'Simply sign up and your 5-Day Free Trial begins automatically. To continue, do nothing — we\'ll charge your card at the end of the trial. You can cancel at any time during the trial by logging in and choosing Cancel Subscription from Account Settings. Note: A Free Trial includes 5 free phone numbers and 5 free email addresses. Purchases (exports, document images, phone/email appends) are not available during the trial.',
      },
      {
        id: 'fq2',
        title: 'Can I cancel anytime?',
        content: 'Yes. Cancel anytime by logging into the web app, going to Account Settings, selecting Subscription, then Cancel Subscription. You\'ll receive an email confirmation. You keep access for the rest of your paid period with no further commitment.',
      },
      {
        id: 'fq3',
        title: 'Can I change plans later?',
        content: 'Absolutely. You can change your subscription to any plan at any time. Log in, go to Account Settings → Subscription, and select the plan that fits. We\'ll prorate your subscription at the time of change.',
      },
      {
        id: 'fq4',
        title: 'Do you have data for my location?',
        content: 'PropertyRadar provides nationwide coverage across all 50 states. Visit /coverage to see the specific counties we cover in each state and details about data available in your location.',
      },
      {
        id: 'fq5',
        title: 'Do you offer any discounts?',
        content: 'Yes. Save ~20% with an annual plan paid upfront. You can start monthly and switch to annual at any time. Team plan saves 25% on add-ons; Business plan saves 50% on add-ons.',
      },
      {
        id: 'fq6',
        title: 'When will I get billed?',
        content: 'If you don\'t cancel during your trial, your card is charged after 5 days. You\'re then billed monthly or annually based on your chosen term. You can switch billing terms anytime with remaining balance credited to your account. We do not offer refunds, but your subscription stays active for the full period paid.',
      },
      {
        id: 'fq7',
        title: 'How do I restart a prior subscription?',
        content: 'Log in using your account email (use "forgot password" if needed). Once in, you\'ll see an option to restart your paid subscription or begin a new free trial. Select your package, accept the terms, and update your payment method if needed.',
      },
      {
        id: 'fq8',
        title: 'Why do you need my credit card and mobile number?',
        content: 'Our data is valuable, and some people attempt to abuse the free trial by creating fake accounts. We require a credit card and mobile number to verify you\'re a real person. Your card will not be charged until the end of the 5-Day Free Trial — though you may see a pre-authorization.',
      },
      {
        id: 'fq9',
        title: 'Do unused monthly phones, emails, imports, or exports roll over?',
        content: 'No. Monthly allotments (phone numbers, email addresses, exports, imports) reset on your renewal date and do not roll over. This keeps your outreach moving forward consistently.',
      },
    ],
    style: { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
  },
], {}, { maxWidth: '900px' }));

// ── Final CTA ─────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Ready to get started?',
  description: 'Start your 5-day free trial today. No credit card required to explore.',
  primaryButtonText: 'Start Free Trial',
  primaryButtonUrl: '/register',
  secondaryButtonText: 'See all features',
  secondaryButtonUrl: '/features',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'pricing',
  title: 'Simple, Transparent Pricing | PropertyRadar',
  seoTitle: 'PropertyRadar Pricing and Plans',
  seoDescription: 'Start using property data and owner information to grow your business today. Try it for free!',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
