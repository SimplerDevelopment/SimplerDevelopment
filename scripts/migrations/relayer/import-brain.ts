/**
 * Relayer (userelayer.com) — Company Brain seed.
 *
 * Seeds clientId 161's Brain with demo-ready content so the Brain portal
 * (app/portal/brain) renders populated for a client walkthrough:
 *
 *   0. ENTITLEMENT  — set clients.brainTrialUntil = now + 1y (so isBrainEntitled
 *                     is true and the /portal/brain gate opens) + enable the
 *                     brain_profiles row with the knowledge/ask modules on.
 *   1. TOPICS       — a 4-branch taxonomy (powers the tag treemap).
 *   2. GLOSSARY     — Relayer's canonical vocabulary (the post-sale gap, etc).
 *   3. DOCUMENTS    — positioning, ICP, platform, sales briefing, company story
 *                     (created → draft body set → published).
 *   4. DECISIONS    — the load-bearing GTM / product / brand decisions w/ rationale.
 *   5. INITIATIVES  — the active fronts (site launch, OEM pilot, partner integrations).
 *
 * Idempotent: every create checks a natural key (term / title / name / slug) and
 * skips if it already exists, so the script is safe to re-run.
 *
 * Run (defaults to the LOCAL dryrun DB via .env.local):
 *   npx tsx scripts/migrations/relayer/import-brain.ts
 *
 * Override the target DB explicitly:
 *   RL_DATABASE_URL=postgresql://… npx tsx scripts/migrations/relayer/import-brain.ts
 */
import * as dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });
if (process.env.RL_DATABASE_URL) process.env.DATABASE_URL = process.env.RL_DATABASE_URL;

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167', 'metro.proxy.rlwy.net:25565'];
const isProd =
  PROD_INDICATORS.some((p) => DATABASE_URL.includes(p)) ||
  process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
if (isProd && process.env.ALLOW_PROD !== '1') {
  console.error('REFUSING: DATABASE_URL points at a production host. Re-run with ALLOW_PROD=1 if intentional.');
  process.exit(1);
}

function loadIds(): { clientId?: number; userId?: number } {
  try {
    return JSON.parse(readFileSync(join(__dirname, '_ids.json'), 'utf8'));
  } catch {
    return {};
  }
}
const IDS = loadIds();
const CLIENT_ID = parseInt(process.env.RL_CLIENT_ID || '', 10) || IDS.clientId || 0;
const ACTOR_ID = parseInt(process.env.RL_USER_ID || '', 10) || IDS.userId || 0;

if (!CLIENT_ID) {
  console.error('ERROR: clientId not resolved (expected relayer/_ids.json with clientId 161).');
  process.exit(1);
}

// ─── Content ──────────────────────────────────────────────────────────────────

const TOPICS: Array<{ name: string; description: string; color: string; icon: string; children: string[] }> = [
  { name: 'Go-To-Market', description: 'Positioning, messaging, sales motion, and ideal-customer definition.', color: '#23EE92', icon: 'campaign',
    children: ['Positioning & Messaging', 'Sales', 'Ideal Customer Profile'] },
  { name: 'Product', description: 'The Relayer platform — how it works and what it does.', color: '#032916', icon: 'dashboard',
    children: ['Platform Architecture', 'Capabilities'] },
  { name: 'Company', description: 'AutoAssist, the team, brand, and the founding story.', color: '#8a7f6d', icon: 'business',
    children: ['Brand System', 'Company Story'] },
  { name: 'Domain', description: 'The automotive OEM + dealer-network world Relayer operates in.', color: '#5b6b62', icon: 'public',
    children: ['Automotive OEMs', 'Dealer Networks', 'Post-Sale Experience'] },
];

