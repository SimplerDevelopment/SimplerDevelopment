/**
 * Import PropertyRadar /faq/driving-for-dollars/driving-for-dollars-definition-and-scope
 * Run: npx tsx scripts/migrations/propertyradar/import-faq-ddf-definition.ts
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

// ─── Hero (compact light) ─────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Driving for Dollars: Definition & Scope',
  subtitle: 'FAQ ARTICLE',
  description: 'What D4D is, what problems it solves, how it differs from other strategies, and how to identify actionable leads.',
  dark: false,
  minHeight: '40vh',
}));

// ─── Shared narrow-text style ─────────────────────────────────────────────────
const narrow = { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' };

// ─── Section: What is D4D ─────────────────────────────────────────────────────
p.add(p.section('sec-what', T.WHITE, 80, [
  p.heading('what-h', 'What is Driving for Dollars in real estate and home services?', 2, T.NAVY, 'left'),
  p.text('what-1',
    'Driving for Dollars (D4D) is a grassroots lead generation strategy where real estate investors, agents, or home service professionals physically drive through neighborhoods looking for distressed, neglected, or vacant properties. The goal is to find off-market opportunities before they hit the MLS or any public listing. You spot visual signs of distress — overgrown yards, boarded windows, code violations, deferred maintenance — then research the property, track down the owner, and make contact. It costs almost nothing beyond gas and time, and the leads you find are exclusive to you because you found them yourself.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Problems D4D solves ─────────────────────────────────────────────
p.add(p.section('sec-problems', T.TINT, 72, [
  p.heading('prob-h', 'What problems does Driving for Dollars solve?', 2, T.NAVY, 'left'),
  p.text('prob-1',
    'The biggest problem D4D solves is competition. MLS listings, auction sites, and purchased lead lists put you in a bidding war with every other investor or agent working that market. D4D gives you first-mover access to properties that nobody else is targeting yet. It also solves the "cold data" problem — you\'re verifying property condition with your own eyes instead of relying on outdated records. And for newer investors or agents with limited marketing budgets, it\'s one of the few strategies that trades time for deal flow without requiring thousands in ad spend.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Realistic outcomes ─────────────────────────────────────────────
p.add(p.section('sec-outcomes', T.WHITE, 72, [
  p.heading('out-h', 'What outcomes are realistic from Driving for Dollars?', 2, T.NAVY, 'left'),
  p.text('out-1',
    'Expect a long game. A typical first-touch response rate on outreach to D4D leads is around 1%. That improves with consistent follow-up — most deals close after 5–12 touches over weeks or months. A solo investor driving 3–4 hours per week in a targeted area might identify 20–50 properties per session. Over a quarter, that builds a pipeline of several hundred leads. One or two closed deals from that pipeline can represent $20K–$50K+ in assignment fees or equity capture, depending on the market. D4D is not a volume play. It\'s a precision play that rewards consistency and follow-through.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: D4D vs list-based ───────────────────────────────────────────────
p.add(p.section('sec-vs-list', T.TINT, 72, [
  p.heading('vl-h', 'What is the difference between Driving for Dollars and list-based prospecting?', 2, T.NAVY, 'left'),
  p.text('vl-1',
    'List-based prospecting starts with data — you pull a list of properties matching certain criteria (pre-foreclosure, tax delinquent, absentee-owned, high equity) and then market to that list. D4D starts with observation — you physically verify distress before adding a property to your pipeline. The key difference is signal quality. A list tells you what the data says. D4D tells you what the property actually looks like right now. The best operators combine both: they drive for dollars to find leads, then layer on property data and owner information to prioritize outreach. Tools like PropertyRadar let you do both from the same platform — build data-driven lists and run GPS-tracked D4D sessions with in-field property lookups.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: D4D vs door knocking ───────────────────────────────────────────
p.add(p.section('sec-vs-door', T.WHITE, 72, [
  p.heading('vd-h', 'What is the difference between Driving for Dollars and door knocking?', 2, T.NAVY, 'left'),
  p.text('vd-1',
    'Door knocking is direct, face-to-face contact at the property. D4D is observation and documentation — you\'re not knocking, you\'re scouting. D4D is a lead identification method. Door knocking is a lead contact method. They can work together: drive a neighborhood to build your target list, then come back to knock on the doors that look most promising. But they serve different purposes. D4D is lower-friction and covers more ground. Door knocking is higher-conversion per contact but slower and more confrontational. Many investors use D4D to build the list and then follow up with mail, phone, or text rather than knocking.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: D4D vs virtual D4D ─────────────────────────────────────────────
p.add(p.section('sec-vs-virtual', T.TINT, 72, [
  p.heading('vv-h', 'What is the difference between Driving for Dollars and "virtual driving for dollars"?', 2, T.NAVY, 'left'),
  p.text('vv-1',
    'Traditional D4D means you\'re physically in the car, driving streets, seeing properties in person. Virtual driving for dollars uses satellite imagery, street view, and map-based tools to scout properties from your desk. You\'re looking for the same visual distress signals — roof damage, overgrown lots, boarded windows — but through a screen instead of a windshield. Virtual D4D scales faster because you can cover more ground without burning gas or time commuting. But you miss things: smells, sounds, neighborhood context, properties that look fine on old imagery but have deteriorated since. The best approach is hybrid — use virtual D4D tools to pre-screen areas and flag candidates, then physically verify the highest-potential targets.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: What counts as a lead ──────────────────────────────────────────
p.add(p.section('sec-lead', T.WHITE, 72, [
  p.heading('lead-h', 'What counts as a "lead" in Driving for Dollars?', 2, T.NAVY, 'left'),
  p.text('lead-1',
    'A D4D lead is any property you identify in the field that shows signs of distress, vacancy, or neglect — and where you believe the owner may be motivated to sell, list, or need services. A lead is not just an address. At minimum, it\'s an address plus the visual evidence that prompted you to flag it (photos, notes on condition). A property becomes a real lead in your pipeline once you\'ve documented it and confirmed basic details like ownership status. Not every flagged property will convert. Many will be owned by people who aren\'t motivated, can\'t sell, or don\'t respond. That\'s expected. Volume in, quality out.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Actionable lead ─────────────────────────────────────────────────
p.add(p.section('sec-actionable', T.TINT, 72, [
  p.heading('act-h', 'What makes a Driving for Dollars lead "actionable"?', 2, T.NAVY, 'left'),
  p.text('act-1',
    'An actionable D4D lead has three things: a confirmed property address, documented evidence of distress or vacancy, and a way to contact the owner. Without owner contact information, you have an observation, not a lead. That\'s why skip tracing — finding the owner\'s phone number, email, or mailing address — is a critical step. An actionable lead also has enough context to personalize your outreach: what kind of distress you observed, how long the property appears to have been neglected, and any data you can layer on (tax status, equity position, lien history). The more context, the better your conversion rate.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Back to FAQ button ───────────────────────────────────────────────────────
p.add(p.section('sec-back', T.WHITE, 48, [
  p.button('back-btn', 'Back to D4D FAQ', '/faq/driving-for-dollars', 'outline', {
    icon: 'arrow_back', iconPosition: 'left', hoverEffect: 'slide', size: 'md',
  }),
], {}, {}), );

// ─── Final CTA ────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Ready to Start Driving for Dollars?',
  description: 'PropertyRadar gives you GPS-tracked D4D sessions, in-field property lookups, skip tracing, and multi-channel outreach — all in one platform.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'faq/driving-for-dollars/driving-for-dollars-definition-and-scope',
  title: 'Driving for Dollars: Definition & Scope',
  seoTitle: 'Driving for Dollars definition and scope | PropertyRadar Blog',
  seoDescription: 'Unlock the potential of Driving for Dollars with comprehensive insights, strategies, and best practices for real estate and home service lead generation.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
