/**
 * Import PropertyRadar HOME page (redesigned — LIGHT, brand-faithful).
 * The real PropertyRadar site is ~95% light (white + #ECF9FF tint) with only a
 * navy footer + pastel accent cards. This page keeps premium polish but stays
 * light-dominant and recognizably PropertyRadar. Idempotent upsert (slug='home').
 * Run: npx tsx scripts/migrations/propertyradar/import-home.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
if (!DATABASE_URL) { console.error('ERROR: DATABASE_URL not set.'); process.exit(1); }
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd = PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
if (isProd && process.env.ALLOW_PROD !== '1') { console.error('REFUSING: prod host.'); process.exit(1); }

const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);

// ─── tokens ─────────────────────────────────────────────────────────────────
const NAVY = '#0A1F44', BLUE = '#19467F', GREEN = '#38CB89', GREEN_D = '#2BA56C';
const TINT = '#ECF9FF', WHITE = '#FFFFFF', INK = '#41506B', LINE = '#E2E8F2';
const MINT = '#E9FBF2';
const PF = 'Poppins, sans-serif';
// pastel tints + chips for "why our data wins" (brand DNA)
const PAS = { pPurple: '#F3EFFD', pGreen: '#E9F8F0', pBlue: '#EAF3FB', pPink: '#FBEDF4' };
const CHIP = { purple: '#AC98F0', green: '#38CB89', blue: '#A0CEEA', pink: '#E69BC3' };
const cardOnLight = { backgroundColor: WHITE, borderWidth: '1px', borderColor: LINE, borderStyle: 'solid', borderRadius: '16px', customCSS: 'box-shadow:0 10px 40px rgba(10,31,68,0.06);transition:all .3s ease' };

const IMG = {
  hero: 'https://www.propertyradar.com/hubfs/hero-poster.webp',
  ownerData: 'https://www.propertyradar.com/hs-fs/hubfs/pr/owner-data.jpg?width=730&name=owner-data.jpg',
  marketing: 'https://www.propertyradar.com/hs-fs/hubfs/pr/TargetedMarketing.jpg?width=730&name=TargetedMarketing.jpg',
  foreclosure: 'https://www.propertyradar.com/hs-fs/hubfs/pr/ForeclosureTracking.jpg?width=730&name=ForeclosureTracking.jpg',
};

let _o = 0; const ord = () => _o++;
const es = (o: Record<string, unknown>) => o;
function section(id: string, bg: string, pad: number, children: unknown[], style: Record<string, unknown> = {}) {
  return { id, type: 'section', order: ord(), maxWidth: '1200px',
    style: { backgroundColor: bg, paddingTop: `${pad}px`, paddingBottom: `${pad}px`, paddingLeft: '24px', paddingRight: '24px', ...style }, blocks: children };
}
const heading = (id: string, t: string, level = 2, color = NAVY, align = 'center') => ({ id, type: 'heading', order: ord(), content: t, level, alignment: align, style: { color, fontFamily: PF, fontWeight: '700', letterSpacing: '-0.015em', textAlign: align } });
const overline = (id: string, t: string, align = 'center') => ({ id, type: 'text', order: ord(), content: t, alignment: align, style: { color: GREEN_D, fontFamily: PF, fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.75rem', textAlign: align, marginBottom: '12px' } });
const lead = (id: string, t: string, align = 'center') => ({ id, type: 'text', order: ord(), content: t, alignment: align, style: { color: INK, fontFamily: PF, fontSize: '1.1875rem', lineHeight: '1.6', textAlign: align, maxWidth: '720px', marginLeft: 'auto', marginRight: 'auto', marginTop: '14px' } });
const spacer = (id: string, h = 'md') => ({ id, type: 'spacer', order: ord(), height: h });

const blocks: unknown[] = [];

// ─── 0. LIGHT split hero (white) ──────────────────────────────────────────────
blocks.push(section('hero', WHITE, 72, [
  {
    id: 'hero-cols', type: 'columns', order: ord(), gap: 'lg', stackOnMobile: true,
    columns: [
      { id: 'hc-l', width: '52%', verticalAlign: 'center', blocks: [
        { id: 'h-ov', type: 'text', order: 0, content: 'PROPERTY &amp; OWNER DATA, BUILT TO WIN', style: { color: GREEN_D, fontFamily: PF, fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '16px' } },
        { id: 'h-title', type: 'heading', order: 1, content: 'Find Motivated Property Owners', level: 1, alignment: 'left', style: { color: NAVY, fontFamily: PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4.5vw,3.75rem)', letterSpacing: '-0.02em', lineHeight: '1.05', textAlign: 'left' } },
        { id: 'h-desc', type: 'text', order: 2, content: 'We help real estate, mortgage, and service pros connect with motivated owners, qualify opportunities, and automate outreach — all powered by 20 years of obsessive data quality.', style: { color: INK, fontFamily: PF, fontSize: '1.1875rem', lineHeight: '1.6', marginTop: '20px', marginBottom: '32px' } },
        { id: 'h-btns', type: 'columns', order: 3, gap: 'sm', stackOnMobile: false, columns: [
          { id: 'hb1', width: 'auto', verticalAlign: 'center', blocks: [{ id: 'h-cta', type: 'button', order: 0, text: 'Try it Free', url: '/register', variant: 'primary', size: 'lg', alignment: 'left', icon: 'arrow_forward', iconPosition: 'right', hoverEffect: 'lift' }] },
          { id: 'hb2', width: 'auto', verticalAlign: 'center', blocks: [{ id: 'h-cta2', type: 'button', order: 0, text: 'See how it works', url: '/features', variant: 'outline', size: 'lg', alignment: 'left', icon: 'arrow_forward', iconPosition: 'right', hoverEffect: 'slide' }] },
        ] },
        { id: 'h-trust', type: 'text', order: 4, content: 'Trusted by 100,000+ real estate, mortgage &amp; service pros · SOC 2 · 20 years of data', style: { color: '#8893A8', fontFamily: PF, fontSize: '0.85rem', marginTop: '28px' } },
      ] },
      { id: 'hc-r', width: '48%', verticalAlign: 'center', blocks: [
        { id: 'h-img', type: 'image', order: 0, url: IMG.hero, alt: 'PropertyRadar property map and owner data', width: 'full', alignment: 'center', style: { borderRadius: '18px', customCSS: 'box-shadow:0 30px 80px rgba(10,31,68,0.16)' } },
      ] },
    ],
  },
]));

// ─── 1. STATS (tint) ──────────────────────────────────────────────────────────
blocks.push(section('sec-stats', TINT, 80, [
  {
    id: 'stats', type: 'stats', order: ord(), columns: 4,
    stats: [
      { id: 's1', value: '$250B+', label: 'Completed Transactions' },
      { id: 's2', value: '3X', label: 'Marketing ROI' },
      { id: 's3', value: '160M+', label: 'Properties' },
      { id: 's4', value: '1B+', label: 'Phones & Emails' },
    ],
    elementStyles: {
      statValue: es({ color: NAVY, fontFamily: PF, fontWeight: '700', fontSize: 'clamp(2.5rem,4vw,3.25rem)', letterSpacing: '-0.02em' }),
      statLabel: es({ color: INK, fontFamily: PF, fontWeight: '500', letterSpacing: '0.02em' }),
    },
  },
]));

// ─── 2. WHO WE SERVE (white) ──────────────────────────────────────────────────
blocks.push(section('sec-aud', WHITE, 96, [
  {
    id: 'aud', type: 'services-grid', order: ord(), columns: 3, accentColor: GREEN,
    overline: 'WHO WE SERVE', title: 'Everything you need to dominate your market',
    description: 'See how PropertyRadar helps you grow your business and win — whatever your specialty.',
    services: [
      { id: 'a1', title: 'Real Estate Investors', description: 'Wholesale, fix & flip, or buy & hold — motivated sellers, due diligence, and cash buyers to close more deals.', icon: 'trending_up', link: '/built-for/real-estate-investors', linkText: 'Find deals now' },
      { id: 'a2', title: 'Residential Agents', description: 'Find likely-to-sell owners, win expired listings, connect at key life events, and lead your market.', icon: 'home_work', link: '/built-for/residential-agents', linkText: 'Get more listings' },
      { id: 'a3', title: 'Commercial Agents', description: 'Generate and enrich leads to increase deal volume and prioritize the best prospects.', icon: 'apartment', link: '/built-for/commercial-agents', linkText: 'Win more clients' },
      { id: 'a4', title: 'Mortgage Pros', description: 'Know your market, identify the owner behind the LLC, and uncover distressed assets.', icon: 'account_balance', link: '/built-for/mortgage-pros', linkText: 'Close more loans' },
      { id: 'a5', title: 'Home & Property Services', description: 'Roofing, solar, HVAC, moving & storage, property management — opportunity is knocking.', icon: 'handyman', link: '/built-for/service-pros', linkText: 'Grow your business' },
      { id: 'a6', title: 'Media, Government & More', description: 'Media, government, law enforcement, and many others have trusted PropertyRadar for 20 years.', icon: 'public', link: '/built-for', linkText: 'Learn more' },
    ],
    elementStyles: {
      overline: es({ color: GREEN_D, fontFamily: PF, fontWeight: '700', letterSpacing: '0.18em' }),
      title: es({ color: NAVY, fontFamily: PF, fontWeight: '700', letterSpacing: '-0.015em' }),
      description: es({ color: INK }),
      serviceTitle: es({ color: NAVY, fontFamily: PF, fontWeight: '600' }),
      serviceDescription: es({ color: INK }),
      serviceIcon: es({ color: GREEN }),
      serviceLink: es({ color: GREEN_D, fontWeight: '600' }),
      card: es(cardOnLight),
    },
  },
]));

// ─── 3. CORE CAPABILITIES (tint, LIGHT) — featured-content x3 with brand images ─
const capStyles = (imgPos: 'left' | 'right') => ({
  title: es({ color: NAVY, fontFamily: PF, fontWeight: '700', letterSpacing: '-0.015em' }),
  description: es({ color: INK }),
  button: es({}),
});
blocks.push(section('sec-cap', TINT, 88, [
  overline('cap-ov', 'BUILT ON A FOUNDATION YOU CAN TRUST'),
  heading('cap-h', 'Three core capabilities. One obsession: data quality.'),
  lead('cap-l', "These aren't separate products — they're a natural evolution. Each layer builds on the last, all powered by the same commitment that helped our customers win over $250B in new business."),
  spacer('cap-sp', 'lg'),
  { id: 'cap1', type: 'featured-content', order: ord(), title: 'Targeted Marketing', description: 'Since 2020 — launch multi-channel campaigns in one click. Phone, text, email, mail, and online, all working together. Automate outreach to keep growing while you sleep.', imageUrl: IMG.marketing, imagePosition: 'right', buttonText: 'See marketing tools', buttonUrl: '/features/targeted-marketing', elementStyles: capStyles('right') },
  spacer('cap-sp2', 'lg'),
  { id: 'cap2', type: 'featured-content', order: ord(), title: 'Property & Owner Data', description: 'Since 2012 — owner contact data, demographics, and dozens of distress and life-event signals, helping you target better, qualify faster, and win more deals.', imageUrl: IMG.ownerData, imagePosition: 'left', buttonText: 'See our data', buttonUrl: '/features/property-and-owner-data', elementStyles: capStyles('left') },
  spacer('cap-sp3', 'lg'),
  { id: 'cap3', type: 'featured-content', order: ord(), title: 'Foreclosure Tracking', description: 'Since 2007 — unprecedented clarity on foreclosure data. For investors, agents, journalists, and government agencies, our accuracy set a new standard.', imageUrl: IMG.foreclosure, imagePosition: 'right', buttonText: 'See foreclosures', buttonUrl: '/features/foreclosures', elementStyles: capStyles('right') },
]));

// ─── 4. WHY OUR DATA WINS — pastel cards (white), brand DNA via html-render ─────
const pcard = (bg: string, chip: string, icon: string, title: string, body: string) =>
  `<div style="background:${bg};border-radius:18px;padding:32px;height:100%">
     <span style="display:inline-flex;width:52px;height:52px;border-radius:14px;background:${chip};align-items:center;justify-content:center;margin-bottom:18px"><span class="material-icons" style="color:#fff;font-size:26px">${icon}</span></span>
     <h3 style="font-family:Poppins,sans-serif;font-weight:700;color:${NAVY};font-size:1.25rem;margin:0 0 10px">${title}</h3>
     <p style="color:${INK};font-size:1rem;line-height:1.6;margin:0">${body}</p>
   </div>`;
const whyHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px">
  ${pcard(PAS.pPurple, CHIP.purple, 'hub', 'Relationships Matter', 'While competitors treat public records as flat files, our unique OwnerGraph™ ties records together across sources and over time to find insights flat data never will.')}
  ${pcard(PAS.pGreen, CHIP.green, 'workspace_premium', 'Exclusive Data', "We've extracted, created, modeled, or tracked dozens of unique data points you won't find elsewhere — they don't exist directly in public records.")}
  ${pcard(PAS.pBlue, CHIP.blue, 'verified', 'The Quality You Demand', "We've relentlessly sourced the most accurate, timely, unique property & owner data for 20 years. Most competitors just resell from First American, Attom, or IDI.")}
  ${pcard(PAS.pPink, CHIP.pink, 'visibility', 'See Opportunities First', "We aren't a reseller. We use multiple sources, run vendor bake-offs, update daily, and backtest against county records so you see opportunities first.")}
</div>`;
blocks.push(section('sec-why', WHITE, 96, [
  overline('why-ov', 'WHY OUR DATA WINS YOU MORE DEALS'),
  heading('why-h', 'A lot of people sell data. Ours is better.'),
  lead('why-l', "Here's how we deliver opportunities your competition will never see."),
  spacer('why-sp', 'lg'),
  { id: 'why-cards', type: 'html-render', order: ord(), html: whyHtml, width: 'full' },
]));

// ─── 5. WHAT SETS US APART — accordion (tint) ───────────────────────────────────
const aprt = (others: string, us: string) => `<p style="margin:0 0 8px;color:#94506b;font-weight:600">Others: ${others}</p><p style="margin:0;color:#0A1F44">PropertyRadar: ${us}</p>`;
blocks.push(section('sec-apart', TINT, 96, [
  overline('apart-ov', 'WHAT SETS PROPERTYRADAR APART'),
  heading('apart-h', "Things you won't find elsewhere — or won't find done this well"),
  spacer('apart-sp', 'md'),
  {
    id: 'apart', type: 'accordion', order: ord(),
    items: [
      { id: 'ap1', title: 'Find the Best Opportunities for Your Business', content: aprt('Limited search capabilities', "We built the industry's most powerful search engine so you find precisely the right prospects.") },
      { id: 'ap2', title: 'Complete Marketing System Included', content: aprt('Require multiple tools', 'No other service offers as many ways to connect with owners — phone, text, email, mail, online, or in person.') },
      { id: 'ap3', title: 'More Life-Event & Distress Indicators', content: aprt('Lack the opportunities that matter', "No platform matches PropertyRadar's depth of life-event and distress indicators.") },
      { id: 'ap4', title: 'Expert AI Makes It Easy', content: aprt('Make you do it all yourself', 'With the power of AI we make world-class marketing easier than ever.') },
      { id: 'ap5', title: 'Industry-Specific Playbooks', content: aprt('Start from scratch', "PropertyRadar's playbooks give you dozens of plays to reach the right people, with the right message, at the right time.") },
      { id: 'ap6', title: 'Real-Time Automated Actions & Alerts', content: aprt('Require your effort to take action', "Our event engine automatically puts data into action — we'll work while you sleep.") },
      { id: 'ap7', title: 'Skip Tracing Built-In & Searchable', content: aprt('Buy lists, then skip trace', 'Want only owners with mobile numbers, not on the do-not-call list? Good luck doing that elsewhere.') },
    ],
    elementStyles: { itemTitle: es({ color: NAVY, fontFamily: PF, fontWeight: '600' }), itemContent: es({ color: INK }) },
  },
]));

// ─── 6. PROVEN LEAD-GEN STRATEGIES — card-grid (white) ──────────────────────────
const playCard = (id: string, title: string, icon: string, plays: string, href: string) => ({ id, title, description: plays, icon, link: href });
blocks.push(section('sec-plays', WHITE, 96, [
  {
    id: 'plays', type: 'card-grid', order: ord(), columns: 3,
    title: 'Proven lead-gen strategies', description: 'These and many other plays are ready for you to grow your business faster.',
    cards: [
      playCard('p1', 'Real Estate Investors', 'trending_up', 'Preforeclosures · Probate · Divorce', '/plays/real-estate-investors'),
      playCard('p2', 'Residential Agents', 'home_work', 'Likely Sellers · Foreclosure · Expired Listings', '/plays/residential-agents'),
      playCard('p3', 'Commercial Agents', 'apartment', 'Distressed Commercial · Owner-User Exits · Portfolio Owners', '/plays/commercial-agents'),
      playCard('p4', 'Mortgage Pros', 'account_balance', 'Lower-Rate Refi · Cash-Out Refi · FHA Streamline', '/plays/mortgage-pros'),
      playCard('p5', 'Home Services Pros', 'handyman', 'New Owners · Aging Systems · Equity Upgrades', '/plays/service-pros'),
      playCard('p6', 'Browse All Plays', 'auto_stories', 'Dozens of proven plays across every industry.', '/plays'),
    ],
    elementStyles: {
      title: es({ color: NAVY, fontFamily: PF, fontWeight: '700', letterSpacing: '-0.015em' }),
      description: es({ color: INK }),
      cardTitle: es({ color: NAVY, fontFamily: PF, fontWeight: '600' }),
      cardDescription: es({ color: INK }),
      cardIcon: es({ color: GREEN }),
      card: es(cardOnLight),
    },
  },
]));

// ─── 7. TESTIMONIALS (tint) ─────────────────────────────────────────────────────
const testi = (id: string, quote: string, author: string, role: string) => ({
  id, type: 'testimonial', order: 0, quote, author, role,
  elementStyles: { quote: es({ color: NAVY, fontFamily: PF, fontStyle: 'italic', lineHeight: '1.6' }), author: es({ color: GREEN_D, fontWeight: '700' }), quoteIcon: es({ color: GREEN }) },
  style: { backgroundColor: WHITE, borderWidth: '1px', borderColor: LINE, borderStyle: 'solid', borderRadius: '16px', padding: '32px', customCSS: 'box-shadow:0 10px 40px rgba(10,31,68,0.06)' },
});
blocks.push(section('sec-testi', TINT, 96, [
  overline('testi-ov', 'HEAR FROM OUR CUSTOMERS'),
  heading('testi-h', 'Loved by professionals who own their market'),
  spacer('testi-sp', 'lg'),
  {
    id: 'testi-cols', type: 'columns', order: ord(), gap: 'md', stackOnMobile: true,
    columns: [
      { id: 'tc1', width: '33.33%', verticalAlign: 'top', blocks: [testi('t1', 'I did my first deal ever thanks to PropertyRadar. Within 30 days I found my very first deal! Every day I use it — from zoning info to owner lookups to running comps.', 'Richard M.', 'Real Estate Investor · ★★★★★')] },
      { id: 'tc2', width: '33.33%', verticalAlign: 'top', blocks: [testi('t2', "This app has saved me 1,000s of hours. I'd reconsider being an agent without it. Make a list, go to insights, screen-cap a graph, send to client. So good.", 'Apple App Store Review', 'Residential Agent · ★★★★★')] },
      { id: 'tc3', width: '33.33%', verticalAlign: 'top', blocks: [testi('t3', 'PropertyRadar has been a game changer for our real estate business. Concise, precise information to help you target your ideal customers. Highly recommend.', 'Apple App Store Review', 'Broker · ★★★★★')] },
    ],
  },
]));

// ─── 8. FINAL CTA (LIGHT mint) ──────────────────────────────────────────────────
blocks.push({
  id: 'cta', type: 'cta', order: ord(),
  title: 'Ready to own your market?',
  description: 'Join thousands of professionals who trust PropertyRadar to grow their business.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
  backgroundStyle: 'solid',
  style: { backgroundColor: MINT, paddingTop: '104px', paddingBottom: '104px', customCSS: 'background-image: radial-gradient(ellipse 70% 60% at 50% 0%, rgba(56,203,137,0.16) 0%, transparent 65%);' },
  elementStyles: {
    title: es({ color: NAVY, fontFamily: PF, fontWeight: '700', letterSpacing: '-0.015em' }),
    description: es({ color: INK }),
  },
});

// ─── upsert ─────────────────────────────────────────────────────────────────────
async function run() {
  const { db } = await import('../../../lib/db');
  const { eq, and } = await import('drizzle-orm');
  const { posts } = await import('../../../lib/db/schema');
  const clean = (blocks as Array<{ type?: string }>).filter((b) => b && b.type !== 'site-footer');
  const content = JSON.stringify({ blocks: clean, version: '1.0' });
  const existing = await db.select().from(posts).where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home'))).limit(1);
  const values = {
    title: 'Home', slug: 'home', postType: 'page', content, published: true, websiteId: WEBSITE_ID,
    seoTitle: 'PropertyRadar — Find Motivated Property Owners',
    seoDescription: 'Connect with motivated property owners, qualify opportunities, and automate outreach. 160M+ properties, 1B+ contacts, 20 years of data quality.',
    ogImage: 'https://www.propertyradar.com/hubfs/Social%20Sharing.png',
  };
  if (existing.length > 0) {
    await db.update(posts).set({ ...values, updatedAt: new Date() }).where(eq(posts.id, existing[0].id));
    console.log(`[import-home] Updated post id=${existing[0].id} (${clean.length} blocks)`);
  } else {
    const [created] = await db.insert(posts).values(values).returning();
    console.log(`[import-home] Created post id=${created.id} (${clean.length} blocks)`);
  }
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
