/**
 * Import PropertyRadar /data-driven-real-estate-podcast page.
 * Run: npx tsx scripts/migrations/propertyradar/import-podcast-data-driven.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero (dark) ────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'The Data-Driven Real Estate Podcast',
  subtitle: 'PODCAST',
  description: 'For real estate professionals dedicated to driving success in their business using data — hosted by Aaron Norris and Sean O\'Toole.',
  ctaText: 'Join the Community', ctaLink: 'https://community.propertyradar.com/',
  secondaryCtaText: 'Try PropertyRadar Free', secondaryCtaLink: '/register',
  minHeight: '60vh',
}));

// ── About the show (white) ─────────────────────────────────────────────────────
p.add(p.section('sec-about', T.WHITE, 96, [
  p.overline('ab-ov', 'ABOUT THE SHOW'),
  p.heading('ab-h', 'Insights that move markets — and your business'),
  p.lead('ab-l', 'The Data-Driven Real Estate Podcast goes deep on the numbers, trends, and strategies that successful real estate professionals use every day. Hosted by PropertyRadar\'s own Aaron Norris and Sean O\'Toole, every episode gives you actionable intelligence you can put to work immediately.'),
  p.spacer('ab-sp', 'lg'),
  {
    id: 'hosts', type: 'services-grid', order: p.ord(), columns: 2, accentColor: T.GREEN,
    overline: 'PODCAST HOSTS', title: 'Meet Aaron & Sean',
    services: [
      {
        id: 'h1', title: 'Aaron Norris',
        description: 'VP of Market Insights at PropertyRadar. Aaron writes on real estate and technology for Forbes, Think Realty, and BiggerPockets. He speaks nationally on housing trends, ADUs, and data-driven growth.',
        icon: 'person',
      },
      {
        id: 'h2', title: 'Sean O\'Toole',
        description: 'CEO & Founder of PropertyRadar. Sean launched ForeclosureRadar in 2007, before anyone had heard of the foreclosure crisis, and has spent 20+ years turning public records into competitive advantage.',
        icon: 'person',
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

// ── Where to listen (tint) ─────────────────────────────────────────────────────
p.add(p.section('sec-listen', T.TINT, 96, [
  p.overline('li-ov', 'WHERE TO LISTEN'),
  p.heading('li-h', 'Subscribe on your favorite platform'),
  p.lead('li-l', 'New episodes every week. Subscribe wherever you listen to podcasts.'),
  p.spacer('li-sp', 'md'),
  {
    id: 'platforms', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      {
        id: 'p1', title: 'Apple Podcasts',
        description: 'Stream and subscribe on Apple Podcasts for the latest episodes.',
        icon: 'podcasts',
        link: 'https://podcasts.apple.com/us/podcast/data-driven-real-estate/id1501458856',
        linkText: 'Listen on Apple',
      },
      {
        id: 'p2', title: 'Spotify',
        description: 'Find us on Spotify and never miss an episode drop.',
        icon: 'graphic_eq',
        link: 'https://open.spotify.com/show/4LUxRMVfNiCaEWPmWYKPXr',
        linkText: 'Listen on Spotify',
      },
      {
        id: 'p3', title: 'YouTube',
        description: 'Watch full-length video episodes and shorts on our YouTube channel.',
        icon: 'smart_display',
        link: 'https://youtube.com/propertyradar',
        linkText: 'Watch on YouTube',
      },
    ],
    elementStyles: {
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      description: { color: T.INK },
      icon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// ── Featured episode / dark moment (navy) ──────────────────────────────────────
p.add(p.section('sec-featured', T.NAVY, 112, [
  p.overline('fe-ov', 'FEATURED EPISODE', T.GREEN),
  {
    id: 'fe-h', type: 'heading', order: p.ord(), content: 'Watch a Recent Episode', level: 2, alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'fe-sub', type: 'text', order: p.ord(),
    content: 'Catch the latest conversations with real estate data insiders, market researchers, and successful professionals.',
    alignment: 'center',
    style: { color: 'rgba(255,255,255,0.72)', fontFamily: T.PF, fontSize: '1.0625rem', lineHeight: '1.7', textAlign: 'center', maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto', marginBottom: '32px' },
  },
  {
    id: 'yt-embed', type: 'youtube',
    order: p.ord(),
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── Invite to speak (white) ────────────────────────────────────────────────────
p.add(p.section('sec-speak', T.WHITE, 72, [
  p.overline('sp-ov', 'SPEAKING & GUESTS'),
  p.heading('sp-h', 'Invite Aaron or Sean to your event or podcast'),
  p.lead('sp-l', 'Both hosts are available for keynotes, panel sessions, and guest podcast appearances on real estate technology, housing data, and market trends.'),
  p.spacer('sp-sp', 'sm'),
  p.button('sp-btn', 'Contact Us to Book', '/support', 'primary'),
]));

// ── CTA ────────────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Turn data into deals',
  description: 'Join thousands of real estate professionals using PropertyRadar to find motivated property owners and grow their business.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'data-driven-real-estate-podcast',
  title: 'Data-Driven Real Estate Podcast',
  seoTitle: 'Data Driven Real Estate Podcast | PropertyRadar',
  seoDescription: 'The podcast for real estate professionals dedicated to driving success in their business using data. Hosted by Aaron Norris and Sean O\'Toole of PropertyRadar.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
