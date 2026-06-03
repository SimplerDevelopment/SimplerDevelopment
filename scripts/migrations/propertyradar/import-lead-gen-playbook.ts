/**
 * Import PropertyRadar /lead-gen-playbook page.
 * Run: npx tsx scripts/migrations/propertyradar/import-lead-gen-playbook.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero (dark) ────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'The Ultimate Lead Gen Playbook',
  subtitle: 'FREE DOWNLOAD',
  description: 'Step-by-step execution guides, proven scripts and templates, and market analysis tools — everything you need to build a predictable pipeline.',
  ctaText: 'Download Free', ctaLink: '/lead-gen-playbook',
  secondaryCtaText: 'Try PropertyRadar', secondaryCtaLink: '/register',
  minHeight: '62vh',
}));

// ── What's inside (white) ─────────────────────────────────────────────────────
p.add(p.section('sec-inside', T.WHITE, 96, [
  p.overline('wi-ov', 'WHAT\'S INSIDE'),
  p.heading('wi-h', 'Everything you need to generate more leads'),
  p.lead('wi-l', 'Discover proven strategies to generate leads and find off-market deals tailored for your industry. Each playbook contains step-by-step tactics you can implement this week.'),
  p.spacer('wi-sp', 'md'),
  {
    id: 'inside-grid', type: 'services-grid', order: p.ord(), columns: 3, accentColor: T.GREEN,
    services: [
      {
        id: 'i1', title: 'Step-by-Step Guides',
        description: 'Clear, actionable execution plans that take you from zero to your first contact — no experience required.',
        icon: 'format_list_numbered',
      },
      {
        id: 'i2', title: 'Proven Scripts & Templates',
        description: 'Tested messaging that gets responses — from direct mail postcards to cold call openers and email sequences.',
        icon: 'description',
      },
      {
        id: 'i3', title: 'Market Analysis Tools',
        description: 'Frameworks for identifying motivated sellers, trending zip codes, and the moments when owners are most likely to act.',
        icon: 'analytics',
      },
    ],
    elementStyles: {
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// ── Choose your path — audience playbooks (tint) ──────────────────────────────
p.add(p.section('sec-paths', T.TINT, 96, [
  p.overline('pa-ov', 'CHOOSE YOUR PATH'),
  p.heading('pa-h', 'A playbook built for your business'),
  p.lead('pa-l', 'We\'ve curated specific strategies for every real estate professional. Choose the playbook that matches how you work.'),
  p.spacer('pa-sp', 'md'),
  {
    id: 'paths-grid', type: 'services-grid', order: p.ord(), columns: 3, accentColor: T.GREEN,
    services: [
      {
        id: 'pl1', title: 'Real Estate Investor',
        description: 'Stop competing for on-market deals. Use Plays to discover and acquire off-market investment properties with precision.',
        icon: 'trending_up',
        link: '/plays?audience=real-estate-investors',
        linkText: 'Get Investor Playbook',
      },
      {
        id: 'pl2', title: 'Residential Agent',
        description: 'Go beyond referrals and the MLS to proactively find new listings, win sellers, and dominate your local market.',
        icon: 'home_work',
        link: '/plays?audience=residential-agents',
        linkText: 'Get Agent Playbook',
      },
      {
        id: 'pl3', title: 'Commercial Agent',
        description: 'Uncover off-market opportunities and connect directly with commercial property owners and tenants.',
        icon: 'apartment',
        link: '/plays?audience=commercial-agents',
        linkText: 'Get Commercial Playbook',
      },
      {
        id: 'pl4', title: 'Mortgage Pro',
        description: 'Identify and connect with high-potential borrowers for refinances, new purchases, and specialty loans.',
        icon: 'account_balance',
        link: '/plays?audience=mortgage-pros',
        linkText: 'Get Mortgage Playbook',
      },
      {
        id: 'pl5', title: 'Home Service Professional',
        description: 'Get in front of local homeowners who need your services today based on property age, recent sales, and more.',
        icon: 'handyman',
        link: '/plays?audience=service-pros',
        linkText: 'Get Services Playbook',
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

// ── Dark stat / quote moment (navy) ───────────────────────────────────────────
p.add(p.section('sec-stat', T.NAVY, 116, [
  p.overline('st-ov', 'WHY IT WORKS', T.GREEN),
  {
    id: 'st-h', type: 'heading', order: p.ord(), content: 'Data-driven outreach outperforms guesswork every time', level: 2, alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'stats-row', type: 'stats', order: p.ord(), columns: 3,
    stats: [
      { id: 's1', value: '3X', label: 'Higher marketing ROI vs. blanket campaigns' },
      { id: 's2', value: '160M+', label: 'Properties in the PropertyRadar database' },
      { id: 's3', value: '1B+', label: 'Owner phones & emails available' },
    ],
    elementStyles: {
      statValue: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4vw,3.25rem)', letterSpacing: '-0.02em' },
      statLabel: { color: 'rgba(255,255,255,0.7)', fontWeight: '500', letterSpacing: '0.02em' },
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── CTA ────────────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Get the playbook — it\'s free',
  description: 'Download your audience-specific lead gen playbook and start building a predictable pipeline today.',
  primaryButtonText: 'Download Free', primaryButtonUrl: '/lead-gen-playbook',
  secondaryButtonText: 'Try PropertyRadar', secondaryButtonUrl: '/register',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'lead-gen-playbook',
  title: 'The Ultimate Lead Gen Playbook',
  seoTitle: 'Proven Lead Generation Strategies | Free Playbook | PropertyRadar',
  seoDescription: 'Discover proven strategies to generate leads and find off-market deals tailored for your industry. Download your free playbook and build a predictable pipeline today.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
