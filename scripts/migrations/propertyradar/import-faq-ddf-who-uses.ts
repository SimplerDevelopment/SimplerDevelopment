/**
 * Import PropertyRadar /faq/driving-for-dollars/who-uses-driving-for-dollars
 * Run: npx tsx scripts/migrations/propertyradar/import-faq-ddf-who-uses.ts
 */
import { T, makePage, footerBlock, upsertPage } from './_shared';

const p = makePage();

// ─── Hero (compact light) ─────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Who Uses Driving for Dollars',
  subtitle: 'FAQ ARTICLE',
  description: 'Which investors, agents, and service professionals benefit most from D4D — and when the strategy does not fit your business model.',
  dark: false,
  minHeight: '40vh',
}));

// ─── Shared narrow-text style ─────────────────────────────────────────────────
const narrow = { maxWidth: '820px', marginLeft: 'auto', marginRight: 'auto' };

// ─── Section: Acquisitions ────────────────────────────────────────────────────
p.add(p.section('sec-acq', T.WHITE, 80, [
  p.heading('acq-h', 'Who should use Driving for Dollars for acquisitions and off-market deals?', 2, T.NAVY, 'left'),
  p.text('acq-1',
    'Fix-and-flip investors, wholesalers, and buy-and-hold landlords looking for below-market acquisitions. If you\'re competing on the MLS, you\'re paying retail. D4D finds properties where the seller hasn\'t listed yet — often because they don\'t know where to start, can\'t afford repairs to list, or have inherited a property they don\'t want. Wholesalers especially benefit because assignment margins depend on finding deals others haven\'t found. New investors with more time than money should be driving neighborhoods weekly. Experienced investors with capital but no deal flow should have someone driving for them.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Listing opportunities ──────────────────────────────────────────
p.add(p.section('sec-listing', T.TINT, 72, [
  p.heading('list-h', 'Who should use Driving for Dollars for listing opportunities?', 2, T.NAVY, 'left'),
  p.text('list-1',
    'Real estate agents focused on geographic farming. If you\'re trying to win listings in a specific neighborhood, D4D gives you a reason to knock or mail that goes beyond "I\'d love to sell your home." You spotted visible issues. You can offer a CMA or connect the owner with contractors. That\'s a service-first conversation, not a cold pitch. Agents working expired listings or FSBO leads can also use D4D to find properties that haven\'t even made it to those stages yet. You\'re upstream of every other agent waiting for the listing to appear.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Home service lead gen ──────────────────────────────────────────
p.add(p.section('sec-services', T.WHITE, 72, [
  p.heading('svc-h', 'Who should use Driving for Dollars for home service lead generation?', 2, T.NAVY, 'left'),
  p.text('svc-1',
    'Roofers, landscapers, painters, contractors, and property preservation companies. Distressed properties need work — that\'s the whole point. If you\'re a roofer and you see a house with visible roof damage, that\'s a warm lead for your business right now. Landscapers can target overgrown properties. Painters can target peeling exteriors. The same observation skills that help investors find deals help service providers find customers. The outreach approach changes — you\'re offering to fix the problem, not buy the property — but the scouting method is identical.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: Team roles ──────────────────────────────────────────────────────
p.add(p.section('sec-roles', T.TINT, 72, [
  p.heading('role-h', 'What team roles exist in a Driving for Dollars workflow?', 2, T.NAVY, 'left'),
  p.text('role-1',
    'There are four core roles. Driver/Scout: the person physically driving routes and flagging properties. This can be the investor, a VA, a bird dog, or a paid part-time employee. Researcher: the person who looks up property data, ownership, tax status, and liens on flagged properties. Skip Tracer: the person who finds owner contact information — phone, email, mailing address. In many setups, the researcher and skip tracer are the same person, especially when using a platform like PropertyRadar that bundles property data and skip tracing together. Closer: the person who makes contact, negotiates, and converts leads into deals or listings. Solo operators fill all four roles. Scaling means delegating the first three so the closer focuses on revenue-generating conversations.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Section: When D4D doesn't fit ───────────────────────────────────────────
p.add(p.section('sec-nofit', T.WHITE, 72, [
  p.heading('nf-h', 'When does Driving for Dollars not fit a business model?', 2, T.NAVY, 'left'),
  p.text('nf-1',
    'D4D doesn\'t work well if you need high volume fast, if you\'re targeting a property type that doesn\'t show visible distress (like underperforming rental portfolios), or if you operate in markets so spread out that driving is impractical. It\'s also a poor fit if nobody on your team will actually do the driving consistently — sporadic effort produces sporadic results. If you\'re a large operation doing 20+ deals a month, D4D alone won\'t fill your pipeline. It works best as one channel in a broader lead generation mix, or as the primary channel for solo operators and small teams doing 1–5 deals per month.',
    T.INK, 'left', { ...narrow, marginTop: '16px' }),
], {}, {}), );

// ─── Back to FAQ button ───────────────────────────────────────────────────────
p.add(p.section('sec-back', T.TINT, 48, [
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
  slug: 'faq/driving-for-dollars/who-uses-driving-for-dollars',
  title: 'Who Uses Driving for Dollars',
  seoTitle: 'Who uses Driving for Dollars | PropertyRadar Blog',
  seoDescription: 'Unlock the potential of Driving for Dollars with comprehensive insights, strategies, and best practices for real estate and home service lead generation.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
