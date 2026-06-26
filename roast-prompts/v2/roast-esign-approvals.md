# Roast V2: E-Sign & Approvals — SimplerDevelopment

**How to use:** Run `/roast` and feed it this brief (it has enough context to skip the clarifying questions). The council judges **two lenses**: (A) does this module earn its place inside the all-in-one platform, and (B) could it stand alone as its own product.

## The idea

SimplerDevelopment's E-Sign & Approvals domain is the **AI governance keystone of the platform** — the human-in-the-loop gate that makes agentic content publishing safe enough to hand to an agency's ops lead. When an MCP-keyed AI agent makes a CMS mutation (edit a post, publish a survey, send an email campaign, activate a booking page), the change is staged as a pending approval and the human approves or rejects via a one-click tokenized URL — no login required, with a WYSIWYG live-site iframe preview at desktop and mobile viewports, scoped by a page-bound HMAC token. Eight approvable entity types map directly to the AI actions agencies will want to gate. This is the module's headline and its defensible identity.

Native e-signature is a **secondary layer** scoped explicitly to informal, internal, and low-stakes sign-offs (internal NDAs, vendor letters, lightweight service addendums). All money-bearing and legally-consequential contracts route through the DropboxSign embedded path already built — per-signer tokens, PDF generation, webhook state machine, and DropboxSign's own court-admissible audit trail. The two sub-systems share an approval inbox alongside brain review items, service requests, and project suggestions, but with a triage hierarchy that keeps overdue contracts visually distinct from routine AI post approvals.

## Who it's for & how it makes money

- **Primary buyer:** Digital agencies running SD as their business OS — they need a structural trust gate before deploying AI agents to publish to client sites, and a low-friction way to execute routine agreements without paying per-signature DropboxSign fees on every vendor letter.
- **End user:** External clients and signers — they click a URL, see a preview (or contract), and approve/sign without any SD account.
- **Monetization:** Bundled in the SD subscription. No standalone ambition — bundled retention layer. The native signing path has zero per-signature cost and earns its place by covering the internal/low-stakes tier. Legally-consequential contracts use DropboxSign; the per-signature fee is either passed through or absorbed per tier (billing treatment in the data model is a committed pre-go-live item — see Constraints). The AI-agent approval queue is the highest-value component: it is the trust layer agencies need before deploying agentic workflows at all.

## The edge

- **AI-native approval queue is the governance keystone — no standalone tool offers this.** DocuSign approves contracts; it does not stage a pending AI-authored blog post or booking page activation for human review before publishing. The eight approvable entity types (posts, pitch decks, campaigns, surveys, booking pages, block templates, pending CMS mutations, and generic changes) map exactly to the agentic jobs agencies will actually run. No point tool competes here because the queue requires owning the CMS, the MCP surface, and the approval inbox in one session.
- **WYSIWYG preview before approval.** External reviewers see the actual live-site iframe (desktop/mobile toggle) via page-scoped HMAC tokens — not a text diff or a JSON blob. A leaked token can only view that one page; the route rejects on `clientId` mismatch, not by convention.
- **Tenancy is structural.** The 64-char token captures `clientId` at mint time. A leaked approval URL cannot preview another tenant's content.
- **One approval inbox with triage hierarchy.** The ops lead sees AI CMS changes, brain review items, service requests, overdue contracts, and project suggestions in one view — overdue contracts surfaced at the top, low-stakes AI approvals below. One place, no tab-switching.
- **Native signing eliminates per-signature cost for the internal tier.** Agencies handling high volumes of routine agreements can bypass DropboxSign fees for that class entirely. This is an honest cost-savings claim for the tier it actually covers.
- **DropboxSign path already ships for real contracts.** PDF generation, webhook state machine, embedded signing URL, and DropboxSign's legally-defensible audit trail are live. Agencies do not have to trust SD's native signing for anything consequential.

## Constraints

- Solo founder / tiny team; SD is already a ~357k-line shipping monorepo (Next.js 16, Drizzle/Postgres+pgvector, Mastra agents), now open-sourcing.
- **GO-LIVE BLOCKER — native signing for contractual use:** The current native signing path (base64 PNG, SHA-256 tamper detection) is NOT court-admissible for contested contracts. It lacks consent capture (signer acknowledgment of intent-to-sign), IP/device attribution, and trusted timestamping. This is real code and compliance work. Until this gap is closed, the native path is documented and marketed only for informal/internal/low-stakes sign-offs. The DropboxSign path is the default for all money-bearing agreements. This blocker must be closed before native signing is positioned for anything contractual.
- **GO-LIVE BLOCKER — DropboxSign billing treatment:** The absorb-vs-passthrough decision for DropboxSign per-signature fees is unresolved in the data model. This must be hardened before scale-tier onboarding to avoid surprise P&L exposure.
- The approval queue's full value depends on agencies handing AI agents the publish button — Thales/Gartner evidence puts broad agentic CMS adoption 12–24 months out. The queue ships now as forward-positioned infrastructure and is marketed honestly as "where agencies are going," not a feature with broad day-one utilization.
- Must beat or credibly substitute the best-of-breed point tools agencies already pay for: DocuSign, Dropbox Sign (HelloSign), PandaDoc, SignWell — for the contractual tier via DropboxSign, not by native replacement.

## Roast it on two lenses

1. **Earns its place in the suite?** Does the AI-governance approval queue create real differentiation and lock-in — or is it premature infrastructure for an agentic adoption curve that's 12–24 months out, and does restricting native signing to informal use cases leave the module feeling thin?
2. **Could it stand alone?** No standalone ambition — bundled retention layer. Lens B should pressure-test whether the bundled positioning is strategically durable or whether a well-funded competitor (DocuSign, HelloSign) can bolt on an "AI staging queue" and neutralize the wedge in one product cycle.

## Riskiest assumption to pressure-test

That the AI-approval queue ships as a live, utilized feature rather than as governance infrastructure that sits idle. The de-risked posture: instrument production telemetry to count how many AI-staged CMS mutations have actually flowed through the pending-change queue across live tenants, and run 5 agency interviews asking "have you handed an AI agent the publish button yet, or do you still paste-and-publish yourself?" If the queue is logging zero real mutations, market it honestly as forward-positioned infrastructure with a clear adoption on-ramp (small-scope agentic tasks first), and let DropboxSign carry the near-term contract value. The queue's real test is whether agencies who start using AI-authored content find the approval UX frictionless enough to keep agents in the loop rather than reverting to manual review.