const GLOSSARY: Array<{ term: string; short: string; definition: string; aliases?: string[]; category: string }> = [
  {
    term: 'The Post-Sale Gap', category: 'Core Concept',
    short: 'The disconnect between OEM customer-care programs and dealer-level execution after a sale.',
    definition:
      'The structural disconnect that opens the moment a vehicle is sold. Manufacturers invest millions in customer satisfaction programs; dealers are expected to execute them. Between the two there is no shared system — just surveys, scores, and blind spots. The post-sale gap is the problem Relayer exists to close.',
  },
  {
    term: 'Shared Operational Layer', category: 'Core Concept',
    short: 'One system OEMs and dealers both work from, replacing fragmented post-sale tooling.',
    definition:
      'The single operational system Relayer creates between manufacturers and their dealer networks. Instead of programs launched centrally but executed locally with no shared visibility, both sides work from one layer — so execution is consistent across the network and outcomes become measurable.',
    aliases: ['shared system', 'the missing layer'],
  },
  {
    term: 'Operating Signal', category: 'Core Concept',
    short: 'An actionable indicator derived from post-sale data — as opposed to a static survey score.',
    definition:
      'What a survey score becomes once it is connected to execution. A CSI number tells you a store is underperforming; an operating signal tells you what is happening and what to do about it, in time to act. Turning survey scores into operating signals is the practical promise of the shared operational layer.',
    aliases: ['operational signal'],
  },
  {
    term: 'Network-Wide Execution', category: 'Core Concept',
    short: 'Programs performing as designed at every store, regardless of location.',
    definition:
      'The outcome state where an OEM program performs the way it was designed to at every dealership in the network — not just the high-performers. Achieved when central intent and store-level action run through one shared system.',
  },
  {
    term: 'OEM', category: 'Domain',
    short: 'Original Equipment Manufacturer — the automotive brand/manufacturer.',
    definition:
      'Original Equipment Manufacturer. In Relayer’s world, the vehicle manufacturer that designs customer-experience programs centrally and depends on an independent dealer network to execute them. Relayer’s primary buyer.',
    aliases: ['manufacturer', 'Original Equipment Manufacturer'],
  },
  {
    term: 'Dealer Group', category: 'Domain',
    short: 'An operator running multiple dealership stores, often across OEM brands.',
    definition:
      'A company operating one or more dealership stores, frequently across multiple manufacturer brands. Dealer groups are where OEM programs are actually executed — and a key Relayer audience, since the shared layer gives them clarity instead of one more manufacturer portal to log into.',
    aliases: ['dealer', 'dealership group'],
  },
  {
    term: 'Technology Partner', category: 'Domain',
    short: 'A platform/vendor that integrates with Relayer to extend the shared layer.',
    definition:
      'A software platform or service provider that integrates with Relayer — DMS, CRM, survey, or customer-experience vendors — so the shared operational layer connects to the systems OEMs and dealers already run. The third audience alongside OEMs and dealer groups.',
  },
  {
    term: 'CSI', category: 'Domain',
    short: 'Customer Satisfaction Index — the OEM’s headline post-sale satisfaction metric.',
    definition:
      'Customer Satisfaction Index. The survey-based score manufacturers use to measure post-sale customer satisfaction at the dealer level. Foundational to OEM programs — but on its own a lagging score, not an operating signal. Relayer’s thesis is that CSI is necessary but not sufficient.',
    aliases: ['Customer Satisfaction Index'],
  },
  {
    term: 'Customer Care Layer', category: 'Product',
    short: 'Relayer’s product category — the AI layer that runs post-sale customer care for OEMs.',
    definition:
      'How Relayer describes its own category: the AI customer care layer for OEMs. It sits above existing systems and coordinates post-sale customer care across the dealer network, turning fragmented programs into consistent, measurable execution.',
    aliases: ['AI customer care layer'],
  },
  {
    term: 'Product Briefing', category: 'Go-To-Market',
    short: 'Relayer’s private, qualified demo for manufacturers and partners.',
    definition:
      'The named sales motion: a private briefing — not an open self-serve signup — for manufacturers and qualified partners. Covers the post-sale gap, how the platform works, and a tailored path to implementation. The primary CTA across the marketing site ("Request a briefing").',
    aliases: ['briefing', 'request a briefing', 'book a demo'],
  },
];

