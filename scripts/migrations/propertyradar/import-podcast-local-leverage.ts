/**
 * Import PropertyRadar /learn/local-leverage-podcast page.
 * Run: npx tsx scripts/migrations/propertyradar/import-podcast-local-leverage.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero (dark) ────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'The Local Leverage Podcast',
  subtitle: 'PRESENTED BY PROPERTYRADAR',
  description: 'Your go-to guide for smarter, faster, and more confident growth. Actionable insights and real stories on lead generation, marketing, and building your local business.',
  ctaText: 'Listen Now', ctaLink: 'https://youtube.com/propertyradar',
  secondaryCtaText: 'Try PropertyRadar Free', secondaryCtaLink: '/register',
  minHeight: '60vh',
}));

// ── About the show (white) ─────────────────────────────────────────────────────
p.add(p.section('sec-about', T.WHITE, 96, [
  p.overline('ab-ov', 'ABOUT THE SHOW'),
  p.heading('ab-h', 'Pull back the curtain on what actually works'),
  p.lead('ab-l', 'Local Leverage tackles the biggest questions around growth, lead generation, and the real challenges of building your business. We deliver actionable insights and real stories from professionals who have found the formulas that work — and share the ones that didn\'t.'),
  p.spacer('ab-sp', 'md'),
  {
    id: 'features-grid', type: 'services-grid', order: p.ord(), columns: 3, accentColor: T.GREEN,
    services: [
      {
        id: 'f1', title: 'Real Stories',
        description: 'Hear directly from professionals who have built thriving local businesses using smart data and marketing.',
        icon: 'record_voice_over',
      },
      {
        id: 'f2', title: 'Actionable Insights',
        description: 'Every episode delivers specific strategies you can put into practice immediately — no fluff, just results.',
        icon: 'insights',
      },
      {
        id: 'f3', title: 'What Doesn\'t Work',
        description: 'We pull back the curtain on common mistakes and failures so you can skip the hard lessons.',
        icon: 'tips_and_updates',
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

// ── Featured episode / dark moment ────────────────────────────────────────────
p.add(p.section('sec-featured', T.NAVY, 112, [
  p.overline('fe-ov', 'FEATURED EPISODE', T.GREEN),
  {
    id: 'fe-h', type: 'heading', order: p.ord(), content: 'Watch the Latest Episode', level: 2, alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'fe-sub', type: 'text', order: p.ord(),
    content: 'New episodes drop regularly featuring local business owners, real estate professionals, and growth experts.',
    alignment: 'center',
    style: { color: 'rgba(255,255,255,0.72)', fontFamily: T.PF, fontSize: '1.0625rem', lineHeight: '1.7', textAlign: 'center', maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto', marginBottom: '32px' },
  },
  {
    id: 'yt-embed', type: 'youtube',
    order: p.ord(),
    url: 'https://www.youtube.com/propertyradar',
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── Where to listen (tint) ─────────────────────────────────────────────────────
p.add(p.section('sec-listen', T.TINT, 96, [
  p.overline('li-ov', 'WHERE TO LISTEN'),
  p.heading('li-h', 'Find Local Leverage on all major platforms'),
  p.lead('li-l', 'Subscribe and never miss an episode — available everywhere you listen.'),
  p.spacer('li-sp', 'md'),
  {
    id: 'platforms', type: 'card-grid', order: p.ord(), columns: 4,
    cards: [
      {
        id: 'p1', title: 'Apple Podcasts',
        description: 'Subscribe on Apple Podcasts.',
        icon: 'podcasts',
        link: 'https://podcasts.apple.com/',
        linkText: 'Listen on Apple',
      },
      {
        id: 'p2', title: 'Spotify',
        description: 'Stream on Spotify.',
        icon: 'graphic_eq',
        link: 'https://open.spotify.com/',
        linkText: 'Listen on Spotify',
      },
      {
        id: 'p3', title: 'YouTube',
        description: 'Watch video episodes.',
        icon: 'smart_display',
        link: 'https://youtube.com/propertyradar',
        linkText: 'Watch on YouTube',
      },
      {
        id: 'p4', title: 'Amazon Music',
        description: 'Available on Amazon Music.',
        icon: 'library_music',
        link: 'https://music.amazon.com/',
        linkText: 'Listen on Amazon',
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

// ── Cross-promo for Data-Driven podcast (white) ────────────────────────────────
p.add(p.section('sec-crosspromo', T.WHITE, 72, [
  p.overline('cp-ov', 'ALSO FROM PROPERTYRADAR'),
  p.heading('cp-h', 'Looking for the Data-Driven Real Estate Podcast?'),
  p.lead('cp-l', 'Hosted by Sean O\'Toole and Aaron Norris, this podcast goes deep on the data and strategies driving successful real estate businesses.'),
  p.spacer('cp-sp', 'sm'),
  p.button('cp-btn', 'Listen Here', '/data-driven-real-estate-podcast', 'outline'),
]));

// ── CTA ────────────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Put your local market knowledge to work',
  description: 'PropertyRadar gives you the property data and owner intelligence to act on what you learn from every episode.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'learn/local-leverage-podcast',
  title: 'Local Leverage Podcast | PropertyRadar',
  seoTitle: 'Local Leverage Podcast | Grow Your Local Business',
  seoDescription: 'Local Leverage is the podcast that helps you grow your business with actionable insights, real stories, and proven strategies for local lead generation.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
