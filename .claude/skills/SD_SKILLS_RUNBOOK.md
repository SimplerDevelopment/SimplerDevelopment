# SimplerDevelopment Content Skills — Runbook

**Audience:** you (or a teammate) driving the four content-authoring skills (`sd-init`, `sd-create-page`, `sd-create-deck`, `sd-create-email`) from Claude Code or claude.ai against the SimplerDevelopment portal MCP.

**As of:** 2026-05-14 — feature verified end-to-end on the local instance (`simplerdev_local_20260514`).

---

## 1. What this stack is, in one paragraph

Four Claude skills that draft CMS pages, pitch decks, and email campaigns into the SimplerDevelopment portal via its MCP. Every create / update mints a public **approval URL** (`/approve/<64-hex-token>`) that a non-authenticated reviewer can open, see the rendered artifact, and approve or reject — no portal login needed. Approving triggers the same publish side-effects an authed admin would (`published=true` on posts, `status='published'` + slide-draft promotion on decks, draft-promotion on templates). Forking duplicates an artifact into a new draft row with a `parent_*_id` pointer — last-write-wins, no merge.

---

## 2. The four skills

### `sd-init` — bootstrap

Run once per project. Resolves the active client, default site, default brand profile + messaging, and the inventory of reusable templates. Writes `.sd/config.json` so subsequent skills read from there instead of re-fetching every run.

**Re-run when:**
- You're starting a new project against a different client.
- The brand profile messaging has been updated in the portal.
- New block_templates or email_templates have been seeded.

### `sd-create-page` — landing / blog / page

`mcp__simplerdevelopment-postcaptain__posts_create` with structured block JSON. Defaults `published: false`. Returns post id + approval URL.

**House rules** (also baked into the skill):
- One block per `id`, one `type` per block, monotonically increasing `order`.
- Headings are `type: 'heading'` with explicit `level`, never styled `text`.
- Pair each section heading with a small uppercase eyebrow text block above it.
- Heroes need title + subtitle + description + CTA — title-only heroes look broken.
- Apply `style` (`color`, `fontSize`, `fontWeight`, `letterSpacing`) for hierarchy; do not lean on defaults.

### `sd-create-deck` — pitch / sales / investor decks

`decks_create` then `decks_replace_slides` in one round-trip. Brand profile (theme) auto-inherits — do NOT pass `theme` unless the user explicitly says "use different colors than the brand profile."

**Important:** `decks_replace_slides` writes to per-slide drafts (`pendingCreate` / regular update drafts). The public renderer sees **the previous live slides** until you call `decks_publish_all` OR the reviewer approves the deck (which auto-promotes the drafts — verified end-to-end).

### `sd-create-email` — campaigns

`email_campaigns_create` tied to a list. Forces `status: 'draft'`. **Approval ≠ send.** Approving the link records a "ready" stamp on the link itself; the campaign stays `draft` until you (or the author) explicitly call `email_campaigns_send` or schedule via the portal.

**Email-block discipline** (constrained vs web):
- Allowed: `text`, `heading`, `image`, `button`, `divider`, `spacer`, `columns` (2-col max), `email-header`, `email-footer`.
- Avoid complex visual-editor blocks (tabs, accordion, marquee, video, embedded HTML).

---

## 3. The approval flow — what happens when

### Statuses on `mcp_approval_links`

| Status | Meaning |
|---|---|
| `pending` | Default at mint. Reviewer can still approve or reject. |
| `approved` | Side-effect ran. Entity has been published / staged change applied. |
| `rejected` | Reviewer declined. Entity untouched. |
| `expired` | `expires_at` is past. Auto-marked on the next GET. POST is refused. |

### Approve side-effects — verified per entity

| Entity type | What approve does |
|---|---|
| `post` | `published=true`, `publishedAt=now`. Revalidates `/sites` + `/portal`. |
| `pitch_deck` | `status='published'` + **runs `decks_publish_all` to promote every slide draft to live**. Verified end-to-end after a route fix (was a bug — flipped status only, slides stayed in draft). |
| `email_campaign` | **No status change.** Approving just stamps the link. Send is a deliberate `email_campaigns_send` after. |
| `block_template` | Draft cleared, `draft.{name,description,category,scope,blocks,...}` copied to live, `version` bumped. If `draft.pendingDelete` was set, the row is deleted. |
| `pending_change` | `applyPendingChange(change)` runs (same path the authed `approvals_approve` tool uses). Mutation lands. `mcp_pending_changes.status='approved'`, `applied_at=now`. |