const DOCUMENTS: Array<{ title: string; category: string; topic: string; body: string }> = [
  {
    title: 'Relayer Positioning & Messaging',
    category: 'reference',
    topic: 'Positioning & Messaging',
    body: `# Relayer — Positioning & Messaging

## One-liner
**Relayer is the AI customer care layer for OEMs** — replacing fragmented post-sale systems with shared visibility and consistent execution across dealer networks.

## The problem we name: the post-sale gap
Manufacturers invest millions in customer satisfaction programs. Dealers are expected to execute them. Between the two, there's no shared system — just surveys, scores, and blind spots.

> The OEMs that see first, move first.

## The shift we sell
| Before — Fragmented | After — Seamless |
|---|---|
| OEMs and dealers operate in disconnected systems after the sale. | OEMs and dealers work from one shared operational system. |
| Programs launched centrally, executed locally, with no shared visibility. | Execution becomes consistent across the network; outcomes become measurable. |
| Performance is hard to measure; consistency varies store to store. | Programs perform the way they were designed to — regardless of the store. |

## Message pillars
1. **Purpose-built for OEMs managing dealer networks at scale.**
2. **AI-powered workflows** — the layer does the coordinating work, not another dashboard to staff.
3. **OEM + dealer visibility** — one shared view, not two disconnected ones.
4. **Network-wide execution** — every store, not just the high performers.

## Tone
Confident, operator-grade, low-hype. We describe a structural gap and a system that closes it. Avoid generic "AI transformation" language — be specific to automotive post-sale.`,
  },
  {
    title: 'Ideal Customer Profile & Buying Committee',
    category: 'reference',
    topic: 'Ideal Customer Profile',
    body: `# Ideal Customer Profile & Buying Committee

## Primary ICP — OEMs
Automotive manufacturers running customer-experience / customer-satisfaction programs across an independent dealer network at national or regional scale.

**Strong fit signals**
- Established CSI program but limited visibility into store-level execution.
- Recent leadership focus on retention, post-sale experience, or network consistency.
- A dealer network large enough that "manage it by spreadsheet + portal logins" has broken down.

## Buying committee (OEM)
| Role | Cares about | How Relayer lands |
|---|---|---|
| VP Customer Experience / Owner Loyalty | Program performing as designed network-wide | Network-wide execution, measurable outcomes |
| Network / Field Operations | Store-level consistency, field-team leverage | Operating signals instead of after-the-fact scores |
| Customer Insights / Analytics | Turning survey data into action | Survey scores → operating signals |
| IT / Procurement | Integration, security, fit with existing stack | Layer above existing systems; technology-partner integrations |

## Secondary audiences
- **Dealer groups** — want clarity and fewer disconnected manufacturer portals; the shared layer benefits them, not just the OEM.
- **Technology partners** — DMS / CRM / survey / CX vendors who integrate to extend the layer.

## Disqualifiers
- No dealer network (direct-to-consumer only) — the gap we close doesn't exist.
- Seeking a cheap survey tool — we are not a survey vendor; we sit above them.`,
  },
  {
    title: 'Platform Overview — How Relayer Works',
    category: 'guide',
    topic: 'Capabilities',
    body: `# Platform Overview — How Relayer Works

Relayer sits **above** the systems OEMs and dealers already run and coordinates post-sale customer care across the network.

## The three pillars
1. **AI-powered workflows** — the layer does the coordinating work: routing, follow-up, and surfacing what needs attention, rather than adding another dashboard to staff.
2. **OEM + dealer visibility** — one shared operational view both sides work from, replacing two disconnected ones.
3. **Network-wide execution** — programs run consistently at every store, not just the high performers.

## Fragmented → Seamless
The core mechanic: replace fragmented post-sale systems with one shared operational layer, so central program intent and store-level action run through the same system.

## Capabilities (the six)
- Shared visibility across OEM and dealer
- AI workflows for post-sale coordination
- Survey scores translated into operating signals
- Network-wide program execution and consistency
- Measurable, store-level outcomes
- Integration with existing DMS / CRM / survey systems via technology partners

> Note for the team: the marketing /platform page is the canonical public version of this; keep the two in sync when capabilities change.`,
  },
  {
    title: 'Sales Playbook — The Product Briefing',
    category: 'sop',
    topic: 'Sales',
    body: `# Sales Playbook — The Product Briefing

Relayer runs **private briefings**, not open self-serve signups. The briefing is the qualified sales motion.

## Who qualifies
Manufacturers and qualified partners. Private demos only — we screen for fit before booking.

## Qualification (before booking a briefing)
- Is there a dealer network? (No network → disqualify.)
- Is there an existing CSI / customer-experience program?
- Is there executive interest in post-sale consistency or retention?
- Organization type: OEM / Manufacturer · Dealer Group · Technology Partner · Consultant/Advisor.

## Briefing agenda
1. **The post-sale gap** — name the structural problem in their own network.
2. **How the platform works** — the three pillars; fragmented → seamless.
3. **A tailored path to implementation** — what a rollout looks like for them.

## Intake fields (request-a-briefing form)
Full name · work email · company · title · organization type.

## After the briefing
Capture the org type and fit signals in CRM, log the briefing as a meeting in the Brain, and record any commitments as next steps. Decisions made in the briefing (scope, pilot intent) should be recorded as Brain decisions.`,
  },
  {
    title: 'Company Story — Why We Built Relayer',
    category: 'reference',
    topic: 'Company Story',
    body: `# Company Story — Why We Built Relayer

**Relayer is a product of AutoAssist, Inc.** (West Chester, PA).

## Why we built it
We kept seeing the same pattern: manufacturers pour resources into customer satisfaction programs, dealers are handed the job of executing them, and nothing connects the two. The result is surveys, scores, and blind spots — a structural gap that no amount of additional reporting closes.

Relayer was built to be the missing layer: one shared operational system between manufacturers and dealer networks, so programs perform the way they were designed to, at every store.

## What we believe
- Post-sale customer care is an **execution** problem, not a reporting problem.
- A score you can't act on isn't visibility.
- The OEMs that see first, move first.

## Who we are
AutoAssist builds for the automotive post-sale world. Relayer is our answer to the post-sale gap.`,
  },
];

