/**
 * Import PropertyRadar /faq/driving-for-dollars FAQ Hub page.
 * Run: npx tsx scripts/migrations/propertyradar/import-faq-driving-for-dollars.ts
 *
 * NOTE: The source JSON (driving-for-dollars.json) is essentially a shell page —
 * headings[], sections[], paragraphs[] are all empty. All substantive FAQ content
 * lives in the two sub-pages. This hub is therefore built from the sub-page
 * content extracted from driving-for-dollars-definition-and-scope.json and
 * who-uses-driving-for-dollars.json, which ARE content-rich.
 */
import { T, makePage, footerBlock, upsertPage, cardOnLight } from './_shared';

const p = makePage();

// ─── Hero ─────────────────────────────────────────────────────────────────────
p.add(p.hero({
  title: 'Driving for Dollars',
  subtitle: 'FAQ HUB',
  description: 'Everything you need to know about the grassroots lead generation strategy that helps real estate investors, agents, and home service pros find off-market opportunities.',
  ctaText: 'Try it Free', ctaLink: '/register',
  secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing',
  minHeight: '52vh',
}));

// ─── Intro ────────────────────────────────────────────────────────────────────
p.add(p.section('sec-intro', T.WHITE, 80, [
  p.overline('intro-ov', 'WHAT IS D4D?'),
  p.heading('intro-h', 'Driving for Dollars: The Complete Guide'),
  p.lead('intro-l', 'Driving for Dollars (D4D) is a grassroots lead generation strategy where investors, agents, and service pros physically drive through neighborhoods looking for distressed, neglected, or vacant properties. It costs almost nothing beyond gas and time — and the leads you find are exclusive because you found them yourself.'),
]));

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
p.add(p.section('sec-faq', T.TINT, 80, [
  p.overline('faq-ov', 'FREQUENTLY ASKED QUESTIONS'),
  p.heading('faq-h', 'Your D4D Questions, Answered'),
  p.spacer('faq-sp', 'md'),
  {
    id: 'faq-acc', type: 'accordion', order: p.ord(),
    items: [
      {
        id: 'q1', title: 'What is Driving for Dollars in real estate and home services?',
        content: 'Driving for Dollars (D4D) is a grassroots lead generation strategy where real estate investors, agents, or home service professionals physically drive through neighborhoods looking for distressed, neglected, or vacant properties. The goal is to find off-market opportunities before they hit the MLS or any public listing. You spot visual signs of distress — overgrown yards, boarded windows, code violations, deferred maintenance — then research the property, track down the owner, and make contact. It costs almost nothing beyond gas and time, and the leads you find are exclusive to you because you found them yourself.',
      },
      {
        id: 'q2', title: 'What problems does Driving for Dollars solve?',
        content: 'The biggest problem D4D solves is competition. MLS listings, auction sites, and purchased lead lists put you in a bidding war with every other investor or agent working that market. D4D gives you first-mover access to properties that nobody else is targeting yet. It also solves the "cold data" problem — you\'re verifying property condition with your own eyes instead of relying on outdated records. And for newer investors or agents with limited marketing budgets, it\'s one of the few strategies that trades time for deal flow without requiring thousands in ad spend.',
      },
      {
        id: 'q3', title: 'What outcomes are realistic from Driving for Dollars?',
        content: 'Expect a long game. A typical first-touch response rate on outreach to D4D leads is around 1%. That improves with consistent follow-up — most deals close after 5–12 touches over weeks or months. A solo investor driving 3–4 hours per week in a targeted area might identify 20–50 properties per session. Over a quarter, that builds a pipeline of several hundred leads. One or two closed deals from that pipeline can represent $20K–$50K+ in assignment fees or equity capture, depending on the market. D4D is not a volume play. It\'s a precision play that rewards consistency and follow-through.',
      },
      {
        id: 'q4', title: 'What is the difference between Driving for Dollars and list-based prospecting?',
        content: 'List-based prospecting starts with data — you pull a list of properties matching certain criteria (pre-foreclosure, tax delinquent, absentee-owned, high equity) and then market to that list. D4D starts with observation — you physically verify distress before adding a property to your pipeline. The key difference is signal quality. A list tells you what the data says. D4D tells you what the property actually looks like right now. The best operators combine both: they drive for dollars to find leads, then layer on property data and owner information to prioritize outreach. Tools like PropertyRadar let you do both from the same platform.',
      },
      {
        id: 'q5', title: 'What is the difference between Driving for Dollars and door knocking?',
        content: 'Door knocking is direct, face-to-face contact at the property. D4D is observation and documentation — you\'re not knocking, you\'re scouting. D4D is a lead identification method. Door knocking is a lead contact method. They can work together: drive a neighborhood to build your target list, then come back to knock on the doors that look most promising. But they serve different purposes. D4D is lower-friction and covers more ground. Door knocking is higher-conversion per contact but slower and more confrontational. Many investors use D4D to build the list and then follow up with mail, phone, or text rather than knocking.',
      },
      {
        id: 'q6', title: 'What is the difference between Driving for Dollars and "virtual driving for dollars"?',
        content: 'Traditional D4D means you\'re physically in the car, driving streets, seeing properties in person. Virtual driving for dollars uses satellite imagery, street view, and map-based tools to scout properties from your desk. You\'re looking for the same visual distress signals — roof damage, overgrown lots, boarded windows — but through a screen instead of a windshield. Virtual D4D scales faster because you can cover more ground without burning gas or time commuting. But you miss things: smells, sounds, neighborhood context, properties that look fine on old imagery but have deteriorated since. The best approach is hybrid — use virtual D4D tools to pre-screen areas and flag candidates, then physically verify the highest-potential targets.',
      },
      {
        id: 'q7', title: 'What counts as a "lead" in Driving for Dollars?',
        content: 'A D4D lead is any property you identify in the field that shows signs of distress, vacancy, or neglect — and where you believe the owner may be motivated to sell, list, or need services. A lead is not just an address. At minimum, it\'s an address plus the visual evidence that prompted you to flag it (photos, notes on condition). A property becomes a real lead in your pipeline once you\'ve documented it and confirmed basic details like ownership status. Not every flagged property will convert. Many will be owned by people who aren\'t motivated, can\'t sell, or don\'t respond. That\'s expected. Volume in, quality out.',
      },
      {
        id: 'q8', title: 'What makes a Driving for Dollars lead "actionable"?',
        content: 'An actionable D4D lead has three things: a confirmed property address, documented evidence of distress or vacancy, and a way to contact the owner. Without owner contact information, you have an observation, not a lead. That\'s why skip tracing — finding the owner\'s phone number, email, or mailing address — is a critical step. An actionable lead also has enough context to personalize your outreach: what kind of distress you observed, how long the property appears to have been neglected, and any data you can layer on (tax status, equity position, lien history). The more context, the better your conversion rate.',
      },
      {
        id: 'q9', title: 'Who should use Driving for Dollars for acquisitions and off-market deals?',
        content: 'Fix-and-flip investors, wholesalers, and buy-and-hold landlords looking for below-market acquisitions. If you\'re competing on the MLS, you\'re paying retail. D4D finds properties where the seller hasn\'t listed yet — often because they don\'t know where to start, can\'t afford repairs to list, or have inherited a property they don\'t want. Wholesalers especially benefit because assignment margins depend on finding deals others haven\'t found. New investors with more time than money should be driving neighborhoods weekly. Experienced investors with capital but no deal flow should have someone driving for them.',
      },
      {
        id: 'q10', title: 'Who should use Driving for Dollars for listing opportunities?',
        content: 'Real estate agents focused on geographic farming. If you\'re trying to win listings in a specific neighborhood, D4D gives you a reason to knock or mail that goes beyond "I\'d love to sell your home." You spotted visible issues. You can offer a CMA or connect the owner with contractors. That\'s a service-first conversation, not a cold pitch. Agents working expired listings or FSBO leads can also use D4D to find properties that haven\'t even made it to those stages yet. You\'re upstream of every other agent waiting for the listing to appear.',
      },
      {
        id: 'q11', title: 'Who should use Driving for Dollars for home service lead generation?',
        content: 'Roofers, landscapers, painters, contractors, and property preservation companies. Distressed properties need work — that\'s the whole point. If you\'re a roofer and you see a house with visible roof damage, that\'s a warm lead for your business right now. Landscapers can target overgrown properties. Painters can target peeling exteriors. The same observation skills that help investors find deals help service providers find customers.',
      },
      {
        id: 'q12', title: 'When does Driving for Dollars not fit a business model?',
        content: 'D4D doesn\'t work well if you need high volume fast, if you\'re targeting a property type that doesn\'t show visible distress (like underperforming rental portfolios), or if you operate in markets so spread out that driving is impractical. It\'s also a poor fit if nobody on your team will actually do the driving consistently — sporadic effort produces sporadic results. It works best as one channel in a broader lead generation mix, or as the primary channel for solo operators and small teams doing 1–5 deals per month.',
      },
    ],
    elementStyles: {
      itemTitle: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      itemContent: { color: T.INK },
    },
  },
]));