### Reject side-effects

All entity types: link → `rejected`. **Zero side-effects on the entity.** No publish, no apply, no version bump.

### When does each link type appear?

- **`linkType='entity'`** — when the API key (or OAuth session) does NOT have `require_cms_approval=true`. The mutation lands as a draft immediately and the link points at the draft entity. Reviewer approves to publish.
- **`linkType='pending_change'`** — when the calling API key has `require_cms_approval=true`. The MCP tool stages the mutation into `mcp_pending_changes` and returns `{ pending: true, pendingId, approval: { url, ... } }`. Reviewer approves to materialize the staged mutation.

---

## 4. Forking — what gets cloned

| Tool | Copies | Adds | Notes |
|---|---|---|---|
| `posts_fork` | All blocks, excerpt, SEO, postType, website binding | `parent_post_id` | `published=false` on the fork |
| `decks_fork` | All slides, theme, branding profile | `parent_deck_id` | `status='draft'` on the fork |
| `email_campaigns_fork` | Content (blocks/html), subject, from/reply-to, listId | `parent_campaign_id` | `status='draft'` + send counters reset to 0 |
| `block_templates_fork` | All fields → `draft.*` with `pendingCreate=true`. Live fields hold the original's content until approval. | `parent_template_id` | Slug gets a unique `-fork-<id>` suffix to avoid collisions |

**Parent isolation is real** — verified by approving deck-fork 351 and confirming deck 350's `updated_at` did NOT change. Approve a fork to ship its variant; the parent stays as-is.

**There is no merge** — the model is last-write-wins. If you fork → edit → approve, the fork becomes live as a new entity. The parent remains its own entity. No DAG of edits, no rebasing.

---

## 5. Iteration model — fresh URL per update

This was the most surprising finding from the test run, and the three skill docs have been corrected:

> **Every `posts_update` / `decks_update` / `email_campaigns_update` mints a NEW approval URL.**

The old URL stays in whatever state it's in (`pending`, `approved`, `rejected`). The new URL supersedes it for review purposes. Always hand the user the URL that came back in the latest tool response, not the one you remember from earlier.

Exception: `decks_replace_slides` does NOT mint a new URL — it only mutates the slides array. If a pending approval URL already exists on the deck, that URL keeps pointing at the same deck and the reviewer sees the latest draft state when they open it.

---

## 6. Known issues / gotchas (real bugs surfaced during the test run)

1. **`sites_update.brandingProfileId` tool schema** is `{}` (any type), but the zod validator on the server requires `number`. Calls with a number arg are coerced to string by the MCP transport and rejected. Workaround: set the profile's `isDefault: true` instead.
2. **Email renderer drops `email-header.logoText` and `email-footer.tagline`.** The fields are accepted by `email_campaigns_create` but ignored by `renderBlocksToEmailHtml`. Pass an image-based logo via `logoUrl` if you need a branded header.
3. **Email renderer concatenates default + custom styles without deduping.** Each paragraph gets two `color:` declarations. Browsers honor last-wins, but the inline CSS is messy.
4. **OAuth consent page had a dual `active_client_id` input bug** — hidden + select with the same name, FormData picked the hidden one and ignored the dropdown choice. Fixed during this session (`app/oauth/authorize/page.tsx`).
5. **Slide-promotion-on-approve was missing.** Approving a deck flipped `status='published'` but left every slide in draft. Fixed by extracting publish helpers to `lib/mcp/decks-publish.ts` and wiring `applyPublishAllToSlides` into the approval route's `pitch_deck` case.

---

## 7. The five files you need to know

| File | What it does |
|---|---|
| `lib/mcp/approval-links.ts` | `createApprovalLink`, `mintLinkForResult`, `lookupApprovalLink` (auto-expires on GET), `recordReview`, `approvalEnvelope`. Single source of truth for the mint-and-review primitive. |
| `app/api/approve/[token]/route.ts` | Public route. GET returns the link. POST `{action, reviewerName, ...}` runs the side-effect and records the review. All 5 approve side-effects live here. |
| `app/approve/[token]/page.tsx` + `ApprovalReviewer.tsx` | The reviewer UI. Server component loads the link + entity; client component renders the preview + approve/reject modal. |
| `lib/mcp/decks-publish.ts` | `publishOneSlide`, `applyPublishToSlides`, `applyPublishAllToSlides`. Shared between `decks_publish_*` MCP tools and the approval route. |
| `.sd/config.json` | The per-project bootstrap snapshot written by `sd-init`. All four content skills read it first. |

