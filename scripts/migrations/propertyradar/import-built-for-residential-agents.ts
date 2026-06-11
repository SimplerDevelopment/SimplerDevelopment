/**
 * Import PropertyRadar /built-for/residential-agents page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for-residential-agents.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const PASTEL = T.PASTEL.res; // #A1DDBD mint

const p = makePage();

// 1. Hero — dark navy
p.add(p.hero({
  title: 'End the Zillow Tax. Generate Your Own Leads.',
  subtitle: 'RESIDENTIAL AGENTS',
  description: 'Stop paying Zillow for expensive referral leads. Reach the right homeowners at the right moment with hyper-local targeting, proven campaigns, and advanced automation. No middlemen, no shared leads, no commission fees.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'Explore Agent Plays', secondaryCtaLink: '/plays/residential-agents',
  minHeight: '64vh',
}));

// 2. Problem/solution — WHITE with featured-content
p.add(p.section('sec-success', T.WHITE, 96, [
  p.overline('su-ov', 'WHAT SUCCESS LOOKS LIKE'),
  p.heading('su-h', 'A consistent flow of new listings — without the Zillow bill'),
  p.lead('su-l', 'Successful agents use PropertyRadar to generate a consistent flow of new listings and power their growth. Our proven marketing strategies will take you from zero to hero.'),
  p.spacer('su-sp', 'lg'),
  {
    id: 'su-fc', type: 'featured-content', order: p.ord(),
    layout: 'image-right',
    title: 'Find likely-to-sell homeowners before they call anyone',
    description: 'Your experience is better than any algorithm. You know why owners sell in your market — and PropertyRadar has the data to connect you with them. Target by equity, time in home, life events, and dozens of other signals to surface leads your competition can\'t reach.',
    features: [
      { id: 'f1', text: 'Likely-to-sell signals: equity, hold period, life events' },
      { id: 'f2', text: 'Expired and withdrawn listing targeting' },
      { id: 'f3', text: 'Geo-farming tools to establish neighborhood dominance' },
      { id: 'f4', text: 'Sphere marketing to stay top of mind with your network' },
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

// 3. Value props grid — TINT with mint accents
p.add(p.section('sec-howwin', T.TINT, 96, [
  {
    id: 'howwin-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'HOW AGENTS WIN', title: 'Every listing strategy. One platform.',
    accentColor: PASTEL,
    services: [
      { id: 'vp1', title: 'Likely to Sell Opportunities', description: 'Target owners in your market most likely to sell — using equity, hold period, and life signals you actually understand.', icon: 'sell', link: '/plays/residential-agents/likely-sellers', linkText: 'Run the Play' },
      { id: 'vp2', title: 'Win Expired Listings', description: 'Engage homeowners whose listings failed to sell. When it expires, the seller wasn\'t the problem — you just weren\'t their agent yet.', icon: 'timer_off', link: '/plays/residential-agents/expired-listings', linkText: 'Run the Play' },
      { id: 'vp3', title: 'Life Event Connections', description: 'Divorce, death, and life transitions often require selling. Show up with guidance when they need it most to earn their business.', icon: 'favorite', link: '/plays/residential-agents', linkText: 'See the Plays' },
      { id: 'vp4', title: 'Help Distressed Owners', description: 'Foreclosures, liens, evictions, and tax delinquencies often result in a sale. Offer empathy and expertise to help them move on.', icon: 'shield', link: '/plays/residential-agents', linkText: 'See the Plays' },
      { id: 'vp5', title: 'Strategic GeoFarming', description: 'Find a market where you can be the dominant agent by affordably establishing brand recognition in a focused geography.', icon: 'location_on', link: '/plays/residential-agents/strategic-geofarming', linkText: 'Run the Play' },
      { id: 'vp6', title: 'Circle Marketing', description: 'Just sold, just listed, and open house marketing work because they work. PropertyRadar helps you do them faster and better.', icon: 'circle_notifications', link: '/plays/residential-agents/circle-marketing', linkText: 'Run the Play' },
      { id: 'vp7', title: 'Sphere Marketing', description: 'Stay top-of-mind with friends, family, past clients, neighbors, and your local community — your most valuable referral network.', icon: 'group', link: '/plays/residential-agents/sphere-marketing', linkText: 'See the Plays' },
      { id: 'vp8', title: 'Buyer Needs Marketing', description: 'Reach homeowners every time you have a buyer. Wow them with an off-market option — and let sellers know you have buyers.', icon: 'search_home', link: '/plays/residential-agents/buyer-needs', linkText: 'Learn More' },
      { id: 'vp9', title: 'Local Market Expert', description: 'Establish yourself as the go-to real estate market expert with data that answers the questions buyers and sellers are asking.', icon: 'bar_chart', link: '/features/real-estate-tools', linkText: 'Learn More' },
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
  p.overline('pl-ov', 'AGENT PLAYBOOK', T.GREEN),
  p.heading('pl-h', 'The Playbook to Grow Your Real Estate Business', 2, T.WHITE),
  p.lead('pl-l', 'A PropertyRadar Play is a ready-to-send marketing strategy: a targeted list, branded templates, and the ideal channel to maximize engagement.', 'rgba(255,255,255,0.72)'),
  p.spacer('pl-sp', 'md'),
  {
    id: 'plays-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      { id: 'pl1', title: 'Likely Sellers', description: 'Target owners most likely to sell in your market using equity, hold time, and life signals.', icon: 'sell', link: '/plays/residential-agents/likely-sellers', linkText: 'Run the Play' },
      { id: 'pl2', title: 'Expired Listings', description: 'Re-engage owners whose listings failed. You weren\'t their agent — until now.', icon: 'timer_off', link: '/plays/residential-agents/expired-listings', linkText: 'Run the Play' },
      { id: 'pl3', title: 'Strategic GeoFarming', description: 'Dominate a neighborhood with consistent, affordable brand presence that turns you into the market leader.', icon: 'location_on', link: '/plays/residential-agents/strategic-geofarming', linkText: 'Run the Play' },
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
  p.button('pl-btn', 'Explore All Agent Plays', '/plays/residential-agents', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 5. Testimonial — TINT
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'RESIDENTIAL AGENTS TRUST PROPERTYRADAR'),
  p.heading('t-h', 'Agents crushing it with PropertyRadar'),
  p.lead('t-l', 'Thousands of residential agents and teams trust PropertyRadar to take their business to the next level and win more listings.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'PropertyRadar helped me end my dependence on paid leads entirely. I built my own prospecting system targeting expired listings and geo-farm neighborhoods, and now I have more listings than I can handle — at a fraction of what I was paying Zillow.',
    author: 'John Slater',
    role: 'Residential Agent',
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
  description: 'Get instant access to property and homeowner information to level up your real estate marketing today.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See Agent Plays', secondaryButtonUrl: '/plays/residential-agents',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for/residential-agents',
  title: 'End the Zillow Tax. Generate Your Own Leads. | PropertyRadar for Residential Agents',
  seoTitle: 'End Zillow Tax | Generate Leads with PropertyRadar',
  seoDescription: 'End reliance on costly referral leads. Use PropertyRadar to generate exclusive listings through targeted marketing, advanced automation, and data-driven strategies for sustained growth.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
