/**
 * Import PropertyRadar /built-for/mortgage-pros page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for-mortgage-pros.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const PASTEL = T.PASTEL.mort; // #E69BC3 rose

const p = makePage();

// 1. Hero — dark navy
p.add(p.hero({
  title: 'Build Your Pipeline of Qualified Borrowers',
  subtitle: 'MORTGAGE PROFESSIONALS',
  description: 'PropertyRadar helps independent mortgage brokers and loan officers build their own predictable flow of high-intent refinance, purchase, reverse-mortgage, and hard money borrowers — instead of overpaying for generic, low-converting leads.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'Explore Mortgage Plays', secondaryCtaLink: '/plays/mortgage-pros',
  minHeight: '64vh',
}));

// 2. Problem/solution — WHITE with featured-content
p.add(p.section('sec-success', T.WHITE, 96, [
  p.overline('su-ov', 'WHAT SUCCESS LOOKS LIKE'),
  p.heading('su-h', 'Replace expensive lead buys with targeted data-driven outreach'),
  p.lead('su-l', 'Successful mortgage professionals use PropertyRadar to replace expensive, low-yield lead buys with targeted, data-driven outreach that produces a steady, controllable pipeline of qualified borrowers.'),
  p.spacer('su-sp', 'lg'),
  {
    id: 'su-fc', type: 'featured-content', order: p.ord(),
    layout: 'image-right',
    title: 'Find borrowers who are already primed to act',
    description: 'Stop guessing who might refinance or need a new loan. PropertyRadar\'s rate, equity, and loan data lets you pinpoint homeowners paying above-market interest, approaching equity milestones, or actively selling — so you reach out with the right offer at exactly the right time.',
    features: [
      { id: 'f1', text: 'Rate and equity data to find refi-ready borrowers' },
      { id: 'f2', text: 'FHA/VA loan identification for streamline opportunities' },
      { id: 'f3', text: 'Lead enrichment: append property details to purchased lists' },
      { id: 'f4', text: 'Past client monitoring for repeat business triggers' },
    ],
    ctaText: 'See all features', ctaUrl: '/features/property-and-owner-data',
    elementStyles: {
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      feature: { color: T.INK },
      featureIcon: { color: T.GREEN },
    },
  },
]));

// 3. Value props grid — TINT with rose accents
p.add(p.section('sec-howwin', T.TINT, 96, [
  {
    id: 'howwin-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'HOW MORTGAGE PROS WIN', title: 'Every lending opportunity. One platform.',
    accentColor: PASTEL,
    services: [
      { id: 'vp1', title: 'Likely-to-Refinance Borrowers', description: 'Use rate, equity, and loan data to pinpoint borrowers paying above-market interest and reach them with clear savings offers first.', icon: 'percent', link: '/plays/mortgage-pros/lower-rate-refinancing', linkText: 'Run the Play' },
      { id: 'vp2', title: 'FHA + VA Streamline Leads', description: 'Find FHA and VA borrowers with above-market rates and offer fast, low-friction streamline refis.', icon: 'verified_user', link: '/plays/mortgage-pros', linkText: 'See the Plays' },
      { id: 'vp3', title: 'Enrich Purchased Leads', description: 'Append property details, equity, loan type, and ownership history to purchased leads so every call is informed and converts better.', icon: 'data_enrichment', link: '/features', linkText: 'Learn More' },
      { id: 'vp4', title: 'Loan Consolidation Leads', description: 'Target homeowners with multiple loans who will benefit from consolidating into one manageable payment.', icon: 'merge', link: '/plays/mortgage-pros/consolidation-loans', linkText: 'Run the Play' },
      { id: 'vp5', title: 'Hard Money Prospects', description: 'Zero in on active investors and flippers who need fast, reliable capital so you can become their go-to hard money source.', icon: 'currency_exchange', link: '/plays/mortgage-pros/hard-money-prospects', linkText: 'Run the Play' },
      { id: 'vp6', title: "Home Seller's Next-Home Loan", description: 'Monitor new listings to reach sellers the moment they hit the market and secure pre-approvals before another lender steps in.', icon: 'home', link: '/plays/mortgage-pros/repeat-home-buyer-loans', linkText: 'Run the Play' },
      { id: 'vp7', title: 'Cash-Out & HELOCs', description: 'Target equity-rich homeowners and show them how to turn idle equity into new opportunities through cash-out refis or HELOCs.', icon: 'account_balance_wallet', link: '/plays/mortgage-pros', linkText: 'See the Plays' },
      { id: 'vp8', title: 'First-Time Homebuyer Business', description: 'Target rentals with educational, low-pressure campaigns to turn qualified renters into first-time homebuyers.', icon: 'villa', link: '/plays/mortgage-pros/first-time-home-buyer-loans', linkText: 'Run the Play' },
      { id: 'vp9', title: 'Stay First with Past Clients', description: 'Monitor prior closed loans for equity milestones, life events, and listing activity so you re-engage before competitors do.', icon: 'loyalty', link: '/plays/mortgage-pros/sphere-marketing', linkText: 'Run the Play' },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: PASTEL },
      card: cardOnLight,
    },
  },
]));

// 4. Plays dark navy moment
p.add(p.section('sec-plays', T.NAVY, 116, [
  p.overline('pl-ov', 'MORTGAGE PLAYBOOK', T.GREEN),
  p.heading('pl-h', 'The Playbook to Grow Your Mortgage Business', 2, T.WHITE),
  p.lead('pl-l', 'A PropertyRadar Play is a ready-to-send marketing strategy: a targeted list, branded templates, and the ideal channel to maximize engagement.', 'rgba(255,255,255,0.72)'),
  p.spacer('pl-sp', 'md'),
  {
    id: 'plays-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      { id: 'pl1', title: 'Lower Rate Refinancing', description: 'Reach homeowners paying above-market rates with a clear savings pitch before competitors get there.', icon: 'percent', link: '/plays/mortgage-pros/lower-rate-refinancing', linkText: 'Run the Play' },
      { id: 'pl2', title: 'Hard Money Prospects', description: 'Build a pipeline of active flippers and investors who need fast capital to close their deals.', icon: 'currency_exchange', link: '/plays/mortgage-pros/hard-money-prospects', linkText: 'Run the Play' },
      { id: 'pl3', title: 'First-Time Homebuyers', description: 'Convert qualified renters into buyers with low-pressure educational campaigns backed by real data.', icon: 'villa', link: '/plays/mortgage-pros/first-time-home-buyer-loans', linkText: 'Run the Play' },
    ],
    elementStyles: {
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      description: { color: 'rgba(255,255,255,0.72)' },
      icon: { color: T.GREEN },
      link: { color: T.GREEN },
      card: {
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: '1px',
        borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px',
        customCSS: 'transition:all .3s ease',
      },
    },
  },
  p.spacer('pl-sp2', 'lg'),
  p.button('pl-btn', 'Explore All Mortgage Plays', '/plays/mortgage-pros', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 5. Testimonial — TINT
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'MORTGAGE PROS TRUST PROPERTYRADAR'),
  p.heading('t-h', 'Mortgage professionals growing with PropertyRadar'),
  p.lead('t-l', 'Thousands of mortgage professionals trust PropertyRadar to help them take their business to the next level.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'I used to spend thousands on leads that converted at maybe 1%. With PropertyRadar, I\'m targeting equity-rich homeowners who are actually in a position to act. My conversion rate has tripled and my cost per closed loan has dropped dramatically.',
    author: 'Davis Nicart',
    role: 'Loan Officer, E Mortgage Capital',
    elementStyles: {
      quote: { color: T.INK, fontFamily: T.PF, fontSize: '1.1875rem', fontStyle: 'italic', lineHeight: '1.7' },
      author: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      role: { color: T.GREEN_D },
    },
  },
]));

// 6. CTA
p.add(p.ctaBlock({
  title: 'Ready to Own Your Market?',
  description: 'Get instant access to property and homeowner information to level up your mortgage marketing today.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See Mortgage Plays', secondaryButtonUrl: '/plays/mortgage-pros',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for/mortgage-pros',
  title: 'Build Your Pipeline of Qualified Borrowers | PropertyRadar for Mortgage Pros',
  seoTitle: 'Build Your Pipeline of Qualified Borrowers | Effective Marketing Strategies | PropertyRadar',
  seoDescription: 'Build a steady pipeline of qualified borrowers with PropertyRadar\'s targeted marketing tools and strategies tailored for mortgage professionals. Start your free trial today.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