const DECISIONS: Array<{
  title: string; context: string; decision: string; rationale: string;
  alternatives: string; reversibility: 'one_way' | 'two_way'; topicHint: string;
}> = [
  {
    title: 'Go to market OEM-first, not dealer-first',
    context: 'Relayer benefits both manufacturers and dealer groups. We had to choose a primary buyer to build the motion around.',
    decision: 'Lead with OEMs/manufacturers as the primary buyer and economic owner. Dealer groups and technology partners are positioned as secondary audiences who benefit from the shared layer.',
    rationale: 'The post-sale gap is funded by the OEM (they own the satisfaction programs and the budget). The OEM is the only party who can mandate a network-wide shared layer. Selling dealer-first would fragment adoption store by store — the exact problem we exist to solve.',
    alternatives: 'Dealer-group-first land-and-expand; partner-led (sell through DMS/CRM vendors). Both deferred — useful as expansion channels once OEM proof exists.',
    reversibility: 'two_way',
    topicHint: 'Go-To-Market',
  },
  {
    title: 'Frame the category as "the post-sale gap" / "shared operational layer"',
    context: 'We needed a single, ownable problem statement that a CX/owner-loyalty exec recognizes instantly.',
    decision: 'Anchor all messaging on "the post-sale gap" as the problem and "the shared operational layer" as the solution, with a Before/Fragmented → After/Seamless contrast.',
    rationale: 'It names a structural problem buyers already feel but lack language for, and it positions Relayer above (not against) existing surveys/CSI tools — avoiding a feature-by-feature bake-off with survey vendors.',
    alternatives: '"AI for automotive CX" (too generic, invites AI-hype skepticism); "CSI improvement platform" (boxes us in as a survey add-on).',
    reversibility: 'two_way',
    topicHint: 'Positioning & Messaging',
  },
  {
    title: 'Demo via private, qualified briefings — not open self-serve signup',
    context: 'Deciding the primary site CTA and lead motion for an enterprise automotive buyer.',
    decision: 'Primary CTA is "Request a briefing" — a private, qualified demo for manufacturers and partners. No open self-serve trial on the marketing site.',
    rationale: 'The buyer is an enterprise committee with a considered purchase; a tailored briefing that names their network’s gap converts far better than a self-serve trial, and lets us screen for fit (dealer network present, active CSI program) before investing sales time.',
    alternatives: 'Open self-serve trial; "watch a demo video" gate. Rejected for an enterprise motion at this stage.',
    reversibility: 'two_way',
    topicHint: 'Sales',
  },
  {
    title: 'Brand system: forest + mint, Space Grotesk / Hanken Grotesk',
    context: 'The source site used a proprietary Framer font ("Artific Trial") we can’t license for the migrated site.',
    decision: 'Adopt forest green (#032916) + mint (#23EE92) on cream (#E1DDD5) as the palette, with Space Grotesk (headings) and Hanken Grotesk (body) substituting for Artific Trial. Pill CTAs at radius 52px with an arrow icon.',
    rationale: 'Preserves the live brand’s look and color relationships verified from computed styles, while staying on licensable fonts. Keeps the migrated SimplerDevelopment site a near-exact visual match.',
    alternatives: 'Licensing Artific Trial (pending/uncertain); a fully fresh type system (loses brand continuity).',
    reversibility: 'two_way',
    topicHint: 'Brand System',
  },
];