// ─── Sub-page links (card-grid) ───────────────────────────────────────────────
p.add(p.section('sec-subpages', T.WHITE, 72, [
  p.overline('sub-ov', 'EXPLORE IN DEPTH'),
  p.heading('sub-h', 'Dive Deeper Into D4D'),
  p.lead('sub-l', 'These detailed guides cover the full definition, scope, and who benefits most from the strategy.'),
  p.spacer('sub-sp', 'md'),
  {
    id: 'sub-cards', type: 'card-grid', order: p.ord(), columns: 2,
    cards: [
      {
        id: 'c1',
        title: 'Definition & Scope',
        description: 'What is Driving for Dollars, what problems does it solve, and how does it compare to other lead gen strategies?',
        link: '/faq/driving-for-dollars/driving-for-dollars-definition-and-scope',
        linkText: 'Read the guide',
        icon: 'menu_book',
      },
      {
        id: 'c2',
        title: 'Who Uses D4D',
        description: 'Which investors, agents, and service pros benefit most — and when D4D does NOT fit your business model.',
        link: '/faq/driving-for-dollars/who-uses-driving-for-dollars',
        linkText: 'Read the guide',
        icon: 'groups',
      },
    ],
    elementStyles: {
      card: { ...cardOnLight },
      title: { color: T.NAVY, fontFamily: T.PF, fontWeight: '600' },
      description: { color: T.INK },
      link: { color: T.GREEN_D, fontWeight: '600' },
      icon: { color: T.GREEN },
    },
  },
]));

// ─── Final CTA ────────────────────────────────────────────────────────────────
p.add(p.ctaBlock({
  title: 'Ready to Start Driving for Dollars?',
  description: 'PropertyRadar gives you GPS-tracked D4D sessions, in-field property lookups, skip tracing, and multi-channel outreach — all in one platform.',
  primaryButtonText: 'Try it Free', primaryButtonUrl: '/register',
  secondaryButtonText: 'See pricing', secondaryButtonUrl: '/pricing',
}));

p.add(footerBlock(p.ord()));

upsertPage({
  slug: 'faq/driving-for-dollars',
  title: 'Driving for Dollars FAQ',
  seoTitle: 'Driving for Dollars Enablement | PropertyRadar FAQ',
  seoDescription: 'Unlock the potential of Driving for Dollars with comprehensive insights, strategies, and best practices for real estate and home service lead generation.',
}, p.blocks).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
