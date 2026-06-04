/**
 * Import PropertyRadar /good-neighbor-marketing-pledge page.
 * Run: npx tsx scripts/migrations/propertyradar/import-good-neighbor-pledge.ts
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ── Hero (dark) ────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Good Neighbor Marketing Pledge',
  subtitle: 'ETHICAL LOCAL MARKETING',
  description: 'The power of targeted local marketing combined with marketing best practices — so you can grow your business and strengthen your community at the same time.',
  ctaText: 'Take the Pledge', ctaLink: '/register',
  secondaryCtaText: 'Learn About PropertyRadar', secondaryCtaLink: '/about',
  minHeight: '62vh',
}));

// ── What it means (white) ─────────────────────────────────────────────────────
p.add(p.section('sec-intro', T.WHITE, 96, [
  p.overline('in-ov', 'THE PLEDGE'),
  p.heading('in-h', 'Marketing that builds communities and thriving businesses'),
  p.lead('in-l', 'We ask our customers to take the Good Neighbor Marketing Pledge and be a part of building great communities and thriving local businesses. Good Neighbor Marketing is never scammy, spammy, or insensitive — because success starts with being a good neighbor.'),
  p.spacer('in-sp', 'sm'),
  p.text('in-body',
    'The Pledge is about marketing as if you\'re a "good neighbor" and your best customer lives next door — because sometimes they do. Good Neighbor Marketing combines the power of targeted local outreach with best practices for building a respected, successful business in your community.',
    T.INK, 'center', { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' }),
]));

// ── The six pledge commitments (tint) ─────────────────────────────────────────
p.add(p.section('sec-commitments', T.TINT, 96, [
  p.overline('co-ov', 'THE COMMITMENTS'),
  p.heading('co-h', 'Six principles every good neighbor follows'),
  p.lead('co-l', 'These principles guide every marketing campaign run through PropertyRadar.'),
  p.spacer('co-sp', 'md'),
  {
    id: 'pledges', type: 'services-grid', order: p.ord(), columns: 2, accentColor: T.GREEN,
    services: [
      {
        id: 'p1', title: 'Always 100% Legal and Legitimate',
        description: 'Marketing must always be legal, honest, and transparent. Recipients should be able to quickly identify you and your business. We expect you to know and abide by all applicable laws — CAN-SPAM, Do Not Call, and professional licensing requirements.',
        icon: 'gavel',
      },
      {
        id: 'p2', title: 'Targeting Is What You Do, Not What You Say',
        description: 'Targeting is smart and powerful, but it can feel invasive. If someone asks why you reached out, simply tell them you\'re a local business who thought they might be interested. If they aren\'t, politely remove them from future efforts.',
        icon: 'center_focus_strong',
      },
      {
        id: 'p3', title: 'Be Smart and Private with Customer Information',
        description: 'Marketing materials should never include details that customers might believe to be personal or private. If your targeting and messaging are great, they\'ll connect the dots — you don\'t need to expose it.',
        icon: 'lock',
      },
      {
        id: 'p4', title: 'Great Marketing Has Empathy',
        description: 'Empathy means being aware of and sensitive to the feelings and experiences of your customer. Making a potential customer feel bad is never Good Neighbor Marketing — making them smile is always the best outcome.',
        icon: 'volunteer_activism',
      },
      {
        id: 'p5', title: 'Honor All Opt-Out Requests',
        description: 'You must honor any marketing recipient\'s request to opt-out. It\'s the right thing to do as a good neighbor and it\'s often required by law. Treat their feedback as an opportunity to improve your next campaign.',
        icon: 'do_not_disturb',
      },
      {
        id: 'p6', title: 'Automatic and Manual Review',
        description: 'We automatically — and at times manually — review user marketing based on recipient interactions. Complaints are almost always a sign the Pledge is being ignored. Failing to adhere can result in suspension or termination of access.',
        icon: 'verified_user',
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

// ── Why it matters — dark moment (navy) ───────────────────────────────────────
p.add(p.section('sec-why', T.NAVY, 116, [
  p.overline('wh-ov', 'WHY IT MATTERS', T.GREEN),
  {
    id: 'wh-h', type: 'heading', order: p.ord(), content: 'Build a business your community is proud of', level: 2, alignment: 'center',
    style: { color: T.WHITE, fontFamily: T.PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: 'center' },
  },
  {
    id: 'wh-sub', type: 'text', order: p.ord(),
    content: 'PropertyRadar gives you powerful targeting and outreach tools. The Good Neighbor Marketing Pledge ensures those tools are used to connect, build trust, and create lasting relationships — not burn bridges.',
    alignment: 'center',
    style: { color: 'rgba(255,255,255,0.72)', fontFamily: T.PF, fontSize: '1.1875rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto' },
  },
  p.spacer('wh-sp', 'lg'),
  {
    id: 'why-grid', type: 'services-grid', order: p.ord(), columns: 3, accentColor: T.GREEN,
    services: [
      {
        id: 'w1', title: 'Protect Your Reputation',
        description: 'Bad marketing can mean negative reviews, community backlash, and even platform bans. Good Neighbor Marketing protects everything you\'ve built.',
        icon: 'shield',
      },
      {
        id: 'w2', title: 'Get Better Results',
        description: 'Empathetic, legal, and well-targeted marketing outperforms aggressive tactics — higher open rates, more responses, better ROI.',
        icon: 'trending_up',
      },
      {
        id: 'w3', title: 'Strengthen Your Community',
        description: 'When local businesses market with integrity, the whole community benefits. That\'s the PropertyRadar way.',
        icon: 'handshake',
      },
    ],
    elementStyles: {
      serviceTitle: { color: T.WHITE, fontFamily: T.PF, fontWeight: '600' },
      serviceDescription: { color: 'rgba(255,255,255,0.72)' },
      serviceIcon: { color: T.GREEN },
      card: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: '1px', borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'solid', borderRadius: '16px' },
    },
  },
], {}, {
  customCSS: 'background-image: radial-gradient(ellipse 80% 55% at 50% 0%, rgba(56,203,137,0.14) 0%, transparent 60%);',
}));

// ── CTA ────────────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Take the Good Neighbor Marketing Pledge',
  description: 'Join thousands of professionals using PropertyRadar to grow their business the right way — ethically, effectively, and with respect for their community.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'Read User Agreement', secondaryButtonUrl: '/user-agreement',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'good-neighbor-marketing-pledge',
  title: 'Good Neighbor Marketing Pledge',
  seoTitle: 'Good Neighbor Marketing Pledge | Build Communities & Thrive Locally',
  seoDescription: 'Commit to ethical and effective local marketing with the Good Neighbor Marketing Pledge, fostering community connections while respecting customer privacy and preferences.',
  ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
