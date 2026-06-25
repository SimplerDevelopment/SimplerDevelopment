# Roast: E-Sign & Approvals — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea
SimplerDevelopment's E-Sign & Approvals domain fuses two related but distinct systems under one "a human must authorize before this goes live" concept. The first is an **AI-agent approval queue**: when an MCP-keyed AI agent makes a CMS mutation (edit a post, publish a survey, send an email campaign, activate a booking page), it is staged as a pending change and the human approves or rejects via a one-click tokenized URL — no login required, with a WYSIWYG live-site iframe preview scoped to the exact page at desktop and mobile viewports. The second is **contract e-signature**: agencies build contracts (clauses, line items, fees) in the CRM, then either send them via a native multi-signer path (Resend emails, per-signer tokens, base64 PNG signature capture, SHA-256 tamper detection) or through a DropboxSign embedded signing flow (PDF generation, webhook state machine, embedded URL). Both sub-systems share a tenancy-locked token model and coexist in the same portal approval queue alongside brain review items, service requests, and project suggestions.

## Who it's for & how it makes money
- **Primary buyer:** Digital agencies running SD as their business OS — they need both a way to approve AI-drafted content before it goes live on client sites, and a way to get contracts signed without paying per-signature DocuSign fees.
- **End user:** External clients and signers — they click a URL, see a preview (or contract), and approve/sign without any SD account.
- **Monetization:** Bundled in the SD subscription. The native signing path has no per-signature cost. The DropboxSign path carries the provider's per-signature fee, which SD passes through or absorbs depending on tier. AI-agent-gated approvals are the highest-value use case: they're the trust layer agencies need before deploying agentic workflows at all.

## The edge
- **AI-native approval queue is novel by construction.** The pending-change queue exists specifically because AI agents need a human-in-the-loop gate. No standalone e-sign tool has this: DocuSign approves contracts, not AI-authored blog posts or booking page activations. The 8 approvable entity types (posts, pitch decks, campaigns, surveys, booking pages, block templates, and generic pending changes) map exactly to the AI actions agencies will actually want to gate.
- **WYSIWYG preview before approval.** External reviewers see the actual live-site iframe (desktop/mobile toggle) using page-scoped HMAC tokens — not a text diff or a JSON blob. The security model is tight: a leaked token can only view that one page, not enumerate the entire site.
- **Native signing path eliminates per-signature cost.** Agencies doing high contract volume can bypass DropboxSign entirely. SHA-256 tamper detection, per-signer order, per-signer tokens, and audit timestamps are all built-in.
- **One approval inbox.** The admin and portal queues aggregate AI CMS changes, brain review items, service requests, and suggested projects. The agency's ops lead sees everything in one place instead of checking separate tabs per tool.
- **Tenancy is structural.** The 64-char token captures `clientId` at mint time. A leaked approval URL cannot preview another tenant's content — the route rejects on `clientId` mismatch, not just by convention.

## Constraints
- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: DocuSign, Dropbox Sign (HelloSign), PandaDoc, SignWell.
- Time-to-first-dollar and maintainability by a tiny team both matter.

## Roast it on two lenses
1. **Earns its place in the suite?** Does this module beat or credibly replace the point tools above, and does bundling it create real value/lock-in — or is it a shallow me-too that dilutes focus and adds maintenance drag?
2. **Could it stand alone?** Spun out as its own SaaS, is there a real market, a wedge, and a path to first dollar — or does it only survive inside the bundle?

## Riskiest assumption to pressure-test
That agencies will route AI-authored content through a pending-change approval queue at all — i.e., that they will actually deploy AI agents to write and publish CMS content, rather than treating AI as a drafting assistant they manually review before touching "publish" themselves. If that adoption pattern never materializes, the approval queue is overhead, and the e-sign module has to compete with DocuSign on standalone merit with a native path that lacks legally-enforceable audit trails in regulated markets.
