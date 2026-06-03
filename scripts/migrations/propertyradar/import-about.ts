/**
 * Import PropertyRadar /about page. Run: npx tsx scripts/migrations/propertyradar/import-about.ts
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

p.add(p.hero({
  title: 'Finding Value in Public Records',
  subtitle: 'ABOUT PROPERTYRADAR',
  description: 'We give small, local property businesses the same data firepower the national brands have had all along — turning public records into an everyday growth engine.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '64vh',
}));

// Mission / origin story
p.add(p.section('sec-mission', T.WHITE, 96, [
  p.overline('mi-ov', 'OUR MISSION'),
  p.heading('mi-h', 'Empowering small businesses through property data'),
  p.lead('mi-l', 'Every day, small and local businesses compete with national brands that have entire teams dedicated to data, marketing, and technology. PropertyRadar exists to level that playing field.'),
  p.spacer('mi-sp', 'md'),
  p.text('mi-1', 'Like a lot of great small-business stories, PropertyRadar started with a real problem and a scrappy solution. In 2002, our founder — real estate investor and technologist Sean O’Toole — realized the answers he needed weren’t in expensive reports or insider networks. They were sitting in public records, if only someone could make them usable.', T.INK, 'center', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' }),
  p.text('mi-2', 'If public records could help one investor make better decisions, they could help thousands of professionals and small businesses. Big-box brands have long used public data to figure out who you are, what you own, and when you might need their services. We set out to put that same power in your hands.', T.INK, 'center', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto', marginTop: '16px' }),
]));

// Innovation timeline (dark moment)
p.add(p.section('sec-timeline', T.NAVY, 116, [
  {
    id: 'tl', type: 'timeline', order: p.ord(), layout: 'alternating',
    overline: 'INNOVATION TIMELINE', title: 'From foreclosures to full property insight',
    subtitle: 'Two decades of bringing clarity to public records.',
    lineColor: 'rgba(56,203,137,0.4)', numberColor: T.NAVY, nodeColor: T.GREEN,
    steps: [
      { id: 'y1', number: '2002', title: 'Discovery & early tools', description: 'Sean O’Toole begins turning messy public records into usable insight for real estate investors.' },
      { id: 'y2', number: '2007', title: 'ForeclosureRadar launches', description: 'The first platform to bring unprecedented transparency to foreclosure activity during one of the toughest markets in history.' },
      { id: 'y3', number: '2008', title: 'The go-to foreclosure resource', description: 'Investors, agents, journalists, and government agencies rely on our accuracy as the new standard.' },
      { id: 'y4', number: '2013', title: 'PropertyRadar is born', description: 'We expand from distressed properties to every property — owner data, demographics, and dozens of signals.' },
      { id: 'y5', number: 'Today', title: 'Hyperlocal lead generation', description: 'A complete platform: the best data, built-in multi-channel marketing, and automation — priced for small teams, not enterprises.' },
    ],
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em' },
      subtitle: { color: 'rgba(255,255,255,0.72)' },
      stepTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      stepDescription: { color: 'rgba(255,255,255,0.72)' },
    },
  },
]));

// Values
p.add(p.section('sec-values', T.TINT, 96, [
  {
    id: 'vals', type: 'services-grid', order: p.ord(), columns: 2, accentColor: T.GREEN,
    overline: 'WHAT WE STAND FOR', title: 'Our values',
    description: 'The principles that have guided us for 20 years.',
    services: [
      { id: 'v1', title: 'Empowering local businesses', description: 'We build tools and pricing for small, local teams — not giant enterprises — so you can compete and win.', icon: 'storefront' },
      { id: 'v2', title: 'Transparency in data', description: 'Public records belong to the public. We make them clear, accurate, and usable for everyone.', icon: 'visibility' },
      { id: 'v3', title: 'Being a good neighbor', description: 'We believe in doing right by property owners and the communities our customers serve.', icon: 'volunteer_activism' },
      { id: 'v4', title: 'Innovation for everyone', description: 'We relentlessly improve so the smallest business has access to the best data and marketing technology.', icon: 'lightbulb' },
    ],
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLightImport(),
    },
  },
]));

function cardOnLightImport() {
  return { backgroundColor: T.WHITE, borderWidth: '1px', borderColor: T.LINE, borderStyle: 'solid', borderRadius: '16px', customCSS: 'box-shadow:0 10px 40px rgba(10,31,68,0.06);transition:all .3s ease' };
}

// Final CTA
p.add(p.ctaBlock({
  title: 'Join us in leveling the playing field',
  description: 'Whether you want to grow your business or partner with us — let’s connect.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'Partner with us', secondaryButtonUrl: '/partner',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'about', title: 'About PropertyRadar',
  seoTitle: 'Empowering Small Businesses With Property Data | PropertyRadar',
  seoDescription: "Empower your small business with PropertyRadar's powerful property data and marketing tools, designed to help you thrive in a competitive market.",
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
