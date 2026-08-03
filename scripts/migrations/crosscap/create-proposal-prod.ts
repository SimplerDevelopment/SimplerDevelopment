/**
 * Create / maintain the SimplerDevelopment engagement PROPOSAL for Crossover
 * Capital Advisors (client 103) on the PROD metro DB. Content mirrors the
 * "An Agentic OS for Crossover Capital" deck (deck 365); pricing is at $150/hr.
 *
 * Shapes match the PUBLIC proposal renderer (app/proposal/[token]/page.tsx):
 *   - heading sections use `content` (not `title`)
 *   - text sections are HTML (rendered via sanitizeHtml) — use <p>/<ul>/<li>
 *   - a `{ type: 'pricing' }` section renders the line-item table
 *   - line items use `qty` (not `quantity`), unitPrice in CENTS, `optional`
 *   - status must be 'sent' (the API 404s drafts)
 *
 * Idempotent + maintainable: upserts by (client_id, title). Re-run after the
 * deck changes to keep the proposal in sync — the client_token (share link)
 * stays stable across re-runs.
 *
 *   DATABASE_URL="postgresql://...@metro.proxy.rlwy.net:25565/railway" \
 *     bun scripts/migrations/crosscap/create-proposal-prod.ts
 */

import postgres from 'postgres';
import { randomBytes } from 'crypto';

const CLIENT_ID = 103;
const TITLE = 'SimplerDevelopment × Crossover Capital — Agentic OS Engagement';
const RATE = 15000; // $150/hr in cents
const ACCENT = '#cfa122';
const FOOTER = 'SimplerDevelopment LLC · prepared with Cody York (CY Strategies). Estimates at $150/hr; final scope confirmed on kickoff.';

const SUMMARY =
  'A dedicated agentic operating system for Crossover Capital — a custom AI dashboard built on the platform foundation already live in your portal, followed by a fractional-CTO retainer. Spun up in a single-tenant instance of your own. Engagement billed at $150/hr.';