const INITIATIVES: Array<{ name: string; description: string; status: 'planned' | 'active'; priority: 'low' | 'medium' | 'high' | 'critical' }> = [
  {
    name: 'Marketing site launch (relayer.simplerdevelopment.com)',
    description: 'Migrate userelayer.com into SimplerDevelopment and expand the single Framer page into a full marketing site (home, platform, solutions, about, contact, blog). Wire real lead capture on the briefing forms before go-live; re-host Framer CDN assets for independence.',
    status: 'active', priority: 'high',
  },
  {
    name: 'OEM pilot program',
    description: 'Land a first manufacturer pilot to prove network-wide execution and turn survey scores into operating signals on a real dealer network. Source pilots through qualified product briefings.',
    status: 'planned', priority: 'critical',
  },
  {
    name: 'Technology partner integrations',
    description: 'Integrate with the DMS / CRM / survey / CX systems OEMs and dealers already run so the shared operational layer connects to existing stacks. Establishes the technology-partner audience as an expansion channel.',
    status: 'planned', priority: 'medium',
  },
];

// ─── Seed ───────────────────────────────────────────────────────────────────

async function main() {
  const redacted = DATABASE_URL.replace(/:\/\/[^@]*@/, '://[REDACTED]@');
  console.log(`\nRelayer Brain seed → clientId ${CLIENT_ID}, actor ${ACTOR_ID}`);
  console.log(`DB: ${redacted || '(socket/default)'}\n`);

  const { db } = await import('@/lib/db');
  const { eq, and } = await import('drizzle-orm');
  const schema = await import('@/lib/db/schema');
  const { getOrCreateBrainProfile, updateBrainProfile } = await import('@/lib/brain/profiles');
  const { createTopic, listTopics } = await import('@/lib/brain/topics');
  const { createGlossaryTerm } = await import('@/lib/brain/glossary');
  const { createDocument, editDraftVersion, publishDocument } = await import('@/lib/brain/documents');
  const { createDecision } = await import('@/lib/brain/decisions');
  const { createInitiative } = await import('@/lib/brain/initiatives');

  // 0. ENTITLEMENT + PROFILE ---------------------------------------------------
  const trialUntil = new Date();
  trialUntil.setFullYear(trialUntil.getFullYear() + 1);
  await db.update(schema.clients).set({ brainTrialUntil: trialUntil }).where(eq(schema.clients.id, CLIENT_ID));
  console.log(`✓ entitlement: brainTrialUntil → ${trialUntil.toISOString().slice(0, 10)}`);

  await getOrCreateBrainProfile(CLIENT_ID, 'Relayer');
  await updateBrainProfile(CLIENT_ID, {
    name: 'Relayer',
    industryTemplate: 'generic',
    enabled: true,
    enabledModules: { knowledge: true, ask: true, meetings: true, tasks: true, automations: true, calendar: true },
    serviceLines: ['OEM Customer Care', 'Dealer Network Enablement'],
  });
  console.log('✓ brain profile enabled (knowledge + ask modules on)');

  // 1. TOPICS ------------------------------------------------------------------
  const existingTopics = await listTopics(CLIENT_ID);
  const topicByName = new Map(existingTopics.map((t) => [t.name.toLowerCase(), t]));
  async function ensureTopic(name: string, parentId: number | null, extra: { description?: string; color?: string; icon?: string } = {}) {
    const hit = topicByName.get(name.toLowerCase());
    if (hit) return hit;
    const created = await createTopic(CLIENT_ID, ACTOR_ID, { name, parentId, ...extra });
    topicByName.set(name.toLowerCase(), created);
    return created;
  }
  let topicCount = 0;
  for (const branch of TOPICS) {
    const parent = await ensureTopic(branch.name, null, { description: branch.description, color: branch.color, icon: branch.icon });
    topicCount++;
    for (const child of branch.children) {
      await ensureTopic(child, parent.id, { color: branch.color });
      topicCount++;
    }
  }
  console.log(`✓ topics: ${topicCount} ensured (${TOPICS.length} branches)`);

  // 2. GLOSSARY ----------------------------------------------------------------
  const existingTerms = await db
    .select({ term: schema.brainGlossaryTerms.term })
    .from(schema.brainGlossaryTerms)
    .where(eq(schema.brainGlossaryTerms.clientId, CLIENT_ID));
  const haveTerm = new Set(existingTerms.map((r) => r.term.toLowerCase()));
  let glossAdded = 0;
  for (const g of GLOSSARY) {
    if (haveTerm.has(g.term.toLowerCase())) continue;
    await createGlossaryTerm(CLIENT_ID, ACTOR_ID, {
      term: g.term,
      definition: g.definition,
      shortDefinition: g.short,
      aliases: g.aliases ?? [],
      category: g.category,
      status: 'active',
      source: 'manual',
    });
    glossAdded++;
  }
  console.log(`✓ glossary: ${glossAdded} added, ${GLOSSARY.length - glossAdded} already present`);

  // 3. DOCUMENTS (create → set draft body → publish) ---------------------------
  const existingDocs = await db
    .select({ title: schema.brainDocuments.title })
    .from(schema.brainDocuments)
    .where(eq(schema.brainDocuments.clientId, CLIENT_ID));
  const haveDoc = new Set(existingDocs.map((r) => r.title.toLowerCase()));
  let docsAdded = 0;
  for (const d of DOCUMENTS) {
    if (haveDoc.has(d.title.toLowerCase())) continue;
    const topic = topicByName.get(d.topic.toLowerCase());
    const { document } = await createDocument(CLIENT_ID, ACTOR_ID, {
      title: d.title,
      category: d.category as any,
      defaultTopicIds: topic ? [topic.id] : [],
    });
    await editDraftVersion(CLIENT_ID, ACTOR_ID, document.id, { body: d.body, summary: d.title });
    await publishDocument(CLIENT_ID, ACTOR_ID, document.id);
    docsAdded++;
  }
  console.log(`✓ documents: ${docsAdded} created + published, ${DOCUMENTS.length - docsAdded} already present`);

  // 4. DECISIONS ---------------------------------------------------------------
  const existingDecisions = await db
    .select({ title: schema.brainDecisions.title })
    .from(schema.brainDecisions)
    .where(eq(schema.brainDecisions.clientId, CLIENT_ID));
  const haveDecision = new Set(existingDecisions.map((r) => r.title.toLowerCase()));
  let decAdded = 0;
  for (const d of DECISIONS) {
    if (haveDecision.has(d.title.toLowerCase())) continue;
    await createDecision(CLIENT_ID, ACTOR_ID, {
      title: d.title,
      context: d.context,
      decision: d.decision,
      rationale: d.rationale,
      alternativesConsidered: d.alternatives,
      reversibility: d.reversibility,
    });
    decAdded++;
  }
  console.log(`✓ decisions: ${decAdded} added, ${DECISIONS.length - decAdded} already present`);

  // 5. INITIATIVES -------------------------------------------------------------
  const existingInits = await db
    .select({ name: schema.brainInitiatives.name })
    .from(schema.brainInitiatives)
    .where(eq(schema.brainInitiatives.clientId, CLIENT_ID));
  const haveInit = new Set(existingInits.map((r) => r.name.toLowerCase()));
  let initAdded = 0;
  for (const i of INITIATIVES) {
    if (haveInit.has(i.name.toLowerCase())) continue;
    await createInitiative(CLIENT_ID, ACTOR_ID, {
      name: i.name,
      description: i.description,
      status: i.status,
      priority: i.priority,
      ownerId: ACTOR_ID || null,
    });
    initAdded++;
  }
  console.log(`✓ initiatives: ${initAdded} added, ${INITIATIVES.length - initAdded} already present`);

  console.log('\nRelayer Brain seed complete. View at /portal/brain (logged in as the Relayer tenant).\n');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nSEED FAILED:', e);
    process.exit(1);
  });