---

## 8. Operational runbook — common commands

### Drive the local dev server

```bash
cd ~/simplerdevelopment/.claude/worktrees/serene-lamarr-729c5e/simplerdevelopment2026
bun dev > /tmp/sd-dev.log 2>&1 &
tail -f /tmp/sd-dev.log
```

### Talk to the local MCP from Claude Desktop

The `simplerdevelopment-local` server is wired in `~/Library/Application Support/Claude/claude_desktop_config.json` and points at `http://localhost:3000/api/mcp` with `--allow-http`. `mcp-remote` handles DCR + OAuth automatically. **OAuth client choice is the dropdown on `/oauth/authorize`** — pick the right tenant or you'll authenticate as your default client.

### Drive the approval flow without the browser

Test harness at `/tmp/sd-approve.ts`:

```bash
bun /tmp/sd-approve.ts <64-hex-token> get
bun /tmp/sd-approve.ts <token> approve "Reviewer Name" "reviewer@example.com" "LGTM"
bun /tmp/sd-approve.ts <token> reject  "Reviewer Name" "" "Needs work"
```

### Inspect approval state

```bash
psql -d simplerdev_local_20260514 -c "
SELECT entity_type, entity_id, status, reviewer_name, reviewed_at
FROM mcp_approval_links
WHERE client_id = 104
ORDER BY id DESC LIMIT 10;
"
```

### Run the integration tests

```bash
cd ~/simplerdevelopment/.claude/worktrees/serene-lamarr-729c5e/simplerdevelopment2026
bun test:integration:local -- tests/integration/api/approve/
```

The new test file at `tests/integration/api/approve/approval-links.test.ts` covers GET 404 paths, all 5 approve side-effects, reject, and the 4 error paths. (Pending-change side-effect mocks `applyPendingChange` per the existing test convention.)

### Typecheck after editing the approval lib or route

```bash
cd ~/simplerdevelopment/.claude/worktrees/serene-lamarr-729c5e/simplerdevelopment2026
bunx tsc --noEmit
```

Don't run with a filename — it loses tsconfig context and reports false positives.

### Toggle the gated-approval flow on an API key

```sql
-- Create a new key that requires CMS approval
INSERT INTO portal_api_keys
  (client_id, user_id, name, key_hash, key_preview, scopes, active, require_cms_approval)
VALUES (104, 181, 'My Gated Key', '<sha256-hex>', 'sd_mcp_xxx…yyyy', '["*"]', true, true);

-- Or flip an existing key
UPDATE portal_api_keys SET require_cms_approval = true WHERE id = N;
```

---

## 9. Best practices when authoring with these skills

1. **Run `sd-init` first.** Don't try to remember `clientId` and `defaultSiteId` between turns — the config file is cheap and authoritative.
2. **Reuse before invent.** `inventory.blockTemplates` in `.sd/config.json` has 10 production-tested templates. Match a category before authoring raw blocks. Templates currently available: `hero-gradient-cta`, `services-grid-3col`, `cta-banner`, `faq-section`, `stats-row`, `testimonial-quote`, `two-col-text-image`, `featured-left-image`, `landing-page-section`, `blog-post-intro`.
3. **Lean on the brand profile.** `valueProposition` should appear (paraphrased) in every hero. `keyDifferentiators` anchor the feature section. `toneOfVoice` and `writingStyle` set the register — copy that ignores them is the #1 signal of AI-slop output.
4. **Concrete > vague.** Real numbers, real competitor names, real differentiation. "5+ SaaS tools replaced" beats "many tools." "Days, not months" beats "fast launches."
5. **Pair eyebrow + heading.** Branded sections always lead with a small uppercase eyebrow (`type: 'text'`, fontSize 11–13px, letterSpacing 0.18em, color = accent) followed by a heading. Lone headings look unbranded.
6. **Hero hygiene.** Populate every field (`title`, `subtitle`, `description`, `ctaText`, `ctaLink`, ideally `secondaryCta*`). A title-only hero is a hero-shaped white box.
7. **Set SEO.** `seoTitle` + `seoDescription` on every page. `noIndex: true` for drafts you only want to share via the approval URL.
8. **Hand back the approval URL.** Don't bury it. Lead the response with it: "Approval URL: https://..." That's what the user does next.
9. **Don't auto-send emails.** Approval ≠ send. Always print a reminder line ("Approval will mark the campaign ready; run `email_campaigns_send` to actually ship it").
10. **Fork for variants, update for fixes.** A typo fix is an update. A "let's try a B-test" is a fork. The mental model is: fork = parallel branch with its own review cycle; update = same artifact, fresh review.