// Heading sections use `content`; text sections are HTML; one `pricing` section
// renders the line-item table.
const sections = [
  { id: 'ov-h', type: 'heading', content: 'Engagement Overview' },
  { id: 'ov', type: 'text', content:
    '<p>SimplerDevelopment will stand up a dedicated &ldquo;agentic operating system&rdquo; for Crossover Capital: one connected platform &mdash; website, CRM, Company Brain, content, booking and more &mdash; with a custom AI dashboard on top that lets Alex run the business by simply asking. Everything runs in a single-tenant instance spun up for your firm alone.</p>' +
    '<p>We start with a scoped build (Phase&nbsp;1) and continue as your fractional CTO on a month-to-month retainer (Phase&nbsp;2). All work is billed at $150/hr; good-faith estimates are below.</p>' },

  { id: 'built-h', type: 'heading', content: "What's Already Built" },
  { id: 'built', type: 'text', content:
    '<p>In a few weeks we built and proved the foundation &mdash; ready to lift into your dedicated instance:</p>' +
    '<ul>' +
    '<li>Branded website (crosscap-advisors.simplerdevelopment.com)</li>' +
    '<li>Company Brain &mdash; 69 notes, your Form ADV / Form CRS / Privacy docs, a 28-term glossary, fully embedded and searchable (RAG)</li>' +
    '<li>CRM &mdash; 1,416 attorney contacts and 1,226 firms, scraped and enriched by an autonomous run (the Attorney Referral Network)</li>' +
    '<li>Booking, email marketing, and a survey, all wired to the CRM</li>' +
    '<li>MCP / OAuth connectivity so Claude can already drive content and data</li>' +
    '</ul>' },

  { id: 'opp-h', type: 'heading', content: 'The Opportunity' },
  { id: 'opp', type: 'text', content:
    '<p>Today the stack is fragmented &mdash; Hazel, Wealthbox, Orion, QuickBooks and Study don&rsquo;t talk, so work lands on Alex and leads go cold. The agentic OS makes SimplerDevelopment the single source of truth (the &ldquo;warehouse&rdquo;), Claude the driver that reasons over it, and MCP the wiring that connects ~20 domains &mdash; so the whole business answers a single question.</p>' },

  { id: 'plat-h', type: 'heading', content: 'The Platform — Everything in One Place' },
  { id: 'plat', type: 'text', content:
    '<p>One connected system replaces a pile of disconnected tools and logins:</p>' +
    '<ul>' +
    '<li>Website &amp; CMS</li><li>CRM &amp; pipelines</li><li>Email marketing (replaces Mailchimp)</li>' +
    '<li>Forms &amp; surveys (route into the CRM)</li><li>Booking &amp; scheduling (replaces Calendly)</li>' +
    '<li>Proposals &amp; e-sign</li><li>Slide decks</li><li>Project board (Kanban)</li><li>Company Brain</li>' +
    '<li>Automations &amp; media library &mdash; all exposed to Claude through one MCP</li>' +
    '</ul>' },

  { id: 'build-h', type: 'heading', content: 'Phase 1 — The Build: Alex’s Agentic Dashboard' },
  { id: 'build', type: 'text', content:
    '<p>A custom CEO dashboard built around how Alex works, pulling QuickBooks, Study, the CRM and the Brain through one MCP &mdash; role-based, so Alex sees signal, not noise:</p>' +
    '<ul>' +
    '<li>At-a-glance health &mdash; revenue, AUM and pipeline in one view</li>' +
    '<li>Leads going cold &mdash; surfaced, not buried</li>' +
    '<li>Right-sized reminders &mdash; nudges that matter, not an overwhelming task list</li>' +
    '<li>Content on autopilot &mdash; the article engine keeps producing; Alex approves</li>' +
    '<li>Blinders by role &mdash; Alex sees what Alex needs; the team sees theirs</li>' +
    '</ul>' },

  { id: 'comp-h', type: 'heading', content: 'Dedicated Instance, Compliance & BYOK' },
  { id: 'comp', type: 'text', content:
    '<p>Built for a fiduciary:</p>' +
    '<ul>' +
    '<li>Dedicated, single-tenant instance &mdash; spun up for your firm alone, never co-mingled</li>' +
    '<li>Bring Your Own Key (BYOK) &mdash; run AI on your own Anthropic or OpenAI key, under your contract and data-processing terms</li>' +
    '<li>Your own boundary &mdash; if your RIA forbids third-party AI, we run a self-hosted or enterprise model so no client data leaves an approved perimeter</li>' +
    '<li>Encrypted in transit and at rest; full audit trail for your CCO; your data is never used to train any model</li>' +
    '<li>Orion &amp; Fidelity stay put; Hazel transcripts flow into the Brain; Wealthbox keep-or-retire; Core CCO sign-off before anything touches client data</li>' +
    '</ul>' },

  { id: 'ret-h', type: 'heading', content: 'Phase 2 — Fractional-CTO Retainer' },
  { id: 'ret', type: 'text', content:
    '<p>After the build, we stay on as your technology steward &mdash; not a vendor you call when something breaks. The retainer covers running and maintaining the OS, new integrations and automations as the firm grows, and ongoing AI / technology advisory.</p>' },

  { id: 'inv-h', type: 'heading', content: 'Investment' },
  { id: 'inv', type: 'text', content:
    '<p>The one-time build is itemized below; all development is billed at <strong>$150/hr</strong>, and the optional integrations block is only added if you select it.</p>' +
    '<p><strong>Ongoing (monthly):</strong></p>' +
    '<ul>' +
    '<li><strong>Platform fee</strong> &mdash; ~$300/mo for your dedicated instance and the SimplerDevelopment platform, plus ~$30/mo per additional user seat.</li>' +
    '<li><strong>Fractional-CTO retainer</strong> &mdash; roughly 15 hours/month (&asymp; $2,250/mo) at $150/hr, month-to-month, to run, extend and advise. Hours scale up or down with need.</li>' +
    '</ul>' +
    '<p>These are good-faith estimates; final scope is confirmed at kickoff.</p>' },

  { id: 'pricing', type: 'pricing', content: '' },

  { id: 'next-h', type: 'heading', content: 'Next Steps' },
  { id: 'next', type: 'text', content:
    '<ol>' +
    '<li>Align with Cody on scope and pricing.</li>' +
    '<li>Present to Alex and the team for buy-in.</li>' +
    '<li>Kick off the build &mdash; stand up your dedicated instance on the foundation already live.</li>' +
    '</ol>' },
];

