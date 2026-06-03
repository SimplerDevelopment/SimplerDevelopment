/**
 * Import PropertyRadar /features/integrations page.
 * Run: npx tsx scripts/migrations/propertyradar/import-features-integrations.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// Hero
p.add(p.hero({
  title: 'Integrate PropertyRadar with 5,000+ Apps and Services',
  subtitle: 'INTEGRATIONS & AUTOMATION',
  description: 'Connect PropertyRadar\'s property and owner data to over 5,000 sales, marketing, and productivity apps so you can automate outreach, follow-up, and operations in minutes — not months.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '62vh',
}));

// Automation overview (white)
p.add(p.section('sec-overview', T.WHITE, 96, [
  p.overline('ov-ov', 'AUTOMATION TURNS DATA INTO ACTION'),
  p.heading('ov-h', 'Your data, working across every tool you use'),
  p.lead('ov-l', 'As soon as a property or owner matches your criteria, PropertyRadar pushes them straight into your CRM, call list, or marketing platform — no manual entry required.'),
  p.spacer('ov-sp', 'md'),
  {
    id: 'overview-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'ov1', title: 'Trigger Workflows on Changes', icon: 'bolt',
        description: 'Automatically fire actions the moment listings, preforeclosures, ownership, equity, or hundreds of other criteria change.',
      },
      {
        id: 'ov2', title: 'Auto-Sync to Your Pipeline', icon: 'sync_alt',
        description: 'New opportunities flow straight into your CRM, sales pipeline, call list, or marketing platform with no copying and pasting.',
      },
      {
        id: 'ov3', title: 'Deliver the Right Message, Right Now', icon: 'send',
        description: 'Connect your dialer, email, SMS, and direct mail tools so personalized outreach triggers automatically when leads surface.',
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

// No-code setup (tint)
p.add(p.section('sec-nocode', T.TINT, 96, [
  {
    id: 'nocode-fc', type: 'featured-content', order: p.ord(),
    title: 'Fast setup — no code required',
    overline: 'ZAPIER & NATIVE INTEGRATIONS',
    description: 'Launch powerful real estate integrations and automations in minutes, even if you\'re not technical. Connect thousands of apps seamlessly with Zapier. Eliminate exports, imports, and spreadsheet busywork. Or skip the integrations entirely and use PropertyRadar\'s built-in marketing and automation features.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/integrations.png?width=600&height=579&name=integrations.png',
    imagePosition: 'right',
    imageAlt: 'PropertyRadar integrations',
    elementStyles: {
      overline: { color: T.GREEN_D, fontFamily: T.PF, fontWeight: '700', letterSpacing: '0.18em' },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '700' },
      description: { color: T.INK },
    },
  },
]));

// Developer-friendly API (dark navy)
p.add(p.section('sec-api', T.NAVY, 116, [
  {
    id: 'api-fc', type: 'featured-content', order: p.ord(),
    title: 'Developer-friendly when you need it',
    overline: 'WEBHOOKS & API',
    description: 'Tap into powerful webhooks and APIs when you want deeper, custom-built integrations. Use webhooks to send real-time property and owner events directly into your internal databases and proprietary tools. Leverage PropertyRadar\'s API to access rich data, build custom workflows, and power internal applications at scale.',
    imageUrl: 'https://www.propertyradar.com/hs-fs/hubfs/pr/Frame%202087326235%20(1).png?width=694&height=1180&name=Frame%202087326235%20(1).png',
    imagePosition: 'left',
    imageAlt: 'API and webhook integration',
    buttonText: 'Explore the API',
    buttonUrl: '/features/api',
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

// Popular integrations (white)
p.add(p.section('sec-apps', T.WHITE, 96, [
  p.overline('ap-ov', 'POPULAR INTEGRATIONS'),
  p.heading('ap-h', 'The most popular apps to integrate with PropertyRadar'),
  p.lead('ap-l', 'Connect PropertyRadar to these and other popular sales, marketing, and productivity apps your team depends on — keep everything working together in real time.'),
  p.spacer('ap-sp', 'md'),
  {
    id: 'apps-grid', type: 'services-grid', order: p.ord(), columns: 3,
    accentColor: T.GREEN,
    services: [
      {
        id: 'ap1', title: 'Print & Direct Mail', icon: 'local_post_office',
        description: 'PrintGenie, Addressable, YellowLetterHQ, Click2Mail, PostcardMania, Handwrytten, Thanks.io, Lob — automate physical mail campaigns.',
      },
      {
        id: 'ap2', title: 'Phone, Voicemail & SMS', icon: 'phone_in_talk',
        description: 'Slybroadcast, Mojo, ClickSend, CallFire — turn your lists into active call and text campaigns with minimal manual effort.',
      },
      {
        id: 'ap3', title: 'CRM & Sales Pipelines', icon: 'people_alt',
        description: 'Salesforce, PipeDrive, Freshsales, Zoho CRM, FollowUpBoss, WiseAgent, LionDesk, Realvolve — keep your pipeline always up to date.',
      },
      {
        id: 'ap4', title: 'Email & Marketing Automation', icon: 'email',
        description: 'HubSpot, MailChimp, Klenty, AWeber — sync leads directly into your email platform and trigger automated nurture sequences.',
      },
      {
        id: 'ap5', title: 'Productivity & Project Mgmt', icon: 'task_alt',
        description: 'Trello, Podio, Monday.com, Asana — create tasks, assign work, and track deal progress without leaving your project tool.',
      },
      {
        id: 'ap6', title: 'Zapier (5,000+ Apps)', icon: 'hub',
        description: 'Connect to thousands of other apps via Zapier — no code needed. If your app is in Zapier, it works with PropertyRadar.',
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

// Final CTA
p.add(p.ctaBlock({
  title: 'Start automating today',
  description: 'Join thousands of real estate pros who trust PropertyRadar to automate outreach, follow-up, and operations.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'Explore the API', secondaryButtonUrl: '/features/api',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'features/integrations',
  title: 'Integrations | PropertyRadar',
  seoTitle: 'Integrate PropertyRadar With 5,000+ Apps | Automate Your Outreach | PropertyRadar',
  seoDescription: 'Integrate PropertyRadar with over 5,000 apps to automate outreach and operations, ensuring you never miss critical property and owner updates. Start streamlining your workflow today.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
