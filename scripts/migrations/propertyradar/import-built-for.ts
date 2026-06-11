/**
 * Import PropertyRadar /built-for overview page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// 1. Hero — dark navy with green glow
p.add(p.hero({
  title: 'Built to Support Your Business Growth',
  subtitle: 'WHO WE SERVE',
  description: 'Since 2007, PropertyRadar has been helping agents, investors, mortgage and home service pros grow their businesses and achieve their goals. How can we help you?',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// 2. Audience grid — services-grid on WHITE
p.add(p.section('sec-audiences', T.WHITE, 96, [
  {
    id: 'aud-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'WHO USES PROPERTYRADAR', title: 'Everything you need to dominate your market',
    description: 'From investors to service pros, PropertyRadar gives every local business the data edge that used to be reserved for national brands.',
    accentColor: T.GREEN,
    services: [
      {
        id: 'aud-1', title: 'Real Estate Investors',
        description: 'Whether you wholesale, fix & flip, or buy & hold, we deliver motivated sellers, quality due diligence, and cash-buyers to close more deals.',
        icon: 'trending_up', link: '/built-for/real-estate-investors', linkText: 'Find Deals Now',
      },
      {
        id: 'aud-2', title: 'Residential Agents',
        description: 'Find likely-to-sell owners, win expired listings, connect at key life events, and leverage your sphere to become the market leader.',
        icon: 'home_work', link: '/built-for/residential-agents', linkText: 'Get More Listings',
      },
      {
        id: 'aud-3', title: 'Commercial Agents',
        description: 'Know your market, identify the owner behind the LLC, and uncover distressed assets to become the dominant player in your submarket.',
        icon: 'apartment', link: '/built-for/commercial-agents', linkText: 'Win More Clients',
      },
      {
        id: 'aud-4', title: 'Mortgage Pros',
        description: 'Generate your own leads and enrich purchased leads to increase loan volume and prioritize the best prospects.',
        icon: 'account_balance', link: '/built-for/mortgage-pros', linkText: 'Close More Loans',
      },
      {
        id: 'aud-5', title: 'Home & Property Services',
        description: 'Whether you\'re a Roofer, Solar, HVAC, Moving & Storage, Property Manager, or similar, opportunity is knocking.',
        icon: 'handyman', link: '/built-for/service-pros', linkText: 'Grow Your Business',
      },
      {
        id: 'aud-6', title: 'Media, Government & More',
        description: 'The media, government agencies, law enforcement, and many others have trusted PropertyRadar for 20 years.',
        icon: 'public', link: '/about', linkText: 'Learn More',
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

// 3. Why PropertyRadar differentiators — dark navy moment
p.add(p.section('sec-why', T.NAVY, 116, [
  p.overline('why-ov', 'WHY PROPERTYRADAR', T.GREEN),
  p.heading('why-h', 'The data advantage that changes everything', 2, T.WHITE),
  p.lead('why-l', 'While others sell you recycled, shared leads, PropertyRadar puts the full power of property and owner data directly in your hands — no middlemen, no shared lists, no surprises.', 'rgba(255,255,255,0.72)'),
  p.spacer('why-sp', 'lg'),
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 2,
    accentColor: T.GREEN,
    services: [
      {
        id: 'w1', title: 'Exclusive, Unshared Data',
        description: 'Build lists no one else has. Your criteria, your filters, your proprietary lead source — competitors can\'t copy what they can\'t see.',
        icon: 'lock',
      },
      {
        id: 'w2', title: '20 Years of Data Quality',
        description: 'We\'ve been obsessing over property and owner data accuracy since 2007. The result: the most reliable property intelligence in the industry.',
        icon: 'verified',
      },
      {
        id: 'w3', title: 'Multi-Channel Marketing Built In',
        description: 'Direct mail, email, digital ads, cold call lists — all in one platform. No stitching together five different tools to run a single campaign.',
        icon: 'campaign',
      },
      {
        id: 'w4', title: 'Ready-to-Run Playbooks',
        description: 'Proven marketing strategies built specifically for your role. Choose a play, customize, hit send, and automate — from fresh idea to running campaign in minutes.',
        icon: 'auto_awesome',
      },
    ],
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700' },
      serviceTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: 'rgba(255,255,255,0.72)' },
      serviceIcon: { color: T.GREEN },
      card: {
        backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: '1px',
        borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px',
        customCSS: 'transition:all .3s ease',
      },
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 4. Social proof stats — tint section
p.add(p.section('sec-stats', T.TINT, 96, [
  p.overline('st-ov', 'THE NUMBERS'),
  p.heading('st-h', 'Trusted by thousands of local businesses'),
  p.spacer('st-sp', 'md'),
  {
    id: 'stats', type: 'stats', order: p.ord(), columns: 4,
    stats: [
      { id: 's1', value: '$250B+', label: 'Completed Transactions' },
      { id: 's2', value: '3X', label: 'Marketing ROI' },
      { id: 's3', value: '160M+', label: 'Properties Tracked' },
      { id: 's4', value: '1B+', label: 'Phones & Emails' },
    ],
    elementStyles: {
      statValue: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4vw,3.25rem)', letterSpacing: '-0.02em' },
      statLabel: { color: T.INK, fontWeight: '500', letterSpacing: '0.02em' },
    },
  },
]));

// 5. Testimonial — white
p.add(p.section('sec-testimonial', T.WHITE, 96, [
  p.overline('t-ov', 'DON\'T TAKE OUR WORD FOR IT'),
  p.heading('t-h', 'Thousands trust PropertyRadar to grow their business'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'PropertyRadar completely changed how I find deals. The data quality and targeted marketing tools have helped me close more off-market deals than I ever thought possible. I can\'t imagine running my business without it.',
    author: 'Henish Pulickal',
    role: 'Real Estate Investor',
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
  description: 'Join thousands of professionals who trust PropertyRadar to grow their business.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for',
  title: 'Built to Support Your Business Growth',
  seoTitle: 'Unlock Business Growth | Targeted Marketing Solutions | PropertyRadar',
  seoDescription: 'Discover how PropertyRadar empowers agents, investors, and service professionals with targeted insights and tools to drive business growth and achieve success since 2007.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