---

## 10. What's verified vs what's not

| Concern | Status |
|---|---|
| `sd-init` → produces `.sd/config.json` with brand snapshot + inventory | ✅ verified |
| `sd-create-page` → posts_create with 13 well-formed blocks + approval URL | ✅ verified |
| `sd-create-deck` → decks_create + replace_slides + brand-theme inheritance | ✅ verified |
| `sd-create-email` → email_campaigns_create + blocks rendered to HTML + Resend delivery | ✅ verified (real email landed at info@danielpcoyle.com) |
| Approve post → published=true, link approved | ✅ verified |
| Approve deck → status=published + slide drafts promoted | ✅ verified (after route fix) |
| Approve email → link approved, status untouched | ✅ verified |
| Approve block_template → draft promoted, version bumped | ✅ verified |
| Approve pending_change → applyPendingChange runs, mutation lands | ✅ verified |
| Reject any entity → status=rejected, entity untouched | ✅ verified |
| Edge cases (unknown / bad-shape token, double-approve, bad action, missing reviewer, expired) | ✅ all 6 pass |
| posts_fork / decks_fork / email_campaigns_fork / block_templates_fork | ✅ all 4 verified, parent_*_id set, fresh approval URL minted, parent isolation confirmed |
| Iteration: each update mints fresh approval URL | ✅ verified (3 skill docs corrected) |
| `app/approve/[token]/page.tsx` + `ApprovalReviewer.tsx` rendered in a browser | ❌ not visually inspected — needs human eyes on the page itself |
| Concurrent approval attempts (two reviewers both clicking approve at the same instant) | ❌ no race-condition test yet |
| `expires_at` set on mint (currently always null) — needs a default policy | ❌ TODO |
| Email open / click tracking pixels for approved campaigns | ❌ out of scope of this audit |

---

## 11. Recommended next steps (post-morning)

1. **Visit each approval URL in a browser** and confirm the renderer is sane (`/approve/<token>`).
   - Post 698: http://localhost:3000/approve/5341d36baf950a2be9916ae4611ce8e19f7e310ef54b1269520304953c422991 (now `approved` — should render in read-only)
   - Post 699: http://localhost:3000/approve/62467f42133b48a144541a442a8ce3043044e078a83337127cde6ff0a4ba2e29 (rejected)
   - Deck 350: http://localhost:3000/approve/d561053d17fb8813cc08bb3fb16ae97001dc5ca45355beec62aa723c4e34f821 (approved)
   - Email 36: http://localhost:3000/approve/c9e24141f8c7520b091beee712e7f633f1f608f22330bd02462c2844395cb518 (approved)
   - Template 11: http://localhost:3000/approve/8a40b88a1cf3fdaffda0772c3f2709be776fe7608302800f731408917283e38a (approved)
2. **Decide on a default `expires_at`** — recommend `now() + 14 days` on mint, with the option to pass `expiresInDays` on the create call. Long-lived public tokens are a footgun.
3. **Add a "what changed" diff** to the reviewer UI — for updates and pending-changes, show what's different from the live state. Otherwise the reviewer has to spot the diff themselves.
4. **Wire `decks_publish_all` into `decks_replace_slides` as a `publish: true` option** so authors can promote slides to live without minting a new approval URL via `decks_update`.
5. **Patch the two email-renderer bugs** (`logoText` / `tagline` dropped; double `color:` style). Both are in `lib/email/build-campaign-html.ts` or wherever `renderBlocksToEmailHtml` lives.
6. **Fix the `sites_update.brandingProfileId` schema** — change the empty `{}` to `z.number()` so the MCP transport doesn't coerce to string.
7. **Run the new integration test file** against your CI gate (`bun test:integration:local -- tests/integration/api/approve/`) once you've set up the test template DB.
