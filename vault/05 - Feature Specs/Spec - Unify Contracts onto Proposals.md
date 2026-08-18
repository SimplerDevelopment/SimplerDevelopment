---
type: spec
domain: crm
status: proposed
date: 2026-07-03
sku: PUX-013
sources:
  - lib/db/schema/crm.ts
  - app/portal/crm/proposals/[id]/page.tsx
  - app/portal/crm/contracts/[id]/page.tsx
  - lib/esign/
  - lib/mcp/tools/crm.ts
  - app/api/portal/crm/contracts/
---

# Feature: Unify CRM Contracts onto the Proposals Engine

## Overview

CRM has two overlapping document systems. **Proposals** (`crmProposals`) are the fleshed-out one: an editable section builder (7 fixed types), a wired template library, duplicate, a public tokenized share page (`/proposal/[token]`), view tracking, and in-house click-to-sign (typed name + drawn signature, IP-stamped — *not* legally binding). **Contracts** (`crmContracts`) are thinner in the UI (clauses render read-only; the create dialog exposes only title/summary/contact/deal/signer) but carry real legal weight via two parallel signing systems and a full audit trail. Goal: make a contract a **contract-mode of the shared proposal document** — inheriting the rich builder/templates/send/track — while preserving the legal machinery contracts need.

## Current state (verified)

**Proposals** — `crmProposals` (`crm.ts:173-210`): `sections` (json, types text/heading/image/divider/pricing/terms/signature), `lineItems`/`fees` (`ProposalLineItem`/`ProposalFee`), `clientToken`, view tracking (`viewCount`/`firstViewedAt`/`lastViewedAt`), in-house signature (`signatureName`/`signatureData`/`signedAt`/`signedIp`), branding. Templates (`crmProposalTemplates`) wired (API + create dialog). **REST routes have NO service gate** (base session auth only); MCP write tools gate `requireService('crm')` + route through `stageOrApply`.

**Contracts** — `crmContracts` (`crm.ts:242-285`): `proposalId` (vestigial FK, no conversion code), `clauses`, reuses `ProposalLineItem`/`ProposalFee`, `documentHash` (tamper detection), void semantics (`voidedAt`/`voidReason`; `contracts_void` blocks voiding `fully_executed`), plus a full **DropboxSign** block (`esignProvider`/`esignStatus`/`esignProviderRequestId`/`esignAuditFileUrl`/reminder fields). Two signing systems coexist:
1. **In-house multi-signer** — `crmContractSigners` (per-signer token, order, drawn signature) + `/contract/[token]`; on all-signed → `fully_executed`. **No signer-management UI in the portal.**
2. **DropboxSign** — `lib/esign/` (`dropbox-sign.ts`, `contract-pdf.ts`, `status-machine.ts`), single legally-binding signer; `send-for-signature` renders a branded PDF, meters usage (`usageMeterEvents`, resource `esign_envelopes`, the `esign` Stripe meter), and only webhooks may promote to `signed`.
`crmContractSigningEvents` is the append-only audit trail. `crmContractTemplates` exists in schema but is **dead code** (no route/UI/tool).

## Recommended approach

**Contracts-as-a-mode on a shared content model** — *not* backfilling proposals wholesale with e-signature (e-sign is a deliberately separate paid module; proposals are ungated).

1. **Shared content core**: factor the section/lineItem/fee editor + template picker + public render + view tracking into a shared "document" engine that both proposal-mode and contract-mode use. Lowest-risk shape: keep `crmContracts` as a distinct table (it is referenced by `crmContractSigningEvents`, `crmContractSigners`, and the reminder cron — don't break those FKs) but drive its content/editor from the shared proposal component + wire the orphaned `crmContractTemplates` using the proposals-template pattern.
2. **"Create contract from proposal"**: implement the conversion the vestigial `proposalId` FK implies — copy `sections`→`clauses` (map section types), `lineItems`/`fees` verbatim, branding. Surface it as an action on the proposal detail page.
3. **Preserve legal machinery as contract-mode extensions**: DropboxSign send/cancel/sign-url/signing-events, `documentHash`, `crmContractSigningEvents`, void semantics stay contract-only.
4. **Rich clause editing**: give contracts the same editable section builder proposals have (clauses are read-only in the UI today).

## Bugs to fix regardless of scope (found during scouting)
- **Entitlement mismatch (paid-module leak).** REST contract routes require `requireService('esign')`, but MCP `contracts_create`/`contracts_void` only require `'crm'` — a CRM-only (non-esign) client can create/void contracts + seed signers via MCP that the REST API/UI would refuse. Violates `.claude/rules/tenancy.md` "paid-module writes need the entitlement gate." **Any e-sign-triggering action must gate on `'esign'`.**
- **Event-name collision.** The contract-signing route fires `emitEvent('proposal.accepted', ...)` for a *contract* (`app/api/contracts/[token]/route.ts:157`). Add distinct contract events (`contract.signed` / `contract.executed`).
- MCP contract writes bypass `stageOrApply` (proposals use it) — reconcile for approval-workflow consistency.

## Scope
In scope: shared document engine (builder/templates/public render/view tracking) powering both modes; create-contract-from-proposal; editable clauses; wire contract templates; fix the entitlement + event-name bugs; add `contract` to the `crmDealArtifacts.artifactType` set so contracts show in a deal's pinned artifacts.
Out of scope: replacing DropboxSign; changing the billing meter; multi-provider e-sign.

## Risks
- **Legal-binding regression**: don't let a unified "send" default fully-executed contracts to the informal drawn-signature flow — DropboxSign must stay the binding path, gated + metered.
- **Migration safety**: existing `crmContracts` rows + their signer/audit/cron dependencies must not break — prefer shared-component reuse over collapsing tables.
- Tenancy: everything `clientId`-scoped; `bun test:tenancy` after any schema/data-access change.

## Effort
**XL** (multi-phase): shared engine extraction (L), from-proposal conversion (M), editable clauses + templates (M), bug fixes (S). Ship the two entitlement/event bug fixes first — they're small and correctness-critical.

## Related
[[CRM]] | [[Spec - Unified Automations Hub]] | [[Agency, Onboarding & Branding]]
