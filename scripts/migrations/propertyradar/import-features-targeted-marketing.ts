/**
 * Import PropertyRadar /features/targeted-marketing page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-targeted-marketing.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'Win with Targeted Outbound Marketing',
  subtitle: 'MULTI-CHANNEL MARKETING',
  description: 'PropertyRadar turns hyperlocal property and owner data into targeted outbound marketing that finds the right people, in the right places, at the right time — automatically.',
  ctaText: 'Start Free Trial', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Better Results section (white)
p.add(p.section('sec-better', T.WHITE, 96, [
  {
    id: 'better-fc', type: 'featured-content', order: p.ord(),
    title: 'Better results for less money',
    overline: 'PRECISE AUDIENCES',
    description: 'PropertyRadar helps you build precise, high-intent audiences so every marketing dollar goes toward people most likely to become high-value customers. Use the industry\'s best list builder to create hyperlocal lead lists from millions of properties and owners in just a few clicks.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/Targeted%20Marketing.png?width=1260&height=1220&name=Targeted%20Marketing.png',
    imagePosition: 'right',
    imageAlt: 'Targeted Marketing platform',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// Marketing channels grid (tint)
p.add(p.section('sec-channels', T.TINT, 96, [
  p.overline('ch-ov', 'AVAILABLE CHANNELS'),
  p.heading('ch-h', 'Every channel you need, in one platform'),
  p.lead('ch-l', 'Coordinate direct mail, email, phone, SMS, online ads, and door knocking in one platform so your brand shows up everywhere your best prospects are.'),
  p.spacer('ch-sp', 'md'),
  {
    id: 'channels-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'ch1', title: 'Direct Mail', icon: 'mail',
        description: 'Design, personalize, and send high-impact postcards to individuals or entire lists. Next-business-day first-class mailing with intelligent mail tracking.',
      },
      {
        id: 'ch2', title: 'Email Marketing', icon: 'email',
        description: 'Send branded, AI-written, personalized emails from the same platform you use to build lists. Deep personalization with property and owner data.',
      },
      {
        id: 'ch3', title: 'Display Ads', icon: 'ads_click',
        description: 'Run hyper-targeted digital ad campaigns mirroring your lists. High match rates, top-tier sites, guaranteed impressions, or your money back.',
      },
      {
        id: 'ch4', title: 'Phone Outreach', icon: 'phone',
        description: 'Built-in phone numbers for millions of owners. Click-to-call, optional power dialer, AI-powered call scripts, and DNC/blacklist screening.',
      },
      {
        id: 'ch5', title: 'SMS / Text', icon: 'sms',
        description: 'Targeted SMS for your sphere and warm leads. One-to-one and one-to-many messaging, personalized and coordinated with other channels.',
      },
      {
        id: 'ch6', title: 'Door Knocking', icon: 'knock',
        description: 'Built-in routing, prospect research before you knock, notes and photos on the fly, and progress tracking over time.',
      },
      {
        id: 'ch7', title: 'Social Media', icon: 'share',
        description: 'Turn your lists into social audiences and content ideas. Export custom audiences for ads and reinforce your other marketing channels.',
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

// Automation moment (dark navy)
p.add(p.section('sec-automation', T.NAVY, 116, [
  {
    id: 'auto-fc', type: 'featured-content', order: p.ord(),
    title: 'Automated marketing while you sleep',
    overline: 'MARKETING AUTOMATION',
    description: 'Turn dynamic lists and triggers into always-on campaigns that react to new opportunities the moment they appear — no manual effort required. Be first to contact motivated owners with timely, relevant messages the moment their situation changes, beating slower, manual competitors.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/Marketing%20Automation.png?width=1260&height=1252&name=Marketing%20Automation.png',
    imagePosition: 'left',
    imageAlt: 'Marketing automation workflows',
    buttonText: 'Start Free Trial',
    buttonUrl: '/register',
    elementStyles: {
      overline: { color: T.GREEN, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700' },
      description: { color: 'rgba(255,255,255,0.72)' },
      button: { color: T.NAVY, fontWeight: '600' },
    },
  },
], {}, {
  backgroundColor: T.NAVY,
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// AI + Why choose section (white)
p.add(p.section('sec-ai', T.WHITE, 96, [
  p.overline('ai-ov', 'WHY CHOOSE PROPERTYRADAR MARKETING'),
  p.heading('ai-h', 'Built for cold outreach at any scale'),
  p.lead('ai-l', 'Get world-class property and owner data, dynamic lists, and built-in multi-channel marketing in a single platform built for small, local businesses.'),
  p.spacer('ai-sp', 'md'),
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      { id: 'wm1', title: 'Designed for Cold Outreach', icon: 'send', description: 'Every channel and workflow is built for proactive outreach — not waiting for inbound leads.' },
      { id: 'wm2', title: 'Fully Integrated', icon: 'integration_instructions', description: 'Not pieced together from separate tools. Data, lists, and marketing work together seamlessly in one platform.' },
      { id: 'wm3', title: 'Automation That Scales You Up', icon: 'rocket_launch', description: 'Design campaigns once and let PropertyRadar continuously monitor lists, fire sequences, and keep your pipeline full.' },
      { id: 'wm4', title: 'Deep Personalization from Deep Data', icon: 'auto_awesome', description: 'AI tailors copy and timing to the context of the property, owner, and event for higher response rates.' },
      { id: 'wm5', title: 'Built for Small Teams', icon: 'groups', description: 'No agency, no big budget needed. Start small, learn fast, and scale campaigns on your terms with no minimums.' },
      { id: 'wm6', title: 'Know Your Audience', icon: 'insights', description: 'Instant audience snapshots reveal demographics, equity, property traits, and life-event signals for every list.' },
    ],
    elementStyles: {
      serviceTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: T.INK },
      serviceIcon: { color: T.GREEN },
      card: cardOnLight,
    },
  },
]));

// Final CTA
p.add(p.ctaBlock({
  title: 'Your next deal is waiting',
  description: 'Join thousands of real estate pros who use PropertyRadar to reach the right owners first with targeted, automated outreach.',
  primaryButtonText: 'Start Free Trial', primaryButtonUrl: '/register',
  secondaryButtonText: 'See all features', secondaryButtonUrl: '/features',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/targeted-marketing',
  title: 'Targeted Marketing | PropertyRadar',
  seoTitle: 'Targeted Marketing | Improve your Marketing ROI | PropertyRadar',
  seoDescription: 'Targeted marketing connects you to the right prospects through direct mail, email, phone, and display ads, maximizing efficiency and results.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