// One-time line items, priced in hours × $150/hr (unitPrice in cents). Public
// renderer reads `qty` and `optional`.
const lineItems = [
  { id: 'li-discovery', description: 'Discovery & solution design', details: 'Workshops, technical scoping, compliance review', qty: 10, unitPrice: RATE, optional: false },
  { id: 'li-instance', description: 'Dedicated instance stand-up & data migration', details: 'Provision single-tenant deployment and migrate the existing foundation', qty: 15, unitPrice: RATE, optional: false },
  { id: 'li-build', description: 'Agentic dashboard build (Phase 1)', details: 'QuickBooks, Study, CRM & Brain via MCP; role-based access; stale-lead surfacing; content automation', qty: 80, unitPrice: RATE, optional: false },
  { id: 'li-integrations', description: 'Additional third-party integrations', details: 'Estimated block — only billed if selected', qty: 20, unitPrice: RATE, optional: true },
];

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL is required (prod metro public proxy URL).'); process.exit(1); }
  if (url.includes('.railway.internal')) { console.error('Refusing internal Railway URL.'); process.exit(1); }
  const host = url.replace(/.*@([^/]+)\/.*/, '$1');
  if (!/metro\.proxy\.rlwy\.net/.test(host) && process.env.ALLOW_NON_METRO !== '1') {
    console.error(`Host "${host}" is not the metro prod proxy. Set ALLOW_NON_METRO=1 to override.`); process.exit(1);
  }
  console.log(`Targeting: ${url.replace(/:\/\/[^@]+@/, '://***@')}`);
  return postgres(url, { max: 1, idle_timeout: 5 });
}

async function main() {
  const sql = connect();
  const sectionsJson = JSON.stringify(sections);
  const lineItemsJson = JSON.stringify(lineItems);
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const oneTime = lineItems.filter((l) => !l.optional).reduce((s, l) => s + l.qty * l.unitPrice, 0);
  console.log(`Core one-time total: $${(oneTime / 100).toLocaleString()}`);

  const existing = await sql`SELECT id, client_token, status FROM crm_proposals WHERE client_id = ${CLIENT_ID} AND title = ${TITLE} LIMIT 1`;
  let id: number; let token: string;
  if (existing[0]) {
    id = existing[0].id; token = existing[0].client_token;
    await sql`
      UPDATE crm_proposals
      SET summary = ${SUMMARY}, sections = ${sectionsJson}::json, line_items = ${lineItemsJson}::json,
          fees = '[]'::json, accent_color = ${ACCENT}, footer_text = ${FOOTER}, currency = 'USD',
          valid_until = ${validUntil},
          status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
          sent_at = COALESCE(sent_at, NOW()),
          updated_at = NOW()
      WHERE id = ${id}
    `;
    console.log(`Updated proposal ${id} (token preserved; status ensured viewable).`);
  } else {
    token = randomBytes(32).toString('hex');
    const ins = await sql`
      INSERT INTO crm_proposals (client_id, title, summary, status, sections, line_items, fees, currency, valid_until, client_token, accent_color, footer_text, sent_at)
      VALUES (${CLIENT_ID}, ${TITLE}, ${SUMMARY}, 'sent', ${sectionsJson}::json, ${lineItemsJson}::json, '[]'::json, 'USD', ${validUntil}, ${token}, ${ACCENT}, ${FOOTER}, NOW())
      RETURNING id
    `;
    id = ins[0].id;
    console.log(`Created proposal ${id}.`);
  }

  console.log('\n=== PROPOSAL READY ===');
  console.log(`Proposal id: ${id}`);
  console.log(`Portal:  /portal/crm/proposals/${id}`);
  // NOTE: the crosscap-advisors subdomain privacy-gates /proposal, so share the
  // SD (non-gated) host. The /proposal/[token] route resolves globally by token.
  console.log(`Public:  https://simplerdevelopment.com/proposal/${token}`);
  await sql.end();
}

main().catch(async (e) => { console.error(e); process.exit(1); });
