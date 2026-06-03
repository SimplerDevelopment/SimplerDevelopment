/**
 * Import PropertyRadar /built-for/service-pros page.
 * Run: npx tsx scripts/migrations/propertyradar/import-built-for-service-pros.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const PASTEL = T.PASTEL.svc; // #F5C97B amber

const p = makePage();

// 1. Hero — dark navy
p.add(p.hero({
  title: 'Stop Paying For Leads. Generate Your Own.',
  subtitle: 'HOME & PROPERTY SERVICES',
  description: 'Stop paying for expensive referral leads. Reach the right home and property owners at the right moment with hyper-local targeting, proven campaigns, and advanced automation. No middlemen, no shared leads, no high fees.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'Explore Service Pro Plays', secondaryCtaLink: '/plays/service-pros',
  minHeight: '64vh',
}));

// 2. Problem/solution — WHITE with featured-content
p.add(p.section('sec-success', T.WHITE, 96, [
  p.overline('su-ov', 'WHAT SUCCESS LOOKS LIKE'),
  p.heading('su-h', 'A consistent flow of new jobs — without the Angi bill'),
  p.lead('su-l', 'Successful service pros use PropertyRadar to generate a consistent flow of new business and power their growth. Our proven marketing strategies will take you from zero to hero.'),
  p.spacer('su-sp', 'lg'),
  {
    id: 'su-fc', type: 'featured-content', order: p.ord(),
    layout: 'image-right',
    title: 'Find the right homeowners before your competition does',
    description: 'Home services is a race to the right door at the right time. PropertyRadar gives you the property intelligence — year built, equity, ownership duration, recent sales — to know exactly which owners need your services right now, before they\'ve started looking.',
    features: [
      { id: 'f1', text: 'Year-built and aging system data for proactive outreach' },
      { id: 'f2', text: 'New owner targeting for move-in service opportunities' },
      { id: 'f3', text: 'Equity data to find owners funded for big upgrades' },
      { id: 'f4', text: 'Circle marketing to turn one job into three more' },
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

// 3. Value props grid — TINT with amber accents
p.add(p.section('sec-howwin', T.TINT, 96, [
  {
    id: 'howwin-grid', type: 'services-grid', order: p.ord(), columns: 3,
    overline: 'HOW SERVICE PROS WIN', title: 'Every local service strategy. One platform.',
    accentColor: PASTEL,
    services: [
      { id: 'vp1', title: 'Welcome New Owners', description: 'Target new home buyers as soon as escrow closes — when their to-do list is long and they\'re actively looking for trusted pros.', icon: 'home_work', link: '/plays/service-pros/new-owners', linkText: 'Run the Play' },
      { id: 'vp2', title: 'Spot Aging Systems', description: 'Use year-built, years-in-home, and equity data to find properties where roofs, HVAC, plumbing, and core systems are aging out.', icon: 'engineering', link: '/plays/service-pros/aging-homes', linkText: 'Run the Play' },
      { id: 'vp3', title: 'Follow the Equity', description: 'Find owners who recently tapped equity with cash-out refis or HELOCs — primed and funded for remodels, solar, roofing, and pools.', icon: 'trending_up', link: '/plays/service-pros/equity-upgrades', linkText: 'Run the Play' },
      { id: 'vp4', title: 'Weather Event Response', description: 'Target storm-damaged areas by property age and roof type to reach owners with likely damage before competitors flood the area.', icon: 'thunderstorm', link: '/plays/service-pros/weather-events', linkText: 'Run the Play' },
      { id: 'vp5', title: 'Find Tired Landlords', description: 'Find out-of-area owners, vacant rentals, and evictions to offer property management and local services to those who need them most.', icon: 'person_off', link: '/plays/service-pros/out-of-area-owners', linkText: 'Run the Play' },
      { id: 'vp6', title: 'Target Home Sellers', description: 'When a home is listed, inspections, repairs, moving, and storage are in the owner\'s future. Timely data puts you ahead.', icon: 'sell', link: '/plays/service-pros/home-sellers', linkText: 'Run the Play' },
      { id: 'vp7', title: 'Circle Marketing', description: 'Let the neighbors know about the incredible work you did down the street — turn one completed job into your next three deals.', icon: 'circle_notifications', link: '/plays/service-pros/circle-marketing', linkText: 'Run the Play' },
      { id: 'vp8', title: 'Drive for Dollars & Field Sales', description: 'Make it easy for your team in the field to tag opportunities so you can start marketing to them immediately from the truck.', icon: 'directions_car', link: '/features/real-estate-tools', linkText: 'Learn More' },
      { id: 'vp9', title: 'Sphere Marketing', description: 'Market to past clients, friends, family, and community to stay top-of-mind as their go-to service pro for repeat and referral business.', icon: 'group', link: '/plays/service-pros/sphere-marketing', linkText: 'Run the Play' },
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
  p.overline('pl-ov', 'SERVICE PRO PLAYBOOK', T.GREEN),
  p.heading('pl-h', 'The Playbook to Grow Your Local Business', 2, T.WHITE),
  p.lead('pl-l', 'A PropertyRadar Play is a ready-to-send marketing strategy: a targeted list, branded templates, and the ideal channel to maximize engagement.', 'rgba(255,255,255,0.72)'),
  p.spacer('pl-sp', 'md'),
  {
    id: 'plays-grid', type: 'card-grid', order: p.ord(), columns: 3,
    cards: [
      { id: 'pl1', title: 'Welcome New Owners', description: 'Reach new buyers the moment escrow closes — when their home\'s to-do list is longest.', icon: 'home_work', link: '/plays/service-pros/new-owners', linkText: 'Run the Play' },
      { id: 'pl2', title: 'Aging Homes', description: 'Use property age data to reach owners whose roofs, HVAC, and systems are due for replacement.', icon: 'engineering', link: '/plays/service-pros/aging-homes', linkText: 'Run the Play' },
      { id: 'pl3', title: 'Equity Upgrades', description: 'Target owners who just tapped equity and are funded for the big upgrades they\'ve been planning.', icon: 'trending_up', link: '/plays/service-pros/equity-upgrades', linkText: 'Run the Play' },
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
  p.button('pl-btn', 'Explore All Service Pro Plays', '/plays/service-pros', 'primary', { hoverEffect: 'glow' }),
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// 5. Testimonial — TINT
p.add(p.section('sec-testimonial', T.TINT, 96, [
  p.overline('t-ov', 'SERVICE PROS TRUST PROPERTYRADAR'),
  p.heading('t-h', 'Home service professionals growing with PropertyRadar'),
  p.lead('t-l', 'Thousands of home service professionals and small business operators trust PropertyRadar to take their business to the next level.'),
  p.spacer('t-sp', 'md'),
  {
    id: 'testimonial-1', type: 'testimonial', order: p.ord(),
    quote: 'I used to spend $15 a lead on Angi and compete against 5 other contractors. Now I build my own list of homeowners with aging roofs in specific zip codes and mail them before they\'re even searching. My close rate is way up and my cost per job is a fraction of what it was.',
    author: 'Angel Garcia',
    role: 'Founder, Home Services Company',
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
  description: 'Get instant access and start marketing to home and property owners to level up your business today.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See Service Pro Plays', secondaryButtonUrl: '/plays/service-pros',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'built-for/service-pros',
  title: 'Stop Paying For Leads. Generate Your Own. | PropertyRadar for Service Pros',
  seoTitle: 'Generate Your Own Leads | Proven Marketing Strategies | PropertyRadar',
  seoDescription: 'Generate your own leads with PropertyRadar. Utilize targeted marketing strategies and automation to connect with home and property owners for consistent business growth. Start your free trial today.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
